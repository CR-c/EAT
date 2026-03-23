# EAT 后端技术选型深度分析

> 基于实际代码工作负载特征分析，非泛泛的技术对比

---

## 一、项目工作负载画像

通过代码分析得出的关键特征：

| 维度 | 数据 | 含义 |
|------|------|------|
| **I/O 占比** | 60-70% 时间等子进程，20-25% 文件 I/O | **I/O 密集型**，非 CPU 密集型 |
| **子进程管理** | 27 处 spawn 调用，18 个 git 函数 | 核心工作是**进程编排** |
| **字符串/Prompt** | ~1,100+ LOC 模板拼接 | 大量动态字符串构建 |
| **并发追踪** | 14 个 in-memory Map/Set，4-12 并发 Worker | **有状态单实例**编排器 |
| **实时推送** | SSE 事件流，15s 心跳，per-task 订阅 | 需要长连接 + 事件驱动 |
| **外部集成** | Git CLI、Docker、Agent CLI（Claude/Codex/Gemini） | 重度依赖 shell 子进程 |
| **数据库** | SQLite 同步 API，无复杂查询 | 嵌入式即可，无需分布式 |
| **动态性** | Agent 启动时注册，无热加载需求 | 插件体系简单 |
| **长尾操作** | Worker 硬超时 30min，空闲超时 5min | 必须支持长时运行编排 |

**一句话总结**: 这是一个 **I/O 密集型的有状态进程编排器**，核心挑战是安全地管理大量并发子进程生命周期，而非计算性能。

---

## 二、候选技术栈对比

### 候选方案

| 方案 | 技术栈 | 代表框架 |
|------|--------|----------|
| A | **Node.js + TypeScript**（现有栈增强） | Fastify / Hono |
| B | **Go** | net/http + goroutine |
| C | **Rust** | Axum + Tokio |
| D | **Elixir/Erlang（OTP）** | Phoenix |
| E | **Python（异步）** | FastAPI + asyncio |

### 2.1 逐维度评分

#### 子进程管理能力（权重: ★★★★★ — 核心需求）

| 技术 | 评分 | 分析 |
|------|:----:|------|
| **Go** | ⬛⬛⬛⬛⬛ | `os/exec` + goroutine 天然适合。每个 Worker 一个 goroutine，`context.WithTimeout` 精确控制生命周期，`cmd.Process.Signal` 精细信号控制。**最佳** |
| **Rust** | ⬛⬛⬛⬛⬜ | `tokio::process::Command` 强大，但 async 生命周期管理复杂，`Pin`/`lifetime` 增加心智负担 |
| **Node.js+TS** | ⬛⬛⬛⬜⬜ | `child_process` 可用但粗粒度，缺乏 cgroup/信号精细控制，zombie 进程检测弱 |
| **Elixir** | ⬛⬛⬛⬛⬜ | Port/System.cmd 可用，OTP Supervisor 天然支持进程监控和重启，但 CLI 子进程管理非其强项 |
| **Python** | ⬛⬛⬜⬜⬜ | `asyncio.create_subprocess_exec` 可用但 GIL 限制真并行，subprocess 管理粗糙 |

#### 并发安全性（权重: ★★★★★ — 直接解决已知 bug）

| 技术 | 评分 | 分析 |
|------|:----:|------|
| **Rust** | ⬛⬛⬛⬛⬛ | 编译期消除数据竞争，`Arc<Mutex<>>` 强制保护共享状态。**最佳** |
| **Go** | ⬛⬛⬛⬛⬜ | `sync.Mutex` + `sync.Map` + race detector (`go run -race`)，运行时检测竞态 |
| **Elixir** | ⬛⬛⬛⬛⬜ | Actor 模型天然隔离状态，GenServer 串行化消息处理，从根本上消除共享可变状态 |
| **Node.js+TS** | ⬛⬛⬛⬜⬜ | 单线程避免真并发，但 await 交叉产生伪竞态（即当前 bug 根因） |
| **Python** | ⬛⬛⬜⬜⬜ | GIL 避免部分竞态，但 asyncio 同样有 await 交叉问题 |

