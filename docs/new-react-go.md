# EAT 系统重构路线：React + Go

> 从 Vanilla JS + Node.js 迁移到 React + Go 的完整修复与重构方案

---

## 一、现状概览

### 代码资产清单

| 层 | 文件数 | 总行数 | 核心文件 |
|----|--------|--------|----------|
| HTTP 路由 | 2 | 828 | `src/server/app.js`（36 个 API + 4 个静态资源） |
| 业务逻辑 | 12 | 12,151 | `task-service.js`（7,475 行，编排核心） |
| Agent 系统 | 3 | 1,330 | `built-in-agents.js`（1,104 行） |
| 数据库层 | 3 | 2,126 | `task-repository.js`（1,960 行） |
| 前端 UI | 5 | 13,687 | `app.js`（11,576 行单体 SPA） |
| 测试 | 21 | 10,988 | 覆盖 API / 服务 / E2E |
| 数据库 Schema | 1 | 202 | 7 表 + 8 枚举（Prisma） |
| **合计** | **47** | **~41,300** | |

### 待修复问题（来自 cc-problem.md）

| ID | 问题 | 严重度 | 根因 |
|----|------|--------|------|
| P1 | 重试计数竞态 | 高 | async TOCTOU |
| P2 | Watchdog/Exit 双杀 | 高 | Map 无保护并发访问 |
| P3 | Final Review 双触发 | 高 | check-then-act 非原子 |
| P4 | 数据库无事务 | 高 | read-modify-write 无保护 |
| P5 | 无背压控制 | 中 | Promise.allSettled 无限并发 |
| P6 | 循环依赖未检测 | 中 | 无拓扑排序 |
| P7 | Watchdog 盲区 | 中 | 仅监控输出间隔 |
| P8 | Metadata Map 泄漏 | 中 | 错误路径不清理 |
| P9 | 冲突解决非原子 | 中 | kill 窗口期脏写 |
| P10 | Sync 静默失败 | 中 | 错误被吞 |
| P11 | 锁序死锁风险 | 低-中 | 无强制锁获取顺序 |

---

## 二、总体架构

### 目标架构

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│  Vite + React 18 + TypeScript + Tailwind CSS     │
│  ┌──────────┬──────────┬──────────┬───────────┐  │
│  │Dashboard │TaskBoard │ PlanDAG  │ OpsPanel  │  │
│  │  Page    │  Page    │  Page    │  Page     │  │
│  └──────────┴──────────┴──────────┴───────────┘  │
│  State: Zustand  │  Real-time: SSE EventSource   │
└────────────┬─────────────────────┬───────────────┘
             │ REST JSON           │ SSE Stream
             ▼                     ▼
┌─────────────────────────────────────────────────┐
│                   Go Backend                     │
│  net/http + chi router + sqlc + go-sqlite3       │
│                                                  │
│  ┌────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ HTTP Layer │  │ Orchestrator│  │  Agent     │ │
│  │ (chi)      │──│ (goroutine  │──│  Manager   │ │
│  │ 36 routes  │  │  + context) │  │ (spawn)    │ │
│  └────────────┘  └──────┬──────┘  └───────────┘ │
│                         │                        │
│  ┌────────────┐  ┌──────┴──────┐  ┌───────────┐ │
│  │ EventBus   │  │ Git Service │  │  Sandbox   │ │
│  │ (channel)  │  │ (os/exec)   │  │  Manager   │ │
│  └────────────┘  └─────────────┘  └───────────┘ │
│                         │                        │
│                  ┌──────┴──────┐                  │
│                  │   SQLite    │                  │
│                  │  (sqlc +    │                  │
│                  │  go-sqlite3)│                  │
│                  └─────────────┘                  │
└─────────────────────────────────────────────────┘
```

### 技术选型

| 层 | 技术 | 选型理由 |
|----|------|----------|
| **前端框架** | React 18 + TypeScript | 声明式渲染，组件化拆解 11.5K 行单体 |
| **前端构建** | Vite | 秒级 HMR，开箱即用 |
| **前端状态** | Zustand | 轻量、无样板代码，适合中等复杂度 |
| **前端样式** | Tailwind CSS | 保留现有样式体系，零迁移成本 |
| **DAG 可视化** | @xyflow/react (React Flow) | 子任务依赖拓扑可视化 |
| **后端语言** | Go 1.22+ | goroutine + context 天然匹配进程编排 |
| **HTTP 路由** | chi | 轻量、符合 net/http 标准、中间件链 |
| **数据库** | SQLite + go-sqlite3 (CGO) | 保留嵌入式架构，零迁移 |
| **SQL 生成** | sqlc | 类型安全 SQL，编译期校验 |
| **进程管理** | os/exec + context | 超时/取消自动传播 |
| **并发控制** | sync.Mutex + semaphore | 编译期 + 运行时竞态检测 |
| **测试** | go test + testify + -race | 内建竞态检测器 |

---

## 三、分阶段实施路线

---

### Phase 0：紧急热修复（当前 Node.js 栈）

> 目标：不换栈，先修 P0 级 bug，稳定生产环境
> 周期：1-2 周

#### 0.1 数据库事务保护（修复 P4）

**文件**: `src/repositories/task-repository.js`

```javascript
// 修复前：read-modify-write 无事务
async updateSubTask(id, updates) {
  const existing = await this.findSubTaskById(id);
  this.db.prepare('UPDATE ...').run(...);
}

