# EAT Deployment On This Server

本项目当前部署在本机，通过 `systemd + nginx-gateway + Cloudflare` 对外提供访问。

## Public Entry

- 域名: `https://eat.735678.xyz/`
- Cloudflare DNS:
  - `eat.735678.xyz -> 45.127.35.239`
  - `proxied = true`
- nginx gateway:
  - 配置文件: `/home/nginx-gateway/nginx.conf`
  - upstream: `eat_app`
  - upstream 地址: `127.0.0.1:3000`

## Runtime

- systemd service: `eat.service`
- service file: `/etc/systemd/system/eat.service`
- working directory: `/home/code/EAT`
- listen host: `127.0.0.1`
- listen port: `3000`
- start command: `npm start`

当前网关链路：

`Browser -> Cloudflare -> nginx-gateway -> 127.0.0.1:3000 -> /home/code/EAT`

## Deploy Procedure

每次修改后，如果改动影响了服务端 JavaScript，必须重新部署，否则线上仍是旧进程代码。

标准部署步骤：

1. 进入项目目录
   - `cd /home/code/EAT`
2. 重建前端样式产物
   - `npm run build:ui`
3. 如果改了 `src/services/sandbox-manager.js`、`docker/worker-base/Dockerfile` 或任何 worker 运行时相关代码，先重建 worker 镜像
   - `npm run build:worker-image`
4. 如有需要先跑测试
   - `node --test tests/project-api.test.js tests/project-ui.test.js`
5. 重启服务
   - `systemctl restart eat.service`
6. 检查服务状态
   - `systemctl status eat.service --no-pager`
7. 验证本机服务
   - `curl -i -s http://127.0.0.1:3000/`
8. 验证网关域名
   - `curl -k -i -s --resolve eat.735678.xyz:443:127.0.0.1 https://eat.735678.xyz/`

## Notes

- 仅改静态文件时，Node 进程会直接读取磁盘上的最新 `index.html` / `app.css` / `app.js`，但为了避免状态不一致，仍建议按上面的流程统一重启一次。
- 如果改了 `/etc/systemd/system/eat.service`，重启前先执行：
  - `systemctl daemon-reload`
- 如果改了 `/home/nginx-gateway/nginx.conf`，重载网关：
  - `docker exec nginx-gateway nginx -s reload`
- 如果 Docker 健康检查显示镜像缺失或缺少工具，优先执行：
  - `npm run build:worker-image`
- 对外访问失败时，优先检查三层：
  - `systemctl status eat.service --no-pager`
  - `ss -tlnp | rg '127\\.0\\.0\\.1:3000\\b'`
  - `curl -k -i -s --resolve eat.735678.xyz:443:127.0.0.1 https://eat.735678.xyz/`
