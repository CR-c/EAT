package tasktemplates

import "strings"

type Template struct {
	ID    string   `json:"id"`
	Roles []string `json:"roles"`
}

type Node struct {
	AcceptanceCriteria []string `json:"acceptance_criteria"`
	BranchSuffix       string   `json:"branch_suffix"`
	Deliverable        string   `json:"deliverable"`
	Description        string   `json:"description"`
	DependsOn          []string `json:"depends_on,omitempty"`
	RecommendedAgent   string   `json:"recommended_agent"`
	Role               string   `json:"role"`
	TemplateHint       string   `json:"template_hint"`
	Title              string   `json:"title"`
}

type Plan struct {
	Notes         string `json:"notes"`
	Nodes         []Node `json:"nodes"`
	Subtasks      []Node `json:"subtasks"`
	TemplateID    string `json:"template_id"`
	TemplateLabel string `json:"template_label"`
}

type Seed struct {
	Template Template `json:"template"`
	Plan     Plan     `json:"plan"`
}

type Summary struct {
	ID        string   `json:"id"`
	NodeCount int      `json:"nodeCount"`
	Roles     []string `json:"roles"`
}

type definition struct {
	Template
	buildPlan func(options BuildOptions) []Node
}

type BuildOptions struct {
	AgentType   string
	Description string
	Title       string
}

