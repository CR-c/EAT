# EAT Extended Phases Implementation Order

## 文档定位

这份文档描述扩展阶段 `17` 到 `22` 的推荐实施顺序。  
它不再充当新的产品路线定义；顶层产品定义以 `docs/PRD.md` 为准。

## 总原则

扩展阶段应遵循：

- 先补编排骨架，再补可见性，再补收口与打磨
- 先保证状态机和数据模型稳定，再扩大 UI 表达层
- 不用“更热闹的 UI”掩盖底层流程还没稳定的问题

## 推荐顺序

1. Phase 17
2. Phase 18
3. 用 “全栈 Todo” 做一次设计演练
4. Phase 19
5. Phase 20
6. Phase 21
7. Phase 22

## 为什么这样排

### 先做 17

没有 team lifecycle 和 Web orchestration shell，后面的 board、handoff、queue 只能继续塞进旧 task detail。

### 再做 18

没有 role-aware DAG，Lead orchestration 仍然缺少稳定的执行图和清晰的 plan contract。

### 然后做一次 Todo 演练

这一步用于验证：

- role 是否够用
- DAG 字段是否完整
- 需要哪些 handoff 类型
- guided flow 是否真的能支撑黄金路径

### 再做 19 和 20

它们决定系统是否真正表现成“一个 team 在协作”，而不是一组孤立的并行 session。

### 最后做 21 和 22

这两阶段负责把系统从“可以编排”推进到“可以稳定集成、可以演示、可以复用”。

## 维护要求

如果未来继续调整 phase `17` 到 `22`：

- 不要在这里重写 PRD
- 不要把基础 phase 的术语改成另一套名字
- 任何扩展字段或状态，都应回到 `docs/PRD.md` 做统一定义

## 当前建议

如果下一步要继续补齐文档或实现，优先检查：

- phase `17` 到 `22` 是否与 `PRD v4.0` 的术语、状态和对象层定义一致
- 当前代码是否已经部分实现但文档仍写成“未来路线”
