# React + Rust 技术栈升级可行性分析

> 当前技术栈：零依赖 Vanilla JS 前端 + 原生 Node.js 后端（无框架）+ SQLite（node:sqlite）
> 目标技术栈：React 前端 + Rust 后端 + SQLite

---

## 一、当前技术栈画像

| 层 | 现状 | 特点 |
|----|------|------|
| 前端 | Vanilla JS + 原生 DOM + Tailwind CSS | 零框架、零运行时依赖 |
| 后端 | Node.js 原生 `http` 模块，无 Express/Fastify | 零 npm 生产依赖 |
| 数据库 | SQLite via `node:sqlite`（DatabaseSync） | 同步 API，无 ORM 运行时 |
| 通信 | REST JSON（40+ 端点） | 无 WebSocket/SSE |
| 进程管理 | Node.js 单进程 + `child_process` spawn Agent | 事件循环调度 |
| 代码量 | 后端 ~28K LOC，前端 ~13.7K LOC | 核心 task-service.js 单文件 7475 行 |

**核心设计哲学**: 极简主义，零外部依赖，全部依赖 Node.js 内建能力。

---

## 二、问题能否被 Rust 解决 — 逐项分析

### 已识别问题 vs Rust 语言特性对照

| # | 问题 | Rust 能否解决 | 分析 |
|---|------|:---:|------|
| 1.1 | 重试计数竞态（TOCTOU） | **部分** | Rust 的所有权系统防数据竞争，但 TOCTOU 是业务逻辑层问题。需要数据库原子操作（`UPDATE WHERE retryCount = ?`），与语言无关 |
| 1.2 | Watchdog/Exit 双杀 | **是** | Rust 的 `Arc<Mutex<>>` + 所有权系统在编译期阻止无锁并发访问 Map。`tokio::select!` 可优雅处理竞争取消 |
| 1.3 | Final Review 双触发 | **是** | `AtomicBool::compare_exchange` 原子 CAS 操作，编译期保证无竞态 |
| 1.4 | 数据库无事务 | **否** | 这是业务代码遗漏，非语言限制。Node.js 同样可以用 `withTransaction` |
| 2.1 | 无背压控制 | **间接** | Rust 的 `tokio::Semaphore` 天然适合，但 Node.js 也有 `p-limit` 等方案 |
| 2.2 | 循环依赖未检测 | **否** | 算法问题（拓扑排序），与语言无关 |
| 2.3 | Watchdog 盲区 | **是** | Rust 可直接调用 `sysinfo` crate 获取子进程 RSS/CPU，比 Node.js 更底层更准确 |
| 2.4 | Metadata Map 泄漏 | **是** | Rust 的 RAII + Drop trait 保证资源自动释放，编译器强制处理所有路径 |
| 2.5 | 冲突解决非原子 | **部分** | Rust 的类型系统可建模状态机，但 kill 后的文件系统脏状态仍需业务逻辑处理 |
| 2.6 | Sync 静默失败 | **是** | Rust 的 `Result<T, E>` 必须被处理，`#[must_use]` 编译警告阻止忽略错误 |
| 3.1 | 锁序死锁风险 | **部分** | Rust 防数据竞争但不防死锁。可通过类型系统编码锁层级，但需手动设计 |

**结论**: 11 个问题中，Rust 可**直接解决** 4 个（1.2、1.3、2.4、2.6），**显著改善** 3 个（1.1、2.3、2.5），**无影响** 4 个（1.4、2.1、2.2、3.1）。

---

## 三、Rust 后端的真正优势

### 3.1 编译期安全保证

```rust
// 当前 Node.js 问题：Map 并发访问无保护
this.runningWorkerSessions.set(subTaskId, entry);  // 任何地方都能写
this.runningWorkerSessions.delete(subTaskId);       // 任何地方都能删

// Rust：编译器强制保护
let sessions: Arc<Mutex<HashMap<SubTaskId, WorkerEntry>>> = ...;
// 不 lock 就无法访问 — 编译不过
let mut guard = sessions.lock().await;
guard.insert(sub_task_id, entry);
// guard drop 时自动释放锁 — RAII
```

### 3.2 真正的多线程并行

```
Node.js:  单线程事件循环 → await 点交叉 → 伪并发竞态
Rust:     tokio 多线程运行时 → 真并行 → 但编译器保证安全
```

当前系统 spawn 大量 Agent 子进程，Node.js 单线程成为编排瓶颈。Rust + tokio 可真正并行处理多个 Worker 的 I/O、合并、审查流程。

### 3.3 内存效率

| 指标 | Node.js | Rust |
|------|---------|------|
| 基础进程内存 | ~50-80 MB | ~2-5 MB |
| 每个 Worker 管理开销 | JS 对象 + GC 压力 | 栈分配 + 零 GC |
| 50 并发任务编排 | ~500MB+ 编排进程 | ~50MB 编排进程 |

对于需要管理大量 Agent 子进程的编排系统，内存效率直接决定可管理的并发规模。

### 3.4 进程管理能力

Rust 可直接调用系统 API：
- `waitpid` / `kill` — 精确控制子进程生命周期
- `/proc/{pid}/stat` — 直接读取进程 CPU/内存
- `prctl` — 设置子进程死亡信号，防 zombie
- `cgroups` — 容器级资源限制

Node.js 的 `child_process` 是对这些的高层封装，丢失了精细控制能力。

### 3.5 类型安全的状态机