var definitions = []definition{
	{
		Template: Template{ID: "full-stack-web-app", Roles: []string{"architect", "backend", "database", "frontend", "tester", "integration"}},
		buildPlan: func(options BuildOptions) []Node {
			return []Node{
				{
					AcceptanceCriteria: []string{
						"API routes and auth flow are documented.",
						"Dependency order is clear for backend, database, and frontend workers.",
					},
					BranchSuffix:     "architect",
					Deliverable:      options.Title + " 的执行蓝图与接口契约",
					Description:      "梳理认证、数据模型、API 契约和前后端集成边界，形成下游 worker 的共享实施基线。",
					RecommendedAgent: options.AgentType,
					Role:             "architect",
					TemplateHint:     "api-contract",
					Title:            "设计系统边界与交付契约",
				},
				{
					AcceptanceCriteria: []string{
						"认证接口与 Todo CRUD API 可用。",
						"服务层具备基本错误处理与输入校验。",
					},
					BranchSuffix:     "backend",
					Deliverable:      "认证服务与 Todo REST API",
					Description:      "实现服务端认证、会话或 token 处理，以及 Todo 相关业务接口。",
					DependsOn:        []string{"architect"},
					RecommendedAgent: options.AgentType,
					Role:             "backend",
					TemplateHint:     "service-implementation",
					Title:            "实现后端 API 与认证",
				},
				{
					AcceptanceCriteria: []string{
						"数据库 schema 已定义并可迁移。",
						"核心实体与后端实现保持一致。",
					},
					BranchSuffix:     "database",
					Deliverable:      "数据库 schema、迁移与访问层",
					Description:      "建立 Todo 与用户相关数据模型，补齐迁移与持久化访问层。",
					DependsOn:        []string{"architect"},
					RecommendedAgent: options.AgentType,
					Role:             "database",
					TemplateHint:     "schema-migration",
					Title:            "构建数据库层",
				},
				{
					AcceptanceCriteria: []string{
						"React 前端完成登录与 Todo 流程。",
						"关键视图已接入真实后端接口。",
					},
					BranchSuffix:     "frontend",
					Deliverable:      "包含认证与 Todo 流程的 React 前端",
					Description:      "构建用户登录、列表浏览、创建和更新 Todo 的前端体验，并接入后端 API。",
					DependsOn:        []string{"architect"},
					RecommendedAgent: options.AgentType,
					Role:             "frontend",
					TemplateHint:     "react-feature",
					Title:            "构建 React 前端",
				},
				{
					AcceptanceCriteria: []string{
						"关键链路的集成测试通过。",
						"认证、数据库与前端主流程已覆盖验证。",
					},
					BranchSuffix:     "tester",
					Deliverable:      "端到端或集成测试结果",
					Description:      "验证认证、数据库、前端集成后的主路径，记录通过结果与剩余风险。",
					DependsOn:        []string{"backend", "database", "frontend"},
					RecommendedAgent: options.AgentType,
					Role:             "tester",
					TemplateHint:     "integration-test",
					Title:            "执行集成与验收测试",
				},
				{
					AcceptanceCriteria: []string{
						"发布前检查项已汇总。",
						"集成分支 gate 的关注点和回退策略已说明。",
					},
					BranchSuffix:     "integration",
					Deliverable:      "集成发布检查单与 release note",
					Description:      "汇总测试结论、已知风险、迁移注意事项和发布前检查单，为后续 integration run 提供明确的操作上下文。",
					DependsOn:        []string{"tester"},
					RecommendedAgent: options.AgentType,
					Role:             "integration",
					TemplateHint:     "release-readiness",
					Title:            "整理集成发布说明",
				},
			}
		},
	},
	{
		Template: Template{ID: "backend-api", Roles: []string{"architect", "backend", "database", "tester", "integration"}},
		buildPlan: func(options BuildOptions) []Node {
			return []Node{
				{
					AcceptanceCriteria: []string{
						"API surface 与非功能约束已列出。",
						"数据库与测试依赖关系清晰。",
					},
					BranchSuffix:     "architect",
					Deliverable:      options.Title + " 的接口与实施蓝图",
					Description:      "整理服务边界、数据契约和运维约束，为后续执行节点建立一致的接口规范。",
					RecommendedAgent: options.AgentType,
					Role:             "architect",
					TemplateHint:     "api-contract",
					Title:            "设计 API 契约",
				},
				{
					AcceptanceCriteria: []string{
						"核心业务接口可运行。",
						"错误处理与输入校验具备最小完备性。",
					},
					BranchSuffix:     "backend",
					Deliverable:      "后端 API 实现",
					Description:      "实现核心业务接口、控制器、服务层和必要的安全校验。",
					DependsOn:        []string{"architect"},
					RecommendedAgent: options.AgentType,
					Role:             "backend",
					TemplateHint:     "service-implementation",
					Title:            "实现服务端逻辑",
				},
				{
					AcceptanceCriteria: []string{
						"迁移可运行且结构与 API 模型一致。",
						"数据访问层覆盖主要实体。",
					},
					BranchSuffix:     "database",
					Deliverable:      "数据库 schema 与访问层",
					Description:      "实现数据库 schema、迁移和访问层，支撑后端 API 的读写需求。",
					DependsOn:        []string{"architect"},
					RecommendedAgent: options.AgentType,
					Role:             "database",
					TemplateHint:     "schema-migration",
					Title:            "补齐数据层",
				},
				{
					AcceptanceCriteria: []string{
						"关键接口测试通过。",
						"失败场景与回归风险已记录。",
					},
					BranchSuffix:     "tester",
					Deliverable:      "API 测试与回归报告",
					Description:      "执行 API 集成测试与回归检查，输出通过结果和剩余风险说明。",
					DependsOn:        []string{"backend", "database"},
					RecommendedAgent: options.AgentType,
					Role:             "tester",
					TemplateHint:     "integration-test",
					Title:            "验证服务稳定性",
				},
				{
					AcceptanceCriteria: []string{
						"release gate 关注点明确。",
						"迁移、构建和回滚注意事项已整理。",
					},
					BranchSuffix:     "integration",
					Deliverable:      "发布前验证清单",
					Description:      "汇总 API、数据库和测试结论，形成面向 integration run 的发布检查清单。",
					DependsOn:        []string{"tester"},
					RecommendedAgent: options.AgentType,
					Role:             "integration",
					TemplateHint:     "release-readiness",
					Title:            "整理发布验证清单",
				},
			}
		},
	},
	{
		Template: Template{ID: "frontend-feature", Roles: []string{"architect", "frontend", "integration", "tester"}},
		buildPlan: func(options BuildOptions) []Node {
			return []Node{
				{
					AcceptanceCriteria: []string{
						"页面结构、状态流和接口需求已定义。",
						"UI 与集成边界足够明确。",
					},
					BranchSuffix:     "architect",
					Deliverable:      options.Title + " 的交互与集成设计",
					Description:      "梳理页面结构、状态管理、数据交互与视觉交付边界。",
					RecommendedAgent: options.AgentType,
					Role:             "architect",
					TemplateHint:     "ui-contract",
					Title:            "设计前端交互与依赖",
				},
				{
					AcceptanceCriteria: []string{
						"核心界面与交互已实现。",
						"响应式和空态/错误态具备可用性。",
					},
					BranchSuffix:     "frontend",
					Deliverable:      "前端页面与交互实现",
					Description:      "实现主要页面、组件和交互逻辑，并保持现有设计系统的一致性。",
					DependsOn:        []string{"architect"},
					RecommendedAgent: options.AgentType,
					Role:             "frontend",
					TemplateHint:     "react-feature",
					Title:            "实现前端功能",
				},
				{
					AcceptanceCriteria: []string{
						"接口接入路径已打通。",
						"关键状态与错误反馈可验证。",
					},
					BranchSuffix:     "integration",
					Deliverable:      "前后端集成与状态接线",
					Description:      "连接真实接口、状态管理和缓存策略，确保前端行为与后端契约一致。",
					DependsOn:        []string{"architect", "frontend"},
					RecommendedAgent: options.AgentType,
					Role:             "integration",
					TemplateHint:     "integration-wireup",
					Title:            "完成集成接线",
				},
				{
					AcceptanceCriteria: []string{
						"关键用户流程通过验证。",
						"主要交互缺陷已记录或修复。",
					},
					BranchSuffix:     "tester",
					Deliverable:      "前端体验验证结果",
					Description:      "验证关键用户路径、交互反馈和回归风险，并形成交付检查结论。",
					DependsOn:        []string{"integration"},
					RecommendedAgent: options.AgentType,
					Role:             "tester",
					TemplateHint:     "ui-acceptance",
					Title:            "执行前端验收",
				},
			}
		},
	},
	{
		Template: Template{ID: "repo-wide-refactor", Roles: []string{"architect", "refactor", "verifier", "integration"}},
		buildPlan: func(options BuildOptions) []Node {
			return []Node{
				{
					AcceptanceCriteria: []string{
						"改造范围、风险点和回滚策略已定义。",
						"重构切片顺序与依赖关系明确。",
					},
					BranchSuffix:     "architect",
					Deliverable:      options.Title + " 的重构蓝图",
					Description:      "梳理跨仓库重构边界、风险点、受影响模块与渐进式落地顺序。",
					RecommendedAgent: options.AgentType,
					Role:             "architect",
					TemplateHint:     "refactor-plan",
					Title:            "定义重构范围与切片",
				},
				{
					AcceptanceCriteria: []string{
						"核心重构切片已落地。",
						"关键模块保持编译通过并与设计保持一致。",
					},
					BranchSuffix:     "refactor",
					Deliverable:      "主要重构改动",
					Description:      "执行主重构切片，统一接口、命名或架构结构，并保持变更具有可审查性。",
					DependsOn:        []string{"architect"},
					RecommendedAgent: options.AgentType,
					Role:             "refactor",
					TemplateHint:     "repo-refactor",
					Title:            "实施主重构切片",
				},
				{
					AcceptanceCriteria: []string{
						"构建、测试或静态检查已覆盖主要风险。",
						"回归风险与遗留问题已记录。",
					},
					BranchSuffix:     "verifier",
					Deliverable:      "回归验证报告",
					Description:      "执行回归验证、构建与测试，确认跨模块重构没有引入关键回归。",
					DependsOn:        []string{"refactor"},
					RecommendedAgent: options.AgentType,
					Role:             "verifier",
					TemplateHint:     "refactor-verification",
					Title:            "执行回归验证",
				},
				{
					AcceptanceCriteria: []string{
						"集成和回滚关注点已整理。",
						"后续 integration run 所需说明完整。",
					},
					BranchSuffix:     "integration",
					Deliverable:      "集成准备说明",
					Description:      "汇总重构验证结论、剩余风险和合并注意事项，为 integration run 提供操作说明。",
					DependsOn:        []string{"verifier"},
					RecommendedAgent: options.AgentType,
					Role:             "integration",
					TemplateHint:     "release-readiness",
					Title:            "整理集成与回滚说明",
				},
			}
		},
	},
}

