# EAT Vibe Kanban 开工索引

这份目录是给你自己在 Vibe Kanban 中逐个开工用的。

使用方法：

1. 先读这一份索引。
2. 按下面顺序打开对应父任务文档。
3. 在 Vibe Kanban 里找到对应子任务 issue。
4. 从子任务创建 workspace。
5. 把文档里的提示词复制给 AI。
6. 每个子任务完成后，先提交该子任务的有效代码 commit，再 review、测试，然后继续下一个子任务。
7. 一个父任务下的所有子任务做完后，再从父任务创建一个收尾 workspace。
8. 在父任务收尾 workspace 中，先把已完成子任务分支合并到 `main`，再联调、检查、修复。
9. 父任务确认 `main` 没问题后，删除已合并子分支，并把最新 `main` 推送到远端。

总规则：

- 默认从子任务开 workspace。
- 父任务只用于阶段收尾、联调、补洞、验收。
- 子任务完成后必须先提交当前子任务的有效代码 commit，不能以未提交状态宣称完成。
- 子任务如果没有产生实际代码变更，不能宣称完成，也不能交给父任务去合并空分支。
- 父任务必须先把所有已完成子任务分支合并到 `main`，再在 `main` 上做联调、检查和修复。
- 父任务必须验证 `main` 已包含对应子任务代码，并在合并完成后删除对应子任务分支。
- 父任务完成验收后，必须把最新 `main` 推送到远端。
- 不要跳 phase。
- 不要只靠 issue 描述单独开发。

固定阅读顺序：

1. `AGENTS.md`
2. `docs/PRD.md`
3. `docs/phase/README.md`
4. `docs/phase/PRISMA-MIGRATIONS.md`
5. `docs/phase/API-EVENT-EXAMPLES.md`
6. `docs/phase/CHECKLISTS.md`
7. 当前 phase 文档
8. 父任务 issue 描述
9. 当前子任务 issue 描述

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

你现在应该从：

- [CRC-7 Phase 01](/home/code/EAT/docs/me/CRC-7-phase-01.md)

开始，并先执行：

1. `CRC-22`
2. `CRC-23`
3. `CRC-24`
4. `CRC-25`
