# NodePulse

部署在 Cloudflare Workers 上的服务器监控面板：没有独立的管理端服务器，运行在 Cloudflare 免费额度内，安全优先，为大屏展示而设计。

## 组成

| 目录                | 内容                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/hub`          | Cloudflare Worker + Durable Object（TypeScript / Hono）：API、Passkey 认证、Agent 与浏览器的 WebSocket 通道、指标存储与告警 |
| `apps/web`          | 前端（React / Vite / Tailwind）：总览、服务器详情、大屏、后台                                                               |
| `packages/protocol` | Hub 与前端共用的消息与接口 schema（zod）                                                                                    |
| `agent`             | Go 采集端：只上报、不监听端口、不执行命令                                                                                   |
| `scripts`           | 本地开发与发布辅助脚本                                                                                                      |

## 开发

```bash
pnpm install
pnpm dev          # 构建前端并启动本地 Worker（wrangler dev，本地模拟 D1 与 Durable Object）
pnpm test
pnpm lint
pnpm typecheck
```

Go 采集端：

```bash
cd agent && go test ./...
```

## 安全边界

- 采集端只向 Hub 上报数据，不接受任何可执行指令，不监听端口，以专用用户和 systemd 加固运行。
- 管理员只能用 Passkey（WebAuthn）登录，系统不存在口令。
- 面板默认私有；只读访问通过可撤销的分享令牌。
- 所有输入经严格 schema 校验，SQL 全部参数化，前端不加载任何第三方资源。

## 部署

需要一个开启了双因素认证的 Cloudflare 账户。本地执行 `wrangler login` 后运行 `pnpm setup:cf` 创建资源与密钥，再 `wrangler deploy`，首次访问 `/setup` 注册 Passkey。

## 许可证

TODO(human)
