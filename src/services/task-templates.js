const TEMPLATE_DEFINITIONS = Object.freeze([
  {
    id: "full-stack-web-app",
    roles: ["architect", "backend", "database", "frontend", "tester"],
    buildPlan({ agentType, title }) {
      return [
        {
          acceptance_criteria: [
            "API routes and auth flow are documented.",
            "Dependency order is clear for backend, database, and frontend workers.",
          ],
          branch_suffix: "architect",
          deliverable: `${title} 的执行蓝图与接口契约`,
          description: "梳理认证、数据模型、API 契约和前后端集成边界，形成下游 worker 的共享实施基线。",
          recommended_agent: agentType,
          role: "architect",
          template_hint: "api-contract",
          title: "设计系统边界与交付契约",
        },
        {
          acceptance_criteria: [
            "认证接口与 Todo CRUD API 可用。",
            "服务层具备基本错误处理与输入校验。",
          ],
          branch_suffix: "backend",
          deliverable: "认证服务与 Todo REST API",
          description: "实现服务端认证、会话或 token 处理，以及 Todo 相关业务接口。",
          depends_on: ["architect"],
          recommended_agent: agentType,
          role: "backend",
          template_hint: "service-implementation",
          title: "实现后端 API 与认证",
        },
        {
          acceptance_criteria: [
            "数据库 schema 已定义并可迁移。",
            "核心实体与后端实现保持一致。",
          ],
          branch_suffix: "database",
          deliverable: "数据库 schema、迁移与访问层",
          description: "建立 Todo 与用户相关数据模型，补齐迁移与持久化访问层。",
          depends_on: ["architect"],
          recommended_agent: agentType,
          role: "database",
          template_hint: "schema-migration",
          title: "构建数据库层",
        },
        {
          acceptance_criteria: [
            "React 前端完成登录与 Todo 流程。",
            "关键视图已接入真实后端接口。",
          ],
          branch_suffix: "frontend",
          deliverable: "包含认证与 Todo 流程的 React 前端",
          description: "构建用户登录、列表浏览、创建和更新 Todo 的前端体验，并接入后端 API。",
          depends_on: ["architect"],
          recommended_agent: agentType,
          role: "frontend",
          template_hint: "react-feature",
          title: "构建 React 前端",
        },
        {
          acceptance_criteria: [
            "关键链路的集成测试通过。",
            "认证、数据库与前端主流程已覆盖验证。",
          ],
          branch_suffix: "tester",
          deliverable: "端到端或集成测试结果",
          description: "验证认证、数据库、前端集成后的主路径，记录通过结果与剩余风险。",
          depends_on: ["backend", "database", "frontend"],
          recommended_agent: agentType,
          role: "tester",
          template_hint: "integration-test",
          title: "执行集成与验收测试",
        },
      ];
    },
  },
  {
    id: "backend-api-service",
    roles: ["architect", "backend", "database", "tester"],
    buildPlan({ agentType, title }) {
      return [
        {
          acceptance_criteria: [
            "API surface 与非功能约束已列出。",
            "数据库与测试依赖关系清晰。",
          ],
          branch_suffix: "architect",
          deliverable: `${title} 的接口与实施蓝图`,
          description: "整理服务边界、数据契约和运维约束，为后续执行节点建立一致的接口规范。",
          recommended_agent: agentType,
          role: "architect",
          template_hint: "api-contract",
          title: "设计 API 契约",
        },
        {
          acceptance_criteria: [
            "核心业务接口可运行。",
            "错误处理与输入校验具备最小完备性。",
          ],
          branch_suffix: "backend",
          deliverable: "后端 API 实现",
          description: "实现核心业务接口、控制器、服务层和必要的安全校验。",
          depends_on: ["architect"],
          recommended_agent: agentType,
          role: "backend",
          template_hint: "service-implementation",
          title: "实现服务端逻辑",
        },
        {
          acceptance_criteria: [
            "迁移可运行且结构与 API 模型一致。",
            "数据访问层覆盖主要实体。",
          ],
          branch_suffix: "database",
          deliverable: "数据库 schema 与访问层",
          description: "实现数据库 schema、迁移和访问层，支撑后端 API 的读写需求。",
          depends_on: ["architect"],
          recommended_agent: agentType,
          role: "database",
          template_hint: "schema-migration",
          title: "补齐数据层",
        },
        {
          acceptance_criteria: [
            "关键接口测试通过。",
            "失败场景与回归风险已记录。",
          ],
          branch_suffix: "tester",
          deliverable: "API 测试与回归报告",
          description: "执行 API 集成测试与回归检查，输出通过结果和剩余风险说明。",
          depends_on: ["backend", "database"],
          recommended_agent: agentType,
          role: "tester",
          template_hint: "integration-test",
          title: "验证服务稳定性",
        },
      ];
    },
  },
  {
    id: "frontend-feature",
    roles: ["architect", "frontend", "integration", "tester"],
    buildPlan({ agentType, title }) {
      return [
        {
          acceptance_criteria: [
            "页面结构、状态流和接口需求已定义。",
            "UI 与集成边界足够明确。",
          ],
          branch_suffix: "architect",
          deliverable: `${title} 的交互与集成设计`,
          description: "梳理页面结构、状态管理、数据交互与视觉交付边界。",
          recommended_agent: agentType,
          role: "architect",
          template_hint: "ui-contract",
          title: "设计前端交互与依赖",
        },
        {
          acceptance_criteria: [
            "核心界面与交互已实现。",
            "响应式和空态/错误态具备可用性。",
          ],
          branch_suffix: "frontend",
          deliverable: "前端页面与交互实现",
          description: "实现主要页面、组件和交互逻辑，并保持现有设计系统的一致性。",
          depends_on: ["architect"],
          recommended_agent: agentType,
          role: "frontend",
          template_hint: "react-feature",
          title: "实现前端功能",
        },
        {
          acceptance_criteria: [
            "接口接入路径已打通。",
            "关键状态与错误反馈可验证。",
          ],
          branch_suffix: "integration",
          deliverable: "前后端集成与状态接线",
          description: "连接真实接口、状态管理和缓存策略，确保前端行为与后端契约一致。",
          depends_on: ["architect", "frontend"],
          recommended_agent: agentType,
          role: "integration",
          template_hint: "integration-wireup",
          title: "完成集成接线",
        },
        {
          acceptance_criteria: [
            "关键用户流程通过验证。",
            "主要交互缺陷已记录或修复。",
          ],
          branch_suffix: "tester",
          deliverable: "前端体验验证结果",
          description: "验证关键用户路径、交互反馈和回归风险，并形成交付检查结论。",
          depends_on: ["integration"],
          recommended_agent: agentType,
          role: "tester",
          template_hint: "ui-acceptance",
          title: "执行前端验收",
        },
      ];
    },
  },
]);

const TEMPLATE_LOOKUP = new Map(TEMPLATE_DEFINITIONS.map((template) => [template.id, template]));

export function listPlanTemplates() {
  return TEMPLATE_DEFINITIONS.map((template) => ({
    id: template.id,
    nodeCount: template.roles.length,
    roles: template.roles,
  }));
}

export function buildPlanSeedFromTemplate(templateId, options = {}) {
  const template = TEMPLATE_LOOKUP.get(normalizeRequiredString(templateId));

  if (!template) {
    return null;
  }

  const agentType = normalizeRequiredString(options.agentType) ?? "codex-cli";
  const title = normalizeRequiredString(options.title) ?? "Untitled task";
  const description = normalizeRequiredString(options.description) ?? title;
  const nodes = template.buildPlan({ agentType, description, title });

  return {
    template,
    plan: {
      notes: `Seeded from template ${template.id} and ready for operator review.`,
      nodes,
      subtasks: nodes,
      template_id: template.id,
      template_label: template.id,
    },
  };
}

function normalizeRequiredString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