```rust
// 子任务状态转换 — 编译期保证不会出现非法转换
enum SubTaskState {
    Pending,
    Blocked { deps: Vec<SubTaskId> },
    Running { worker: WorkerHandle },
    ReviewPending { diff: String },
    Accepted,
    Merged,
    Failed { error: String, retry_count: u32 },
}

impl SubTaskState {
    fn can_transition_to(&self, target: &SubTaskState) -> bool {
        // 编译期穷举所有分支，遗漏即报错
        match (self, target) { ... }
    }
}
```

当前 Node.js 代码中状态转换靠字符串比较 + 人工保证，Rust 的枚举 + match 穷举可消除非法状态转换。

---

## 四、React 前端的优势与必要性

### 4.1 当前前端痛点

当前 Vanilla JS 前端 13.7K LOC，随着功能增长面临：

| 问题 | 说明 |
|------|------|
| 手动 DOM 同步 | 状态变化需手动 `querySelector` + `innerHTML` 更新，容易遗漏 |
| 无组件化复用 | UI 片段通过模板字符串拼接，无法组合、测试、复用 |
| 无实时更新 | 当前纯 REST 轮询，任务状态变化需手动刷新 |
| 状态管理散乱 | 状态分散在 DOM、localStorage、闭包中，调试困难 |

### 4.2 React 带来的改善

| 能力 | 价值 |
|------|------|
| 声明式渲染 | 状态变化自动反映到 UI，消除手动 DOM 同步 bug |
| 组件化 | Task/SubTask/Agent 面板可独立开发、测试、复用 |
| 状态管理（Zustand/Jotai） | 集中管理任务树状态，支持乐观更新 |
| SSE/WebSocket 集成 | 配合后端事件总线实现实时任务状态推送 |
| React DevTools | 开发调试体验质的飞跃 |
| 生态系统 | Monaco Editor（代码审查）、react-flow（DAG 可视化）等 |

### 4.3 关键 UI 场景适配

- **任务 DAG 可视化**: react-flow 可直观展示子任务依赖拓扑，直接暴露循环依赖问题（问题 2.2）
- **实时日志流**: React + SSE 可实现 Worker 输出实时流式展示
- **冲突解决 UI**: Monaco diff editor 嵌入 React，支持人工介入合并冲突
- **资源监控面板**: 实时展示 Worker 内存/CPU（配合 Rust 后端系统级监控）

---

## 五、风险与成本评估

### 5.1 迁移成本

| 项目 | 估算 | 说明 |
|------|------|------|
| Rust 后端重写 | **大** | ~28K LOC JS → Rust，核心编排逻辑复杂度高 |
| React 前端重写 | **中** | ~13.7K LOC，UI 逻辑相对直观 |
| 数据库层 | **小** | SQLite 通用，Rust 用 `rusqlite` / `sqlx` 无缝迁移 |
| Agent 适配层 | **中** | 子进程 spawn/管理逻辑需重写，但接口不变 |
| 测试重写 | **中** | 21 个测试文件需用 Rust 测试框架重写 |
| 团队学习 | **大** | Rust 学习曲线陡峭，所有权/生命周期概念需时间内化 |

### 5.2 风险点

1. **Rust 生态 CLI agent 集成**: 当前通过 `child_process` spawn Claude/Codex CLI，Rust 用 `tokio::process::Command` 同样可行但需重新处理流式输出解析
2. **开发迭代速度下降**: Rust 编译时间 + 严格类型系统 → 原型迭代比 Node.js 慢 2-3x
3. **动态 Prompt 构建**: 当前大量字符串模板拼接（7K+ LOC），Rust 中字符串操作更繁琐
4. **团队人才池**: Node.js/JS 开发者远多于 Rust 开发者

### 5.3 渐进式迁移路径（推荐）

完全重写风险过高，建议分阶段：

```
Phase 0 — 不换栈，先修 bug（1-2 周）
  ├── 给关键路径加 withTransaction
  ├── 重试计数用 UPDATE WHERE 原子更新
  ├── Final Review 用同步标志位
  └── 加 p-limit 并发池

Phase 1 — 前端升级 React（2-4 周）
  ├── Vite + React + TypeScript 脚手架
  ├── 逐页面迁移（任务列表 → 任务详情 → 审查面板）
  ├── 引入 SSE 实时推送（后端 task-event-bus 已有事件体系）
  └── DAG 可视化（暴露循环依赖）

Phase 2 — 后端关键模块 Rust 化（4-8 周）
  ├── Rust sidecar 进程：Worker 生命周期管理 + 资源监控
  ├── Rust 模块：Git 操作（合并/冲突检测/rebase）
  ├── Node.js 主进程通过 IPC/HTTP 调用 Rust sidecar
  └── 保留 Node.js 做 HTTP 路由 + Prompt 构建

Phase 3 — 全量 Rust 后端（可选，8-16 周）
  ├── axum/actix-web HTTP 层
  ├── sqlx + SQLite 数据层
  ├── tokio 异步编排引擎
  └── 完整状态机类型建模
```

---

## 六、结论

### 该不该换？

| 维度 | 判断 |
|------|------|
| **React 前端** | **推荐升级**。当前 Vanilla JS 已到复杂度天花板，React 投入产出比高，迁移成本可控 |
| **Rust 后端** | **有价值但非必需**。7/11 个问题可在 Node.js 层面修复。Rust 的核心优势在并发安全和资源管理，适合作为 sidecar 逐步引入，而非一次性重写 |
| **全量重写** | **不推荐**。成本高、风险大、迭代停滞。渐进式迁移更务实 |

### 一句话总结

**前端换 React 收益确定、风险可控；后端先修 bug + 加类型安全，再将 Worker 管理/Git 操作等性能敏感模块逐步 Rust 化，是最优路径。**