func List() []Summary {
	result := make([]Summary, 0, len(definitions))
	for _, definition := range definitions {
		result = append(result, Summary{
			ID:        definition.ID,
			NodeCount: len(definition.Roles),
			Roles:     append([]string(nil), definition.Roles...),
		})
	}
	return result
}

func BuildSeed(templateID string, options BuildOptions) *Seed {
	normalizedID := strings.TrimSpace(templateID)
	for _, definition := range definitions {
		if definition.ID != normalizedID {
			continue
		}

		agentType := strings.TrimSpace(options.AgentType)
		if agentType == "" {
			agentType = "codex-cli"
		}

		title := strings.TrimSpace(options.Title)
		if title == "" {
			title = "Untitled task"
		}

		description := strings.TrimSpace(options.Description)
		if description == "" {
			description = title
		}

		nodes := definition.buildPlan(BuildOptions{
			AgentType:   agentType,
			Description: description,
			Title:       title,
		})
		subtasks := append([]Node(nil), nodes...)

		return &Seed{
			Template: Template{
				ID:    definition.ID,
				Roles: append([]string(nil), definition.Roles...),
			},
			Plan: Plan{
				Notes:         "Seeded from template " + definition.ID + " and ready for operator review.",
				Nodes:         nodes,
				Subtasks:      subtasks,
				TemplateID:    definition.ID,
				TemplateLabel: definition.ID,
			},
		}
	}

	return nil
}
