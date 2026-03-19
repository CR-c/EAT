# EAT v1.1 推荐实施顺序

## 总原则

v1.1 的文档虽然拆成了 17 到 22 六个 phase，但实际开发应遵循“骨架优先”的顺序，而不是简单按 UI 热闹程度来做。

## 推荐顺序

1. Phase 17
2. Phase 18
3. 用 “全栈 Todo” 做一次设计演练
4. Phase 19
5. Phase 20
6. Phase 21
7. Phase 22

## 为什么这么排

### 先做 17

如果没有 team lifecycle 和 Web orchestration shell，后面所有能力都只能继续塞进现有 task detail。

### 再做 18

没有 role-aware DAG，leader orchestration 还是弱的，因为用户看不到真正的 team execution graph。

### 然后做一次 Todo 演练

这是为了验证：

- role 是否够用
- DAG 字段是否缺失
- 需要哪些 handoff 类型

### 再做 19 和 20

它们决定“这个系统是否真的像一个 team 在协作”，而不是一堆并行 session。

### 最后做 21 和 22

这两阶段是把系统从“能编排”推进到“能集成、能展示、能稳定交付”。

## 当前建议

如果你现在就要继续进入编码，下一张开发工单应当直接从：

- [17-web-leader-orchestration-and-team-lifecycle.md](/home/code/EAT/docs/v1.1/17-web-leader-orchestration-and-team-lifecycle.md)

开始。