// 修复后：事务包裹 + 乐观锁
async updateSubTask(id, updates, expectedVersion) {
  return this.withTransaction(() => {
    const result = this.db.prepare(
      'UPDATE sub_tasks SET ..., version = version + 1 WHERE id = ? AND version = ?'
    ).run(..., id, expectedVersion);
    if (result.changes === 0) throw new OptimisticLockError();
  });
}
```

**数据库迁移**: SubTask / Task 表增加 `version INTEGER DEFAULT 0` 列。

#### 0.2 重试计数原子更新（修复 P1）

**文件**: `src/services/task-service.js:3689-3695`

```javascript
// 修复前
const subTask = await this.taskRepository.findSubTaskById(subTaskId);
if ((subTask.retryCount ?? 0) < MAX_AUTO_REWORK_RETRIES) { ... }

// 修复后：原子 CAS 更新
const updated = this.db.prepare(
  'UPDATE sub_tasks SET retry_count = retry_count + 1, status = ? ' +
  'WHERE id = ? AND retry_count < ? AND status IN (?, ?) RETURNING *'
).get('PENDING', subTaskId, MAX_AUTO_REWORK_RETRIES, 'FAILED', 'RUNNING');

if (!updated) return; // 已达上限或已被其他路径处理
```

#### 0.3 Final Review 同步标志位（修复 P3）

**文件**: `src/services/task-service.js:3984-4040`

```javascript
// 修复前：async check-then-add
if (this.pendingFinalReviews.has(taskId)) return;
this.pendingFinalReviews.add(taskId);

// 修复后：同步 CAS（JS 单线程保证 await 前同步代码不被打断）
#tryClaimFinalReview(taskId) {
  if (this.pendingFinalReviews.has(taskId)) return false;
  this.pendingFinalReviews.add(taskId); // 同步执行，无 await 间隙
  return true;
}

async #maybeStartFinalReview(taskId) {
  if (!this.#tryClaimFinalReview(taskId)) return;
  try { ... } finally { this.pendingFinalReviews.delete(taskId); }
}
```

#### 0.4 并发池限流（修复 P5）

**文件**: `src/services/task-service.js:3189-3203`

```javascript
// 安装：无需外部依赖，手写简单信号量
const MAX_CONCURRENT_WORKERS = 6;