#### 字符串/Prompt 构建便利性（权重: ★★★★☆）

| 技术 | 评分 | 分析 |
|------|:----:|------|
| **Node.js+TS** | ⬛⬛⬛⬛⬛ | 模板字符串 `` `${var}` `` 最自然，JSON 原生支持。**最佳** |
| **Python** | ⬛⬛⬛⬛⬛ | f-string + 多行字符串同样优秀 |
| **Go** | ⬛⬛⬛⬜⬜ | `fmt.Sprintf` + `text/template` 可用但繁琐，无插值语法糖 |
| **Elixir** | ⬛⬛⬛⬛⬜ | 字符串插值 `"#{var}"` + heredoc 良好 |
| **Rust** | ⬛⬛⬜⬜⬜ | `format!()` 可用但所有权让动态字符串拼接痛苦，1100 LOC 模板代码迁移成本高 |

#### 状态机建模能力（权重: ★★★★☆）

| 技术 | 评分 | 分析 |
|------|:----:|------|
| **Rust** | ⬛⬛⬛⬛⬛ | enum + match 穷举，编译期保证状态转换完备性。**最佳** |
| **Go** | ⬛⬛⬛⬜⬜ | iota 枚举 + switch，但无穷举检查，遗漏分支编译不报错 |
| **Elixir** | ⬛⬛⬛⬛⬜ | 模式匹配 + guard 可建模状态机，运行时报错而非编译期 |
| **Node.js+TS** | ⬛⬛⬛⬜⬜ | TS discriminated union + switch 可模拟，但运行时无保证 |
| **Python** | ⬛⬛⬜⬜⬜ | Enum 类可用但弱约束 |

#### 错误处理强制性（权重: ★★★★☆ — 解决静默失败问题）

| 技术 | 评分 | 分析 |
|------|:----:|------|
| **Rust** | ⬛⬛⬛⬛⬛ | `Result<T, E>` 必须处理，`#[must_use]` 编译警告。**最佳** |
| **Go** | ⬛⬛⬛⬛⬜ | 多返回值 `val, err := ...` 惯例强制检查（lint 可强制） |
| **Elixir** | ⬛⬛⬛⬜⬜ | `{:ok, val}` / `{:error, reason}` 模式匹配，但可被忽略 |
| **Node.js+TS** | ⬛⬛⬜⬜⬜ | try-catch 可选，Promise rejection 可被忽略（当前 bug 根因之一） |
| **Python** | ⬛⬛⬜⬜⬜ | 异常可被忽略，bare except 常见 |

#### 开发效率与迭代速度（权重: ★★★☆☆）

| 技术 | 评分 | 分析 |
|------|:----:|------|
| **Node.js+TS** | ⬛⬛⬛⬛⬛ | 零编译等待，热重载，JSON 原生，迁移成本最低 |
| **Python** | ⬛⬛⬛⬛⬜ | 快速迭代，但类型安全弱 |
| **Go** | ⬛⬛⬛⬛⬜ | 编译快（秒级），工具链简单，但模板代码多 |
| **Elixir** | ⬛⬛⬛⬜⬜ | 函数式范式学习曲线，生态较小 |
| **Rust** | ⬛⬛⬜⬜⬜ | 编译慢（分钟级），所有权学习曲线陡峭 |

#### 生态与人才池（权重: ★★★☆☆）

| 技术 | 评分 | 分析 |
|------|:----:|------|
| **Node.js+TS** | ⬛⬛⬛⬛⬛ | AI/LLM 生态最丰富（Anthropic SDK、OpenAI SDK 均 TS 优先） |
| **Python** | ⬛⬛⬛⬛⬛ | AI 领域事实标准，SDK 覆盖最全 |
| **Go** | ⬛⬛⬛⬛⬜ | 云原生强势，AI SDK 逐步完善 |
| **Rust** | ⬛⬛⬜⬜⬜ | AI SDK 少，人才稀缺 |
| **Elixir** | ⬛⬜⬜⬜⬜ | 小众语言，AI 生态几乎为零 |

