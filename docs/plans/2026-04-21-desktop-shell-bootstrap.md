# EAT Desktop Shell Bootstrap Plan

> **For Hermes:** Use docs-driven-autonomous-rollout. This doc only defines the shell boundary; do not implement a desktop wrapper yet.

**Goal:** 为未来桌面壳收口最小接入面，让现有 React Web 控制面不再假设自己一定运行在纯浏览器同源环境。

**Architecture:** 桌面壳只负责三件事：启动或连接本地 Go backend、提供 WebView 容器、通过全局平台对象把 `apiBaseUrl` / shell 元数据注入前端。业务编排、任务状态、Agent 调度都仍留在现有 Go backend + React 控制面内。

**Tech Stack:** React + Vite frontend, Go backend, future Tauri/Electron-class shell.

---

## 最小壳层职责

1. 启动或连接本地 Go backend
2. 承载 WebView
3. 向前端注入平台能力：
   - `apiBaseUrl`
   - `shell`
   - `kind`
4. 不承载业务编排逻辑

## 建议注入协议

桌面壳在 WebView 启动前注入：

```js
window.__EAT_PLATFORM__ = {
  kind: 'desktop-hosted',
  shell: 'tauri',
  apiBaseUrl: 'http://127.0.0.1:3000'
}
```

## 当前前端已预留的适配面

- `web/src/lib/platform.ts`
  - 统一读取平台能力
  - 统一解析 API baseURL
- `web/src/lib/api/client.ts`
  - 所有 API 请求统一通过平台层解析 URL
- `web/src/main.tsx`
  - 会把平台信息写入 `document.documentElement.dataset`

## 暂不做的事

- 不落地 Tauri/Electron 工程
- 不拆 monorepo
- 不做 shell 内部任务编排
- 不把平台判断散落到页面层

## 验收标准

- 纯 Web 下不回归
- 当桌面壳注入 `window.__EAT_PLATFORM__.apiBaseUrl` 时，前端 API 请求可以改走该地址
- 页面组件不需要感知“浏览器还是桌面壳”