// 修复后
const available = MAX_CONCURRENT_WORKERS - this.runningWorkerSessions.size;
const toLaunch = launchableSubTasks.slice(0, Math.max(0, available));
await Promise.allSettled(toLabel.map(st => this.#launchSubTask(...)));
```

#### 0.5 Metadata 清理（修复 P8）

**文件**: `src/services/task-service.js:3386-3398` catch 块

```javascript
catch (error) {
  // 新增：清理 metadata
  this.workerLaunchMetadata.delete(preparedSubTask.id);
  this.workerSessionMetadata.delete(session.id);
  // 原有逻辑...
  await this.taskRepository.updateSession(session.id, { ... });
  return this.#failSubTaskLaunch(...);
}
```

---

### Phase 1：React 前端重构

> 目标：将 11.5K 行单体 Vanilla JS SPA 拆解为 React 组件化应用
> 周期：3-4 周

#### 1.1 项目初始化（第 1 天）

```
frontend/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js        ← 复用现有 Tailwind 配置
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/                  ← API 调用层
│   │   ├── client.ts         ← fetch 封装 + 错误处理
│   │   ├── tasks.ts
│   │   ├── projects.ts
│   │   ├── agents.ts
│   │   └── types.ts          ← API 响应类型定义
│   ├── stores/               ← Zustand 状态管理
│   │   ├── task-store.ts
│   │   ├── project-store.ts
│   │   └── agent-store.ts
│   ├── hooks/
│   │   ├── useTaskSSE.ts     ← SSE 事件订阅 Hook
│   │   └── usePolling.ts
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── TaskCreatePage.tsx
│   │   ├── TaskListPage.tsx
│   │   ├── WorkspacePage.tsx
│   │   ├── MetricsPage.tsx
│   │   └── workspace/
│   │       ├── PlanView.tsx
│   │       ├── BoardView.tsx
│   │       ├── OpsView.tsx
│   │       └── PreviewPanel.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── TabNav.tsx
│   │   ├── task/
│   │   │   ├── TaskCard.tsx
│   │   │   ├── SubTaskCard.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   └── TaskTimeline.tsx
│   │   ├── plan/
│   │   │   ├── PlanDAG.tsx        ← React Flow DAG 可视化
│   │   │   ├── PlanEditor.tsx
│   │   │   └── DependencyEdge.tsx
│   │   ├── agent/
│   │   │   ├── AgentBadge.tsx
│   │   │   └── HealthIndicator.tsx
│   │   └── shared/
│   │       ├── Modal.tsx
│   │       ├── ConfirmDialog.tsx
│   │       └── LogViewer.tsx
│   └── i18n/
│       ├── zh-CN.ts
│       └── en-US.ts
```

#### 1.2 页面迁移顺序

按依赖关系和独立性排序：

| 顺序 | 页面 | 来源（app.js 行范围估算） | 复杂度 | 依赖 |
|:----:|------|--------------------------|--------|------|
| 1 | Dashboard | 项目列表 + Agent 状态 | 低 | API client |
| 2 | TaskCreate | 表单 + 项目选择 + 模板 | 中 | project-store |
| 3 | TaskList | 任务列表 + 筛选 + 归档 | 低 | task-store |
| 4 | Workspace/Board | 子任务看板 + 状态流转 | 高 | SSE + task-store |
| 5 | Workspace/Plan | DAG 编辑 + 依赖可视化 | 高 | React Flow |
| 6 | Workspace/Ops | 操作面板 + 日志流 | 高 | SSE |
| 7 | Metrics | 统计图表 | 低 | metrics API |

#### 1.3 SSE 实时集成

```typescript
// hooks/useTaskSSE.ts
export function useTaskSSE(taskId: string | null) {
  const updateTask = useTaskStore(s => s.updateFromEvent);

  useEffect(() => {
    if (!taskId) return;
    const es = new EventSource(`/api/tasks/${taskId}/events`);

    es.addEventListener('task:status', (e) => {
      updateTask(taskId, JSON.parse(e.data));
    });
    es.addEventListener('subtask:status', (e) => { ... });
    es.addEventListener('session:output', (e) => { ... });

    return () => es.close();
  }, [taskId]);
}
```

#### 1.4 DAG 可视化（直接暴露循环依赖 — 修复 P6 的 UI 侧）

```typescript
// components/plan/PlanDAG.tsx
import { ReactFlow, Background, Controls } from '@xyflow/react';

function PlanDAG({ subtasks }: { subtasks: SubTask[] }) {
  const { nodes, edges, hasCycle } = useMemo(
    () => buildDAGLayout(subtasks), [subtasks]
  );

  return (
    <>
      {hasCycle && <CycleWarningBanner />}
      <ReactFlow nodes={nodes} edges={edges}>
        <Background />
        <Controls />
      </ReactFlow>
    </>
  );
}
```

---

### Phase 2：Go 后端重写

> 目标：用 Go 重写后端，从根本上解决并发安全问题
> 周期：6-10 周

#### 2.1 项目结构

```
backend/
├── cmd/
│   └── eat/
│       └── main.go                ← 入口
├── internal/
│   ├── api/                       ← HTTP 层
│   │   ├── router.go              ← chi 路由注册
│   │   ├── middleware.go           ← 日志 / CORS / Recovery
│   │   ├── task_handler.go        ← Task API handlers
│   │   ├── project_handler.go
│   │   ├── agent_handler.go
│   │   ├── subtask_handler.go
│   │   ├── integration_handler.go
│   │   ├── system_handler.go
│   │   ├── metrics_handler.go
│   │   └── sse.go                 ← SSE 推送实现
│   ├── domain/                    ← 领域模型 + 状态机
│   │   ├── task.go                ← Task 聚合根
│   │   ├── subtask.go             ← SubTask 实体 + 状态枚举
│   │   ├── plan.go                ← Plan 值对象
│   │   ├── merge_record.go
│   │   ├── mailbox.go
│   │   ├── session.go
│   │   └── errors.go             ← 统一错误码
│   ├── orchestrator/              ← 编排核心（替代 task-service.js）
│   │   ├── orchestrator.go        ← 主编排器
│   │   ├── scheduler.go           ← 依赖调度 + 拓扑排序
│   │   ├── worker_manager.go      ← Worker 生命周期
│   │   ├── watchdog.go            ← 增强型看门狗
│   │   ├── merge_engine.go        ← 合并/冲突处理
│   │   ├── review_engine.go       ← 审查流程
│   │   └── integration_engine.go  ← 集成测试编排
│   ├── agent/                     ← Agent 抽象 + 内建实现
│   │   ├── registry.go
│   │   ├── contract.go
│   │   ├── claude_adapter.go
│   │   ├── codex_adapter.go
│   │   └── gemini_adapter.go
│   ├── git/                       ← Git 操作封装
│   │   ├── commands.go            ← 底层 exec 封装
│   │   ├── workspace.go           ← Worktree 管理
│   │   └── merge.go               ← 合并/Rebase 操作
│   ├── store/                     ← 数据持久化
│   │   ├── sqlite.go              ← 连接管理
│   │   ├── migrations/            ← SQL 迁移文件
│   │   ├── queries/               ← sqlc SQL 文件
│   │   │   ├── tasks.sql
│   │   │   ├── subtasks.sql
│   │   │   ├── projects.sql
│   │   │   ├── sessions.sql
│   │   │   ├── merge_records.sql
│   │   │   └── mailbox.sql
│   │   └── db/                    ← sqlc 生成代码（自动）
│   ├── eventbus/                  ← 事件总线
│   │   └── bus.go                 ← channel-based pub/sub
│   └── sandbox/                   ← Docker 沙箱
│       └── manager.go
├── go.mod
├── go.sum
├── sqlc.yaml
├── Makefile
└── Dockerfile
```

#### 2.2 模块重写顺序与问题修复映射

按依赖关系自底向上：

```
Week 1-2:  基础层
  ├── store/       ← SQLite + sqlc + 迁移（复用 Prisma schema 转 SQL）
  ├── domain/      ← 类型安全枚举 + 状态机
  └── git/         ← os/exec 封装 git 命令
                     修复 P9: kill 后强制 git checkout -- . 清理

Week 3-4:  Agent + EventBus
  ├── agent/       ← Registry + 3 个内建适配器
  ├── eventbus/    ← channel-based（替代 EventEmitter）
  └── sandbox/     ← Docker 管理

Week 5-7:  编排核心（最关键）
  ├── scheduler.go
  │     修复 P6: 拓扑排序 + 环检测（Kahn 算法）
  │     修复 P5: semaphore 并发池
  ├── worker_manager.go
  │     修复 P1: 原子重试（SQL UPDATE WHERE + mutex）
  │     修复 P2: context.WithCancel 统一生命周期
  │     修复 P8: defer 自动清理 metadata
  │     修复 P10: Result 返回值强制处理
  ├── watchdog.go
  │     修复 P7: /proc/pid/stat 读取 CPU/RSS
  ├── merge_engine.go
  │     修复 P9: 原子冲突解决
  │     修复 P11: 固定锁顺序（project → task）
  └── review_engine.go
        修复 P3: sync.Once 保证单次触发

Week 8-9:  HTTP 层
  ├── router.go    ← 36 个端点注册
  ├── *_handler.go ← 请求解析 + 响应序列化
  └── sse.go       ← SSE 推送

Week 10:   集成 + 冒烟测试
  ├── 迁移脚本：旧 SQLite → 新 SQLite（schema 兼容）
  ├── 并行运行旧/新后端，对比 API 响应
  └── go test -race ./... 全量竞态检测
```

#### 2.3 关键模块设计示例

##### 2.3.1 Worker 生命周期管理（修复 P1/P2/P7/P8）

```go
// internal/orchestrator/worker_manager.go

type WorkerManager struct {
    mu       sync.Mutex
    workers  map[string]*WorkerEntry   // subTaskID → entry
    sem      *semaphore.Weighted       // 并发池（修复 P5）
    store    *store.Queries
    eventBus *eventbus.Bus
}

type WorkerEntry struct {
    cancel    context.CancelFunc
    startedAt time.Time
    pid       int
}

func (wm *WorkerManager) Launch(ctx context.Context, subtask domain.SubTask) error {
    // 修复 P5：获取信号量令牌
    if err := wm.sem.Acquire(ctx, 1); err != nil {
        return fmt.Errorf("worker pool full: %w", err)
    }

    // 修复 P1：原子 CAS 更新重试计数
    updated, err := wm.store.ClaimSubTaskForExecution(ctx, store.ClaimSubTaskForExecutionParams{
        ID:            subtask.ID,
        MaxRetryCount: MaxAutoReworkRetries,
    })
    if err != nil {
        wm.sem.Release(1)
        return err // 已达上限或已被其他 goroutine 抢占
    }

    // 修复 P2：context 统一生命周期
    workerCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)

    entry := &WorkerEntry{cancel: cancel, startedAt: time.Now()}

    wm.mu.Lock()
    wm.workers[subtask.ID] = entry
    wm.mu.Unlock()

    // 修复 P8：defer 保证清理
    go func() {
        defer wm.sem.Release(1)
        defer func() {
            wm.mu.Lock()
            delete(wm.workers, subtask.ID)
            wm.mu.Unlock()
        }()
        defer cancel()

        err := wm.runWorker(workerCtx, updated, entry)
        wm.handleWorkerExit(subtask.ID, err)
    }()

    return nil
}
```

对应 sqlc 查询（修复 P1 + P4）：

```sql
-- queries/subtasks.sql

-- name: ClaimSubTaskForExecution :one
UPDATE sub_tasks
SET status = 'RUNNING',
    retry_count = retry_count + 1,
    version = version + 1
WHERE id = ?
  AND retry_count < ?
  AND status IN ('PENDING', 'FAILED')
RETURNING *;
```

##### 2.3.2 增强型 Watchdog（修复 P7）

```go
// internal/orchestrator/watchdog.go

func (w *Watchdog) scan() {
    w.manager.mu.Lock()
    entries := maps.Clone(w.manager.workers) // 快照
    w.manager.mu.Unlock()

    for subTaskID, entry := range entries {
        // 原有：空闲 + 硬超时检测
        if time.Since(entry.startedAt) > HardTimeout {
            entry.cancel() // context 取消自动传播
            continue
        }

        // 修复 P7：进程存活 + 资源监控
        if entry.pid > 0 {
            stats, err := readProcStat(entry.pid)
            if err != nil {
                // 进程已不存在 — zombie 检测
                entry.cancel()
                continue
            }
            if stats.RSS > MaxWorkerMemoryBytes {
                w.eventBus.Publish(subTaskID, "watchdog:oom", stats)
                entry.cancel()
                continue
            }
            if stats.CPUPercent < 0.1 && time.Since(entry.lastOutputAt) > IdleThreshold {
                // CPU 空闲 + 无输出 — 真正 hang 住
                entry.cancel()
                continue
            }
        }
    }
}

func readProcStat(pid int) (ProcStats, error) {
    data, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
    // ... 解析 RSS, CPU 等字段
}
```

##### 2.3.3 拓扑排序 + 环检测（修复 P6）

```go
// internal/orchestrator/scheduler.go

func ValidateDependencyGraph(subtasks []domain.SubTask) error {
    // Kahn's algorithm
    inDegree := make(map[string]int)
    adj := make(map[string][]string)

    for _, st := range subtasks {
        inDegree[st.BranchSuffix] += 0
        for _, dep := range st.Dependencies {
            adj[dep] = append(adj[dep], st.BranchSuffix)
            inDegree[st.BranchSuffix]++
        }
    }

    var queue []string
    for node, deg := range inDegree {
        if deg == 0 {
            queue = append(queue, node)
        }
    }

    visited := 0
    for len(queue) > 0 {
        node := queue[0]
        queue = queue[1:]
        visited++
        for _, next := range adj[node] {
            inDegree[next]--
            if inDegree[next] == 0 {
                queue = append(queue, next)
            }
        }
    }

    if visited != len(inDegree) {
        // 有环 — 找出参与环的节点
        var cycleNodes []string
        for node, deg := range inDegree {
            if deg > 0 {
                cycleNodes = append(cycleNodes, node)
            }
        }
        return fmt.Errorf("circular dependency detected: %v", cycleNodes)
    }
    return nil
}
```

##### 2.3.4 固定锁顺序（修复 P11）

```go
// internal/orchestrator/merge_engine.go

// 锁层级：Level 0 (project git) → Level 1 (task mainline)
// 所有代码路径必须按此顺序获取

type MergeEngine struct {
    projectLocks sync.Map  // projectPath → *sync.Mutex  (Level 0)
    taskLocks    sync.Map  // taskID → *sync.Mutex       (Level 1)
}

func (me *MergeEngine) SyncSubTaskToMainline(ctx context.Context, projectPath, taskID, subTaskID string) error {
    // 始终先获取 project 锁（Level 0），再获取 task 锁（Level 1）
    projectMu := me.getOrCreateLock(&me.projectLocks, projectPath)
    projectMu.Lock()
    defer projectMu.Unlock()

    taskMu := me.getOrCreateLock(&me.taskLocks, taskID)
    taskMu.Lock()
    defer taskMu.Unlock()

    return me.doMerge(ctx, projectPath, taskID, subTaskID)
}
```

##### 2.3.5 Review 单次触发（修复 P3）

```go
// internal/orchestrator/review_engine.go

type ReviewEngine struct {
    pending sync.Map // taskID → *sync.Once
}

func (re *ReviewEngine) MaybeStartFinalReview(ctx context.Context, taskID string) {
    once, _ := re.pending.LoadOrStore(taskID, &sync.Once{})
    once.(*sync.Once).Do(func() {
        defer re.pending.Delete(taskID)
        re.runFinalReview(ctx, taskID)
    })
}
```

##### 2.3.6 SSE 事件推送

```go
// internal/api/sse.go

func (h *Handler) HandleTaskEvents(w http.ResponseWriter, r *http.Request) {
    taskID := chi.URLParam(r, "taskId")
    flusher, ok := w.(http.Flusher)
    if !ok {
        http.Error(w, "streaming not supported", 500)
        return
    }

    w.Header().Set("Content-Type", "text/event-stream")
    w.Header().Set("Cache-Control", "no-cache")
    w.Header().Set("Connection", "keep-alive")
    fmt.Fprint(w, ": connected\n\n")
    flusher.Flush()

    ch := h.eventBus.Subscribe(taskID)
    defer h.eventBus.Unsubscribe(taskID, ch)

    ticker := time.NewTicker(15 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-r.Context().Done():
            return
        case event := <-ch:
            fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Name, event.JSON)
            flusher.Flush()
        case <-ticker.C:
            fmt.Fprint(w, ": keep-alive\n\n")
            flusher.Flush()
        }
    }
}
```

---

### Phase 3：系统强化

> 目标：在新栈基础上增强可观测性和健壮性
> 周期：2-4 周

#### 3.1 全量竞态检测

```bash
# CI 必跑，开发阶段常跑
go test -race -count=1 ./...
```

所有 P1/P2/P3 类竞态问题在测试阶段即可暴露。

#### 3.2 结构化日志 + 追踪

```go
// 每个 Worker goroutine 绑定追踪 ID
ctx = context.WithValue(ctx, "trace_id", uuid.New().String())
slog.InfoContext(ctx, "worker launched",
    "subtask_id", subtask.ID,
    "agent", subtask.AgentType,
    "retry", subtask.RetryCount,
)
```

#### 3.3 优雅关机

```go
// cmd/eat/main.go
quit := make(chan os.Signal, 1)
signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
<-quit