---

## 三、综合评分

加权总分（满分 35）：

| 技术 | 进程管理(5) | 并发安全(5) | 字符串(4) | 状态机(4) | 错误处理(4) | 开发效率(3) | 生态(3) | **加权总分** |
|------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Go** | 5 | 4 | 3 | 3 | 4 | 4 | 4 | **27.0** |
| **Rust** | 4 | 5 | 2 | 5 | 5 | 2 | 2 | **25.5** |
| **Node.js+TS** | 3 | 3 | 5 | 3 | 2 | 5 | 5 | **24.5** |
| **Elixir** | 4 | 4 | 4 | 4 | 3 | 3 | 1 | **23.5** |
| **Python** | 2 | 2 | 5 | 2 | 2 | 4 | 5 | **20.5** |

---

## 四、深度分析 Top 3

### 🥇 Go — 最适合本项目

**为什么 Go 是最佳选择：**

本项目的核心本质是**进程编排器**（Process Orchestrator），而 Go 正是为这类场景设计的：

```go
// 当前 Node.js 痛点：spawn 后状态管理全靠 in-memory Map + 手动清理
// Go 的解法：goroutine + context 天然匹配

func (s *TaskService) launchWorker(ctx context.Context, subtask SubTask) error {
    // context 自动传播取消/超时，无需手动 watchdog
    ctx, cancel := context.WithTimeout(ctx, 30*time.Minute)
    defer cancel()

    cmd := exec.CommandContext(ctx, "claude", "--prompt", subtask.Prompt)

    // 进程退出时 context 自动取消，无需手动 Map.delete
    stdout, _ := cmd.StdoutPipe()

    go func() {
        scanner := bufio.NewScanner(stdout)
        for scanner.Scan() {
            s.eventBus.Publish(subtask.TaskID, "output", scanner.Text())
        }
    }()

    // 阻塞等待退出 —— goroutine 天然支持，不阻塞其他任务
    err := cmd.Wait()
    if ctx.Err() == context.DeadlineExceeded {
        return ErrWorkerTimeout
    }
    return err
}
```

**Go 解决已知问题的方式：**

| 问题 | Go 解法 |
|------|---------|
| 重试计数竞态 | `sync.Mutex` 保护 + `UPDATE WHERE` 原子 SQL |
| Watchdog/Exit 双杀 | `context.WithCancel` — 取消后所有 goroutine 感知，无需手动 Map 管理 |
| Final Review 双触发 | `sync.Once` — 语言级保证只执行一次 |
| 无背压 | `semaphore` 包（`golang.org/x/sync/semaphore`）或 buffered channel |
| 循环依赖 | 与语言无关，但 Go 标准库有 `container/heap` 等辅助拓扑排序 |
| Watchdog 盲区 | `os.Process.Signal(0)` 探活 + `/proc/pid/stat` 读取资源用量 |
| Metadata 泄漏 | `defer` 保证清理，`context` 传播生命周期 |
| Sync 静默失败 | 多返回值 `result, err` 惯例，`errcheck` linter 强制检查 |
| 锁序死锁 | `go run -race` 检测竞态，`golangci-lint` 静态分析 |

**Go 的特别优势：**

1. **Goroutine 即 Worker 管理器**: 每个子任务一个 goroutine，天然映射到当前的 `runningWorkerSessions` Map，但由 runtime 管理生命周期
2. **Context 即 Watchdog**: `context.WithTimeout` 替代手动 `setInterval` 扫描，超时自动传播到所有子操作
3. **Channel 即 EventBus**: 替代当前 28 行的 `TaskEventBus`，类型安全且自带背压
4. **单二进制部署**: 编译成单个可执行文件，无 node_modules，Docker 镜像从 ~200MB 降到 ~20MB
5. **编译速度快**: 秒级编译，不影响迭代效率
6. **`go run -race`**: 运行时竞态检测器，开发阶段即可发现当前所有 TOCTOU 问题

