import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createApp } from "../src/server/app.js";
import {
  buildAgentRuntimeModeLabel,
  buildAgentStatusLabel,
  buildAttachmentCaption,
  buildBranchList,
  buildCleanlinessLabel,
  buildDockerHealthLabel,
  buildLeadSelectionState,
  buildProjectErrorMessage,
  buildSubTaskStatusLabel,
  buildTaskErrorMessage,
  buildTaskStatusLabel,
  setLocale,
} from "../src/ui/view-model.js";

test("serves the orchestration UI shell and static assets", async () => {
  const server = createApp({
    repositoryOptions: {
      databasePath: path.join(process.cwd(), ".tmp-projects.db"),
    },
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const rootResponse = await request(server, "/");
    const cssResponse = await request(server, "/app.css");
    const jsResponse = await request(server, "/app.js");

    assert.equal(rootResponse.status, 200);
    assert.match(rootResponse.headers.get("content-type"), /^text\/html/);
    assert.match(rootResponse.body, /可通过 Web 操控的 Agent 编排/);
    assert.match(rootResponse.body, /新建需求澄清任务/);
    assert.match(rootResponse.body, /Lead 会话转录/);
    assert.match(rootResponse.body, /当前计划草稿/);
    assert.match(rootResponse.body, /模板种子/);
    assert.match(rootResponse.body, /应用模板/);
    assert.match(rootResponse.body, /图谱视图/);
    assert.match(rootResponse.body, /列表视图/);
    assert.match(rootResponse.body, /添加子任务/);
    assert.match(rootResponse.body, /保存草稿/);
    assert.match(rootResponse.body, /批准草稿/);
    assert.match(rootResponse.body, /重置本地修改/);
    assert.match(rootResponse.body, /规划备注/);
    assert.match(rootResponse.body, /摘要优先的 worker 看板/);
    assert.match(rootResponse.body, /聚焦会话/);
    assert.match(rootResponse.body, /交接说明/);
    assert.match(rootResponse.body, /收件箱/);
    assert.match(rootResponse.body, /发件箱/);
    assert.match(rootResponse.body, /合同与接口/);
    assert.match(rootResponse.body, /阻塞与请求/);
    assert.match(rootResponse.body, /发送方/);
    assert.match(rootResponse.body, /接收方/);
    assert.match(rootResponse.body, /消息类型/);
    assert.match(rootResponse.body, /发送结构化交接说明/);
    assert.match(rootResponse.body, /发送交接说明/);
    assert.match(rootResponse.body, /确认丢弃/);
    assert.match(rootResponse.body, /Rebase 并重试/);
    assert.match(rootResponse.body, /恢复合并/);
    assert.match(rootResponse.body, /清理警告/);
    assert.match(rootResponse.body, /Lead 与团队生命周期/);
    assert.match(rootResponse.body, /重新派发成员/);
    assert.match(rootResponse.body, /取消成员/);
    assert.match(rootResponse.body, /替换 worker/);
    assert.match(rootResponse.body, /Docker 沙箱/);
    assert.match(rootResponse.body, /id="language-toggle"/);
    assert.match(rootResponse.body, /language-toggle/);
    assert.match(rootResponse.body, /English/);

    assert.equal(cssResponse.status, 200);
    assert.match(cssResponse.headers.get("content-type"), /^text\/css/);
    assert.match(cssResponse.body, /backdrop-filter|backdrop-blur/);
    assert.match(cssResponse.body, /team-member-card/);

    assert.equal(jsResponse.status, 200);
    assert.match(jsResponse.headers.get("content-type"), /^text\/javascript/);
    assert.match(jsResponse.body, /loadTaskDetail/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("formats project, task, agent health, and attachment UI messages", () => {
  setLocale("zh-CN");

  assert.equal(
    buildProjectErrorMessage({
      code: "PROJECT_ALREADY_REGISTERED",
      details: { path: "/home/code/EAT" },
    }),
    "该仓库已注册在 /home/code/EAT。",
  );

  assert.equal(
    buildProjectErrorMessage({
      code: "NOT_GIT_REPOSITORY",
    }),
    "所选目录不是非裸 Git 仓库。",
  );

  assert.equal(buildCleanlinessLabel(true), "工作区有未提交改动");
  assert.equal(buildCleanlinessLabel(false), "工作区干净");
  assert.deepEqual(buildBranchList([]), ["未检测到最近的本地分支。"]);
  assert.deepEqual(buildBranchList(["main", "feature/ui"]), ["main", "feature/ui"]);
  assert.equal(buildAgentStatusLabel({ available: true, checks: [] }), "健康");
  assert.equal(buildAgentStatusLabel({ available: false, checks: [] }), "不可用");
  assert.equal(buildAgentRuntimeModeLabel({ runtimeMode: "STUB" }, null), "Stub 运行时");
  assert.equal(buildDockerHealthLabel({ available: true }), "就绪");
  assert.equal(buildDockerHealthLabel({ available: false, daemonReachable: false }), "不可用");
  assert.equal(buildTaskStatusLabel("CLARIFYING"), "澄清中");
  assert.equal(buildTaskStatusLabel("PLAN_REVIEW"), "计划审阅");
  assert.equal(buildTaskStatusLabel("EXECUTING"), "执行中");
  assert.equal(buildTaskStatusLabel("REVIEWING"), "审查中");
  assert.equal(buildTaskStatusLabel("MERGING"), "合并中");
  assert.equal(buildSubTaskStatusLabel("BLOCKED"), "阻塞中");
  assert.equal(buildSubTaskStatusLabel("REVIEW_PENDING"), "待审查");
  assert.equal(
    buildTaskErrorMessage({
      code: "SUBTASK_DISCARD_NOT_ALLOWED",
    }),
    "只有最终审查标记为待丢弃后，才能确认丢弃。",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "SUBTASK_CANCEL_NOT_ALLOWED",
    }),
    "当前成员状态不允许取消成员。",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "SUBTASK_REBASE_RETRY_NOT_ALLOWED",
    }),
    "只有最近一次合并尝试发生冲突后，才能执行 Rebase & Retry。",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "SUBTASK_REASSIGN_NOT_ALLOWED",
    }),
    "当前成员状态不允许重派发成员。",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "TASK_RESUME_NOT_ALLOWED",
    }),
    "只有解决合并阻塞项后，才能恢复合并。",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "ATTACHMENT_TYPE_UNSUPPORTED",
    }),
    "一个或多个附件类型不受支持。",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "TASK_NOT_PLAN_REVIEW",
    }),
    "该操作仅在计划审阅阶段可用。",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "PLAN_SNAPSHOT_NOT_FOUND",
    }),
    "所选计划快照已不存在。",
  );
  assert.equal(
    buildTaskErrorMessage({
      code: "PLAN_TEMPLATE_REQUIRED",
    }),
    "请先选择一个计划模板。",
  );
  assert.equal(
    buildAttachmentCaption({
      fileType: "DOCUMENT",
      mimeType: "text/markdown",
      size: 2048,
    }),
    "DOCUMENT · text/markdown · 2 KB",
  );
  assert.deepEqual(
    buildLeadSelectionState({
      agentName: "codex-cli",
      selectable: false,
      failureReason: { message: "Login required." },
    }),
    {
      disabled: true,
      message: "codex-cli 已被阻止：Login required.",
      tone: "error",
    },
  );

  setLocale("en");
  assert.equal(buildTaskStatusLabel("MERGING"), "Merging");
  assert.equal(buildDockerHealthLabel({ available: true }), "Ready");
  setLocale("zh-CN");
});

async function request(server, routePath) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${routePath}`);

  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}