// 1. 停止接受新请求
server.Shutdown(ctx)
// 2. 等待运行中 Worker 完成（或 60s 超时）
orchestrator.GracefulStop(60 * time.Second)
// 3. 关闭数据库
db.Close()
```

#### 3.4 健康检查端点增强

```
GET /api/system/health
{
  "status": "healthy",
  "workers": { "running": 4, "pool_size": 6 },
  "db": "ok",
  "docker": "available",
  "uptime_seconds": 3600,
  "goroutines": 42
}
```

---

## 四、问题修复追踪矩阵

| 问题 ID | 描述 | Phase 0 (JS 热修) | Phase 2 (Go 重写) | 修复方式 |
|---------|------|:--:|:--:|----------|
| **P1** | 重试计数竞态 | ✅ | ✅ | SQL `UPDATE WHERE` 原子 CAS |
| **P2** | Watchdog/Exit 双杀 | — | ✅ | `context.WithCancel` 统一生命周期 |
| **P3** | Final Review 双触发 | ✅ | ✅ | 同步标志位 → `sync.Once` |
| **P4** | 数据库无事务 | ✅ | ✅ | `withTransaction` → sqlc 事务 |
| **P5** | 无背压控制 | ✅ | ✅ | 简单限流 → `semaphore.Weighted` |
| **P6** | 循环依赖未检测 | — | ✅ | Kahn 拓扑排序 + React Flow DAG |
| **P7** | Watchdog 盲区 | — | ✅ | `/proc/pid/stat` 进程级监控 |
| **P8** | Metadata Map 泄漏 | ✅ | ✅ | catch 清理 → `defer` 自动释放 |
| **P9** | 冲突解决非原子 | — | ✅ | kill 后 `git checkout -- .` 清理 |
| **P10** | Sync 静默失败 | — | ✅ | Go 多返回值 + errcheck 强制 |
| **P11** | 锁序死锁风险 | — | ✅ | 固定层级：project(L0) → task(L1) |

---

## 五、里程碑与验收标准

| 里程碑 | 周期 | 验收标准 |
|--------|------|----------|
| **M0: 热修复完成** | 第 2 周 | P1/P3/P4/P5/P8 修复，现有测试全通过 |
| **M1: React 前端上线** | 第 6 周 | 7 个页面完成，SSE 实时更新，DAG 可视化 |
| **M2: Go 基础层** | 第 8 周 | store + domain + git + agent 模块，单元测试覆盖 |
| **M3: Go 编排核心** | 第 12 周 | orchestrator 模块完成，`go test -race` 零告警 |
| **M4: Go API 层** | 第 14 周 | 36 个端点完成，与 React 前端联调通过 |
| **M5: 全量切换** | 第 16 周 | 旧后端下线，E2E 测试全通过，性能基线达标 |
| **M6: 强化完成** | 第 18 周 | 日志/追踪/健康检查/优雅关机完成 |

---

## 六、风险缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| Go 重写周期超预期 | 高 | Phase 0 热修先稳定现有系统，Go 重写不阻塞生产 |
| Prompt 模板迁移繁琐 | 中 | 考虑将 prompt 模板外置为 `.tmpl` 文件，Go `text/template` 加载 |
| SQLite 并发写瓶颈 | 低 | 开启 WAL 模式 + busy_timeout，单实例场景足够 |
| Agent CLI 输出解析兼容性 | 中 | 保留现有解析逻辑的测试用例，Go 侧逐一对照移植 |
| 前后端并行开发冲突 | 低 | Phase 1 前端对接现有 Node.js API，Phase 2 Go 保持 API 契约不变 |