**Go 的劣势（可控）：**
- 字符串模板不如 JS 优雅 → 用 `text/template` 或 `fmt.Sprintf`，1100 LOC 迁移有工作量但不阻塞
- 无 enum 穷举检查 → 用 `go generate` + `stringer` 工具补偿
- 泛型能力较新 → Go 1.21+ 泛型已满足需求

---

### 🥈 Rust — 安全性最强但成本过高

**优势**: 编译期消除数据竞争、状态机建模、错误处理强制性 — 所有并发 bug 理论上在编译期消灭。

**致命劣势**:
- 1100+ LOC Prompt 模板 → Rust 字符串操作痛苦（`String` vs `&str`、所有权转移）
- 7475 行 task-service.js → Rust 重写预计膨胀到 12K-15K 行
- 异步子进程 + 生命周期标注 → `Pin<Box<dyn Future>>` 地狱
- 团队学习曲线 3-6 个月

**适用场景**: 如果系统需要管理 1000+ 并发 Agent 或对内存要求极严格。当前 4-12 并发规模，Rust 是杀鸡用牛刀。

---

### 🥉 Node.js + TypeScript — 最低迁移成本

**优势**: 现有代码无需重写，加 TypeScript 即可获得类型安全，AI SDK 生态最好。

**方案**:
```
现有 JS → 渐进式加 TypeScript → 引入 Fastify 替代原生 http
→ 用 TypeBox/Zod 做运行时类型校验 → 加 p-limit 并发池
→ 用 better-sqlite3 的 transaction API 包裹关键路径
```

**劣势**: 不解决根本问题 — 单线程事件循环的 await 交叉竞态仍在，只是通过纪律和 lint 缓解，不是从语言层面消除。随着系统复杂度增长，bug 会持续出现。

---

## 五、最终建议

### 推荐方案：Go 后端 + React 前端

```
Phase 0 — 当前栈紧急修复（1-2 周）
  └── 修 P0 bug（事务、原子更新、同步标志位）

Phase 1 — React 前端（2-4 周）
  └── Vite + React + TypeScript + SSE 实时推送

Phase 2 — Go 后端重写（6-10 周）
  ├── Core：Task/SubTask 状态机 + SQLite（go-sqlite3）
  ├── Orchestrator：goroutine + context 管理 Worker 生命周期
  ├── Git：os/exec 调用 git CLI（与当前模式一致）
  ├── API：net/http + chi router（40+ 端点）
  ├── Events：channel-based EventBus → SSE 推送
  └── Agents：子进程 spawn + 流式输出解析

Phase 3 — 强化（2-4 周）
  ├── go run -race 全量竞态检测
  ├── 资源监控（/proc/pid/stat 读取 Worker CPU/内存）
  ├── 并发池 + 优雅降级
  └── 拓扑排序 + 环检测
```

### 为什么不是 Rust？

本项目是**进程编排器**，不是高性能计算引擎。核心操作是等待子进程（Agent CLI）完成工作，编排器本身的 CPU 开销极低。Go 的 goroutine + context + channel 模型与"管理一群子进程的生命周期"这个需求精确匹配，同时保持了接近脚本语言的开发效率。Rust 的编译期安全固然强大，但为 1100 LOC 的字符串模板和 30 分钟超时的子进程等待付出所有权/生命周期的心智负担，投入产出比不合理。

### 为什么不留 Node.js？

TypeScript 能缓解但不能根治问题。当前 11 个 bug 中 7 个源自 async/await 交叉的伪并发竞态 — 这是 Node.js 单线程事件循环的固有特性。Go 用 goroutine + mutex 正面解决并发问题，且有 `-race` 检测器在开发阶段暴露问题，比 Node.js 靠纪律规避风险更可靠。
