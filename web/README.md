# EAT Web Frontend

这个目录是 EAT 的前端工程，不是独立产品，也不是通用 Vite 模板。

它负责提供操作者使用的 Web 界面，包括：

- 控制台首页
- 项目注册与项目列表
- 任务创建页
- 项目任务列表
- 任务工作台
- 系统设置页

前端通过相对路径 `/api/*` 调用 Go 后端；开发模式下由 Vite 代理到 `http://127.0.0.1:3000`，生产模式下由 Go 服务承载 `web/dist`。

## 技术栈

- React 19
- TypeScript
- Vite 8
- React Router 7
- Tailwind CSS 4
- Radix UI / Base UI 基础组件

## 开发前先读

如果你是在这个仓库里做实现或让代理自动工作，建议按这个顺序读：

1. `/home/code/EAT/AGENTS.md`
2. `/home/code/EAT/README.md`
3. `/home/code/EAT/docs/README.md`
4. `/home/code/EAT/docs/HERMES-AUTONOMY-TRIAL.md` 仅在做高自治试验时必读
5. 当前要改的前端页面、组件、API wrapper

不要把这里当成可随意重构的独立 SPA。它是 EAT 产品工作流的一部分，前端状态、字段和按钮语义必须和后端任务生命周期保持一致。

## 目录结构

```text
web/
├── src/app/                  # 应用 provider、路由装配
├── src/components/           # 共享布局与基础 UI 组件
├── src/features/projects/    # 项目注册、项目列表
├── src/features/system/      # 控制台、系统设置
├── src/features/tasks/       # 任务创建、项目任务、任务工作台
├── src/hooks/                # 通用 hooks
├── src/lib/                  # API client、类型、格式化、主题、偏好
├── public/                   # 静态资源
└── dist/                     # 构建产物，供 Go 后端在生产模式下提供
```

关键入口：

- `src/main.tsx`
  React 挂载入口
- `src/App.tsx`
  Provider + Router 装配
- `src/app/router.tsx`
  页面路由定义
- `src/lib/api/*.ts`
  按领域拆分的 API wrapper

## 实际命令

安装依赖：

```bash
cd /home/code/EAT/web
pnpm install
```

启动前端开发服务器：

```bash
cd /home/code/EAT/web
pnpm dev
```

默认通过 Vite 在本地提供页面，并把 `/api` 代理到 Go 后端：

```text
http://127.0.0.1:3000
```

静态检查：

```bash
cd /home/code/EAT/web
pnpm lint
```

构建前端：

```bash
cd /home/code/EAT/web
pnpm build
```

根目录等价命令：

```bash
cd /home/code/EAT
npm run build:ui
```

## 联调方式

推荐本地联调顺序：

1. 在仓库根目录启动 Go 后端：`npm start`
2. 在 `web/` 启动前端开发服务器：`pnpm dev`
3. 通过浏览器访问 Vite 开发地址

如果你改的是：

- 路由和页面展示：至少跑 `pnpm lint` 和 `pnpm build`
- API 交互：同时验证前端行为和对应后端接口
- 任务创建、任务工作台、项目注册：不要只看 UI，要确认没有偏离 EAT 的任务/项目语义

## 自动代理注意事项

对 Hermes、Codex 或其他自动代理，这里最容易犯的错误有三类：

- 把前端当成通用后台模板，擅自重命名或改写产品语义
- 只改页面文案和交互，不核对后端 API 与状态机
- 在未读根级文档时直接大面积重构 `src/features/tasks/`

如果任务涉及以下内容，先回到仓库根文档再改：

- 任务状态或子任务状态
- 任务创建流程
- 任务工作台动作
- 审查、集成、合并语义
- 项目注册与仓库约束
