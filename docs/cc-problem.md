# EAT 系统隐性问题分析报告

> 基于实际代码分析，非文档推断。核心文件：`src/services/task-service.js`（7475行）、`src/repositories/task-repository.js`、`src/services/agent-runtime.js`

---

## 一、高严重度

### 1.1 并发竞态条件 — 重试计数突破上限

**位置**: `task-service.js:3689-3695` & `5498-5501`

Watchdog 超时和 Worker 正常退出两条路径都会读取 `retryCount` 后决定是否自动重试：

```javascript
const subTask = await this.taskRepository.findSubTaskById(subTaskId); // 读
if ((subTask.retryCount ?? 0) < MAX_AUTO_REWORK_RETRIES) {           // 判
  await this.#autoReworkSubTask(taskId, subTaskId, subTask);          // 写
}
```

两条路径并发执行时，都读到 `retryCount=1`，各自触发重试，实际重试 3 次突破 `MAX_AUTO_REWORK_RETRIES=2` 的限制。

**根因**: 异步 read-check-write 非原子操作，`await` 点让出执行权形成 TOCTOU 窗口。

### 1.2 并发竞态条件 — Watchdog 与 Worker Exit 双杀

**位置**: `task-service.js:3375-3379` & `5454-5478`

Worker 自然退出的同时 Watchdog 判定超时，两者同时操作 `runningWorkerSessions` Map：

- `#handleWorkerExit` 删除 Map 条目（line 3653）
- `#killAndRetryWorker` 也删除同一条目（line 5478）
- `exitPromise.resolve()` 可能访问已删除条目

**后果**: 重复清理、状态混乱，极端情况下触发未捕获异常。

### 1.3 并发竞态条件 — Final Review 双触发

**位置**: `task-service.js:3984-4040`，被 6+ 处调用

```javascript
if (this.pendingFinalReviews.has(taskId)) return; // check
this.pendingFinalReviews.add(taskId);              // add — 非原子！
```

两条异步路径同时通过 `has()` 检查，启动两个 review session，产生矛盾的审查结论。

### 1.4 数据库无事务保护 — 更新丢失

**位置**: `task-repository.js:223-277`（updateTask）、`960-1035`（updateSubTask）

采用 read-modify-write 模式但未包裹事务：

```
Thread A: 读 subtask(status=BLOCKED, retryCount=1)
Thread B: 读 subtask(status=BLOCKED, retryCount=1)  ← 脏读
Thread A: 写 (status=PENDING, retryCount=2)
Thread B: 写 (status=PENDING, retryCount=2)          ← 更新丢失
```

代码中存在 `withTransaction` 方法（line 1783），但 task-service 中**从未使用过**。

---

## 二、中严重度

### 2.1 无并发背压控制 — 资源耗尽风险

**位置**: `task-service.js:3189-3203`

```javascript
await Promise.allSettled(launchableSubTasks.map(st => this.#launchSubTask(...)));
```

所有可执行子任务一次性并发启动。若任务有 50 个独立子任务，50 个 Agent 进程同时 spawn，每个 500MB+ 内存，瞬间耗尽系统资源。无排队、无限流、无资源感知调度。

### 2.2 循环依赖未检测 — 子任务永久卡死

**位置**: `task-service.js:6764-6776`

依赖满足检查只做正向遍历，无环检测。如果 Lead Agent 生成的计划中 SubTask A 依赖 B、B 依赖 A，两者永久卡在 BLOCKED 状态，无错误提示、无超时机制。

### 2.3 Watchdog 监控盲区

**位置**: `task-service.js:5447-5468`

只监控硬超时（30min）和空闲超时（5min 无输出），检测不到：

- **死循环有输出**: Worker 循环中持续 `console.log` → `lastOutputAt` 持续刷新，永不触发超时
- **Zombie 进程**: 进程退出但 `onExit` 回调未触发 → 永驻 `runningWorkerSessions`
- **内存泄漏**: Worker 内存缓慢增长至 OOM → 无内存/CPU 监控

### 2.4 错误路径资源泄漏 — Metadata Map 不清理

**位置**: `task-service.js:3328-3398`

Worker 启动时先写入 metadata Map，再 spawn session：

```javascript
this.workerLaunchMetadata.set(subTaskId, metadata);    // line 3328
this.workerSessionMetadata.set(session.id, metadata);   // line 3329
const runtime = await agentFactory.spawnSession({...}); // line 3336 ← 可能抛异常
```

`spawnSession` 失败时 catch 块只清理 session 记录和 `pendingWorkerLaunches`，两个 metadata Map 的条目永不清理，随失败次数累积形成内存泄漏。

### 2.5 合并冲突解决非原子性

**位置**: `task-service.js:5379-5430`

冲突自动解决设 90s 超时后 kill：

```javascript
setTimeout(() => { timedOut = true; runtime.kill(); }, 90_000);
```

kill 信号与进程实际停止之间存在窗口期，Agent 可能已部分写入冲突解决结果到磁盘。后续检查 `timedOut` 返回 `{ok: false}` 并 abort merge，但文件系统可能已被修改，导致后续 merge 基于脏状态。

### 2.6 Sync 失败静默返回 — 状态不一致

**位置**: `task-service.js:3709-3719`

```javascript
const syncResult = await this.#syncSubTaskIntoTaskMainline(taskId, subTaskId);
if (!syncResult.ok) {
  return;  // 静默返回！不清理、不报错、不通知
}
```

子任务停留在不一致的中间状态（分支已创建但合并失败），后续 `#progressDependencySchedule` 基于过期状态做决策。

---

## 三、低-中严重度

### 3.1 锁嵌套潜在死锁风险

**位置**: `task-service.js:3723-3744`

```javascript
#syncSubTaskIntoTaskMainline
  → withTaskMainlineSyncLock(taskId)      // Lock 1
    → withProjectGitLock(projectPath)     // Lock 2
```

当前代码路径锁顺序一致，但两种锁无强制顺序约束。未来新代码路径若以反序获取锁（先 project → 后 task），将形成 AB-BA 死锁。典型"定时炸弹"。

---

## 四、根因总结

系统是单进程 Node.js（事件循环天然串行），开发时容易忽视 **异步操作间的 TOCTOU 窗口**。虽然 JS 没有真正的多线程，但每个 `await` 点就是让出执行权的点，多个异步流在这些点交叉即产生竞态。

## 五、建议修复优先级

| 优先级 | 问题 | 建议方案 |
|--------|------|----------|
| P0 | 数据库无事务 | 关键路径使用 `withTransaction` + 乐观锁（版本号） |
| P0 | 重试计数竞态 | `UPDATE ... WHERE retryCount = ? AND status = ?` 原子更新 |
| P0 | Final Review 双触发 | 用同步标志位 + 立即设置（无 await 间隙） |
| P1 | 无背压控制 | 引入并发池（如 p-limit），限制同时运行 Worker 数 |
| P1 | 循环依赖 | Plan 阶段拓扑排序检测环 |
| P1 | Watchdog 盲区 | 增加进程存活探针 + 内存/CPU 阈值监控 |
| P2 | Metadata 泄漏 | spawnSession catch 块中清理 Map 条目 |
| P2 | Sync 静默失败 | 失败时标记 subtask 状态 + 发布事件通知 |
| P2 | 冲突解决原子性 | kill 后强制 `git checkout -- .` 清理工作区 |
| P3 | 锁序风险 | 文档约定锁获取顺序，或引入层级锁抽象 |
