# NodePulse

部署在 Cloudflare Workers 上的服务器监控面板（对标 nezha），**无独立管理端服务器**、**仅使用免费额度**、**安全优先**、**大屏优先**。

当前仓库只包含设计文档与大屏原型，代码由实现 Agent 按文档产出。

## 文档索引（按阅读顺序）

| 文件                                                               | 读者                | 内容                                                                                                                              |
| ------------------------------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                       | 实现 Agent / 工程师 | 总体架构、Durable Object Hub 设计、数据模型、免费额度核算、Agent 设计、仓库结构、部署流程                                         |
| [docs/SECURITY.md](docs/SECURITY.md)                               | 所有人（合并门槛）  | 安全原则、威胁模型、Passkey 认证、会话、Agent 令牌、CSP、输入校验、密钥、通知出站、Agent 加固、供应链、边缘配置、**§14 检查清单** |
| [docs/API-AND-PROTOCOL.md](docs/API-AND-PROTOCOL.md)               | 实现 Agent          | HTTP API、Agent WebSocket 协议、Viewer 协议、告警语义、安装命令、错误码                                                           |
| [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md)         | 实现 Agent          | 工作规则、M0–M6 里程碑、每个里程碑的任务与验收标准、踩坑预防                                                                      |
| [docs/HANDOFF-PLAYBOOK.md](docs/HANDOFF-PLAYBOOK.md)               | 项目负责人          | 每个里程碑可直接复制的启动/审查/修复指令、验收动作、常见情况应答                                                                  |
| [docs/FRONTEND-DESIGN.md](docs/FRONTEND-DESIGN.md)                 | Figma 设计师 / 前端 | 设计概念、令牌（颜色/字体/间距/动效）、组件清单、各页面规格、**大屏规格**、Figma 文件组织                                         |
| [docs/design/wall-prototype.html](docs/design/wall-prototype.html) | 设计师 / 前端       | 大屏可运行原型：用浏览器打开即可；按 `1`/`2` 切换 Map/Grid 场景，按 `R` 触发一次全员上报                                          |

## 三条硬约束

1. **安全第一**：无远程执行、无口令、Passkey 登录、默认私有、Agent 数据视为不可信输入。
2. **免费额度**：单例 Durable Object + WebSocket（入站消息 20:1 计费）+ 环形表零删除；免费版舒适支持约 40 台服务器（1 分钟粒度）。
3. **大屏极致好看**：Observatory 概念 —— 点阵地图 + 心跳涟漪 + 心电线 + 带宽河流。

## 给实现 Agent 的一句话

先读 `IMPLEMENTATION-PLAN.md` §0 工作规则，再按 M0 → M6 执行；每个 PR 逐条勾选 `SECURITY.md` §14，并核对 `ARCHITECTURE.md` §7 额度表。
