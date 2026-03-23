# EAT Vibe Kanban 开工索引

这份目录是给你自己在 Vibe Kanban 中逐个 phase 开工用的。

使用方法：

1. 先读这一份索引。
2. 按下面顺序打开对应父任务文档。
3. 在 Vibe Kanban 里只找到对应父任务 issue。
4. 从父任务 issue 创建 workspace，基准分支始终选择最新 `main`。
5. 把父任务 issue 描述直接发给 AI。
6. 在同一个父任务 workspace / 分支里，按文档规定的内部开发顺序逐段实现。
7. 每完成一个内部步骤，就在同一个父任务分支提交一个对应的非空 commit。
8. 全部内部步骤完成后，继续在同一分支做联调、补洞、验收和修复。
9. 父任务分支 review 通过后，再将父任务分支合并到 `main`。
10. 合并完成后删除父任务分支，并把最新 `main` 推送到远端。

总规则：

- 默认规则改为：一个 phase 只开一个父任务 workspace。
- 不再从子 issue 创建 workspace。
- 已存在的子 issue 只作为内部开发顺序和范围拆分参考，不再作为实际执行入口。
- 一个父任务 = 一个工作分支 = 该 phase 的全部开发、联调、验收。
- 后一个内部步骤必须直接基于当前父任务分支的最新代码继续开发。
- 每个内部步骤完成后都要提交有效代码 commit，不能以未提交状态进入下一个步骤。
- 如果某个内部步骤没有实际代码变更，不能宣称完成。
- 一个 phase 完成后，先合并父任务分支到 `main`，再开始下一个 phase。
- 不要跳 phase。
- 不要只靠 issue 描述单独开发。

固定阅读顺序：

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/PRD.md`
4. `docs/phase/README.md`
5. `docs/phase/PRISMA-MIGRATIONS.md`
6. `docs/phase/API-EVENT-EXAMPLES.md`
7. `docs/phase/CHECKLISTS.md`
8. 当前 phase 文档
9. 当前父任务 issue 描述
10. 当前父任务文档中的内部顺序说明

执行顺序：

1. [CRC-7 Phase 01](/home/code/EAT/docs/me/CRC-7-phase-01.md)
2. [CRC-9 Phase 02](/home/code/EAT/docs/me/CRC-9-phase-02.md)
3. [CRC-10 Phase 03](/home/code/EAT/docs/me/CRC-10-phase-03.md)
4. [CRC-11 Phase 04](/home/code/EAT/docs/me/CRC-11-phase-04.md)
5. [CRC-12 Phase 05](/home/code/EAT/docs/me/CRC-12-phase-05.md)
6. [CRC-13 Phase 06](/home/code/EAT/docs/me/CRC-13-phase-06.md)
7. [CRC-14 Phase 07](/home/code/EAT/docs/me/CRC-14-phase-07.md)
8. [CRC-15 Phase 08](/home/code/EAT/docs/me/CRC-15-phase-08.md)
9. [CRC-16 Phase 09](/home/code/EAT/docs/me/CRC-16-phase-09.md)
10. [CRC-17 Phase 10](/home/code/EAT/docs/me/CRC-17-phase-10.md)
11. [CRC-18 Phase 11](/home/code/EAT/docs/me/CRC-18-phase-11.md)
12. [CRC-19 Phase 12](/home/code/EAT/docs/me/CRC-19-phase-12.md)
13. [CRC-20 Phase 13](/home/code/EAT/docs/me/CRC-20-phase-13.md)
14. [CRC-21 Phase 14](/home/code/EAT/docs/me/CRC-21-phase-14.md)

基于当前仓库实现，Phase 01 到 Phase 08 已完成。

你现在应该从：

- [CRC-16 Phase 09](/home/code/EAT/docs/me/CRC-16-phase-09.md)

开始，并且只从父任务 `CRC-16` 创建 workspace。
