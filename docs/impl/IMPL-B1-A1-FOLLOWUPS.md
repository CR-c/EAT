# 实施计划 · B1/A1 Code Review 深层遗留项

> 来源:`feat/mailbox-handoff-and-live-terminal` 分支的 high-effort code review。
> 高价值低风险项已在该分支修复;本文是 review 标注的 5 个**深层遗留项**,需单独、谨慎落地。
> 每项独立,可分批提交;全程 `cd backend && go test ./...` 与 `cd web && pnpm lint && pnpm build` 必须全绿。

## F1. Worker mailbox 走 service 层校验(altitude,最高优先)
**问题**:`orchestrator.collectMailboxMessagesFromWorkerOutput` 直接调 `repo.CreateMailboxMessage`,**绕过** `task_mailbox_service.SendMailboxMessage` 的全部校验。后果:
- worker 给出不存在的 `targetSubTaskId` → 命中 `mailbox_messages` 的 FK 约束(`target_sub_task_id REFERENCES sub_tasks(id)`,`PRAGMA foreign_keys=ON`)→ INSERT 失败 → 当前只 `log.Printf` + `continue` **静默丢弃**,handoff 永不送达。
- `targetType=SUBTASK` 但 `targetSubTaskId` 为空 → 持久化出 service 保证永不存在的孤儿行。
- 自发自收 / LEAD→LEAD 等被 service 拒绝的非法组合可被持久化。

**方案**:让 worker mailbox 复用 service 的校验路径(优先);若不便跨包调用,则在 orchestrator 落库前做等价校验:
- `messageType` 经 `normalizeMailboxMessageType` 白名单校验,非法则跳过并记可见日志(已大写归一,这里补枚举校验)。
- `targetType=SUBTASK` 必须有 `targetSubTaskId`,且先 `FindSubTaskByID` 确认存在且属同一 task;不存在则跳过并记日志(而非交给 FK 崩)。
- 拒绝自发自收 / LEAD→LEAD。
- 被跳过的块要有结构化、可观测的日志(便于排查 worker 产出的坏 handoff)。

**测试**:非法 target、空 target、非法 type、自发自收各一例,断言被跳过且不落库;合法例正常落库。

## F2. eat:mailbox 块不应从被截断的 OutputBuffer 解析(altitude)
**问题**:`OutputBuffer` 被 `AppendSessionOutput` 硬截为尾部 64KiB。chatty worker 早期输出的 eat:mailbox 块会被截掉 → handoff 静默丢失;跨 64KiB 边界的块会变成半截 JSON 解析失败。

**方案**(择一):
- 优先:从会话**完整日志文件** `session.LogPath` 解析,而非内存里的截断 buffer。
- 或:在输出**流式写入处**(`AppendSessionOutput` 调用点)增量扫描并提取 eat:mailbox 块,维护每会话的解析游标,落库后即可丢弃,不依赖最终 buffer。
- 配套:跨 chunk 边界的块要能正确拼接(增量解析需缓存未闭合的 ```eat:mailbox 起始)。

**测试**:构造 >64KiB 输出且 eat:mailbox 块位于前部,断言仍被回收;构造跨 chunk 边界的块断言正确解析。

## F3. 回收幂等(防重复)
**问题**:`handleWorkerExit` 重入 / 子任务重试时,`collectMailboxMessagesFromWorkerOutput` 会再次解析整段并重复 `CreateMailboxMessage`(无幂等键),产生重复 handoff 行与重复 `mailbox:message`/`board:activity` 事件。

**方案**:
- 给每个 eat:mailbox 块计算稳定指纹(如 `sessionId + 块内容 hash`),落库前查重;或给会话加「mailbox 已回收」标记 / 记录已处理偏移,避免重复扫描。
- 与 F2 的增量游标方案天然契合(游标即去重依据)。

**测试**:对同一会话调用回收两次,断言只落一份。

## F4. 消除重复代码(reuse / 可维护性)
**问题**:
- `backend/internal/orchestrator/support.go` 的 `stringPointerValue` / `cloneJSONMap` / `nullableString` / `firstNonEmpty` 与 `backend/internal/task/task_support.go` **逐字节重复**。
- `orchestrator.publishMailboxMessage` 与 `task.Service.SendMailboxMessage` 内的 `mailbox:message`+`board:activity` 发布块重复(事件名、payload key 完全一致)。
- `session_handler.GetSessionOutput` 手搓 error envelope,而非走 `respondTaskError` + `mapTaskErrorStatus`。

**方案**:
- 把 4 个 helper 提到共享 internal util 包,两处都引用。
- 抽出共享的 mailbox 事件 payload 构造/发布,两条写路径共用,防止事件契约漂移。
- `GetSessionOutput` 的读失败分支改用 `respondTaskError(&task.Error{Code:"TASK_SESSIONS_READ_FAILED", ...})`,与同级 handler 一致。

**测试**:依赖现有测试回归即可;确保事件 payload 与前端 `applyRealtimeEventTo*` 仍兼容。

## F5. session 输出端点的 task 归属校验(防越权读)
**问题**:`GET /api/sessions/{sessionId}/output` 凭裸 `sessionId` 直接读 `OutputBuffer`,无 task/project 归属校验。本地单用户场景影响低,但仍应收口。

**方案**:
- 端点解析出 session 后,校验其归属(至少非空 task 关联);如有项目级访问语义则一并校验。
- 经 service 层而非在 handler 内 `task.NewRepository(h.db.DB)` 直连,统一鉴权切面。

**测试**:不存在 / 跨任务 sessionId 返回合适错误码(404 / 403),合法返回 200。

## 顺序建议
F1 → F2 → F3(三者属同一回收链路,建议连续做)→ F4(纯清理)→ F5。
