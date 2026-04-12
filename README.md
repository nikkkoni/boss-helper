> [!CAUTION]
> 本项目仅供学习交流，禁止用于商业用途。
>
> 使用自动投递脚本存在账号风险，包括但不限于限流、降权、异常提醒、封禁等。请自行评估风险，本项目不承担任何责任。

# Boss Helper

Boss Helper 是一个面向 Boss 直聘场景的浏览器扩展，用来减少职位筛选、简历投递、聊天跟进中的重复劳动。

当前项目形态不是单纯的插件 UI，而是一套完整的执行链路：

- 浏览器扩展负责页面内 DOM 自动化、投递、聊天与状态展示
- `SiteAdapter` + 选择器注册表收敛站点耦合
- applying pipeline 负责规则过滤、高德通勤、AI 审核、招呼语等步骤编排
- 本地 companion bridge 提供 CLI / HTTP / SSE / MCP 自动化入口

## 核心能力

- 批量投递和定向投递
- 文本规则、公司规则、薪资规则过滤
- 高德通勤距离 / 时间过滤
- 内部 AI 审核与外部 AI 审核闭环
- 自动招呼和聊天消息发送
- 统计、结构化日志、token / 费用追踪
- CLI、orchestrator、MCP server、本地 bridge 自动化接入

## 安装方式

- Chrome: <https://chrome.google.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn>
- Edge: <https://microsoftedge.microsoft.com/addons/detail/jcllnbjfeamhihjpfjlclhdnjmggbgal>
- Firefox: <https://addons.mozilla.org/zh-TW/firefox/addon/boss-helper/>
- GitHub Releases: <https://github.com/Ocyss/boos-helper/releases/latest>

如果你要调试代码、验证新功能或接入 agent，建议使用源码本地加载。

## 文档导航

- [docs/architecture-analysis.md](docs/architecture-analysis.md): 系统分层、agent flow、投递 pipeline、消息通信层
- [docs/bridge-mcp-deployment.md](docs/bridge-mcp-deployment.md): bridge / relay / CLI / MCP 部署、环境变量、protobuf 说明
- [docs/llm-agent-mcp.md](docs/llm-agent-mcp.md): 外部 LLM Agent 的推荐调用顺序和工具语义
- [CONTRIBUTING.md](CONTRIBUTING.md): 开发规范、验证要求、PR 流程

## 架构摘要

核心执行链路如下：

```text
CLI / MCP / 外部 Agent
  -> agent-bridge (HTTP/SSE)
  -> relay 页面
  -> background.ts
  -> content.ts
  -> main-world.ts
  -> useDeliveryControl
  -> SiteAdapter / Applying Pipeline
  -> Boss 页面 DOM 与接口
```

补充两点运行语义：

- `relayConnected` 只表示 bridge 当前有 relay 页面连着 `/events` SSE，不等于目标 Boss 页一定可控。
- relay 页面里的 `events` 徽标表示 relay 是否持有扩展 background 的外部事件端口；当前会通过 20 秒 keepalive 维持，降低 Chrome MV3 空闲回收导致的周期性断开。

关键入口文件：

| 路径 | 作用 |
| --- | --- |
| `src/entrypoints/background.ts` | 校验 relay 来源和 token，转发外部命令到目标标签页 |
| `src/entrypoints/content.ts` | 注入 main-world 脚本并建立消息桥 |
| `src/entrypoints/main-world.ts` | 选择站点 adapter、挂载 Vue UI、运行页面模块 |
| `src/pages/zhipin/hooks/useDeliveryControl.ts` | 页面控制器，统一处理 agent 命令 |
| `src/composables/useApplying/services/pipelineFactory.ts` | 投递 pipeline 编排 |
| `src/site-adapters/zhipin/adapter.ts` | Zhipin 站点适配 |
| `scripts/agent-bridge.mjs` | 本地 companion 服务 |
| `scripts/agent-relay.html` | relay 页面，负责 bridge 命令转发、事件回传与 MV3 keepalive |
| `scripts/agent-mcp-server.mjs` | stdio MCP 兼容入口，实际启动 `scripts/mcp/server.mjs` |

## 快速开始

### 普通使用

1. 安装商店版扩展，或本地加载构建产物。
2. 打开 Boss 职位页并登录账号。
3. 打开插件面板，先用保守配置做小批量测试。
4. 确认日志和统计正常后，再逐步放大投递规模。

当前支持的职位页路径：

- `/web/geek/job`
- `/web/geek/job-recommend`
- `/web/geek/jobs`

### 本地源码安装

```bash
git clone https://github.com/Ocyss/boos-helper.git
cd boos-helper
pnpm install
pnpm build:chrome
```

构建完成后，在 Chromium 浏览器开发者模式中加载 `.output/chrome-mv3/`。

如果你后续要使用 agent / CLI / MCP，请先记下扩展 ID。

### Agent / CLI / MCP

1. 保证扩展已安装，且至少打开一个 Boss 职位页。
2. 运行一键启动：

```bash
pnpm agent:start -- --extension-id <你的扩展ID>
```

3. `pnpm agent:start` 会优先复用已健康运行的 bridge；如果你手动执行 `pnpm agent:bridge`，而 4317/4318 已被占用，则会直接报 `EADDRINUSE`。
4. 首次打开 relay 页面时接受本地自签名证书，并保持页面常驻；建议确认页面状态至少为 `bridge: connected` 和 `events: connected`。
5. 运行诊断：

```bash
pnpm agent:doctor
```

6. 然后按需要选择：

```bash
pnpm agent:cli -- stats
pnpm agent:mcp
pnpm agent:orchestrate -- --query 前端 --include vue,react --start --watch
```

完整部署说明见 [docs/bridge-mcp-deployment.md](docs/bridge-mcp-deployment.md)。

## Agent 命令概览

页面控制器当前支持这些命令：

- 批处理控制：`start`、`pause`、`resume`、`stop`、`stats`、`navigate`
- 简历 / 职位：`resume.get`、`jobs.list`、`jobs.detail`、`jobs.review`、`logs.query`
- 聊天：`chat.list`、`chat.history`、`chat.send`
- 配置：`config.get`、`config.update`

bridge 额外提供：

- `POST /batch`
- `GET /agent-events`

MCP server 会把这些能力包装成 `boss_helper_*` 系列 tools。详细映射见 [docs/llm-agent-mcp.md](docs/llm-agent-mcp.md)。

在此基础上，MCP 现在还提供：

- 高层聚合 tool：`boss_helper_agent_context`
- 可读资源：自主投递工作流、审核闭环说明、当前 bridge 上下文
- 可复用 prompts：定向投递和外部审核闭环模板

这让外部 Agent 可以直接读取运行上下文和推荐工作流，而不只是手工拼底层命令。

## 本地开发流程

### 启动开发模式

```bash
pnpm dev
pnpm dev:edge
pnpm dev:firefox
```

### 核心校验命令

最小验证集：

```bash
pnpm lint && pnpm check && pnpm test -- --run
```

其他常用命令：

```bash
pnpm test:watch
pnpm test:coverage
pnpm test:e2e
pnpm build:chrome
pnpm build:firefox
pnpm build:edge
pnpm build
pnpm zip
```

### 常见开发路径

| 场景 | 推荐路径 |
| --- | --- |
| 改 DOM 选择器 / 页面解析 | `selectors.ts` -> `SiteAdapter` -> Boss 页面手工验证 |
| 改投递逻辑 | `useDeliveryControl` / `useAgentBatchRunner` / `useDeliver` -> `pnpm test` |
| 改 pipeline | `useApplying/services/` -> `pnpm test` + 日志校验 |
| 改 bridge / MCP | `scripts/` -> `pnpm agent:doctor` + `pnpm agent:cli -- status` |
| 改聊天能力 | `chat.proto` / websocket hooks -> 关注 `chat.list` / `chat.history` / `chat.send` |

## 目录速览

| 目录 | 说明 |
| --- | --- |
| `src/entrypoints/` | background / content / main-world 入口 |
| `src/pages/zhipin/` | 站点页面逻辑、组件、批处理 hooks、查询 hooks |
| `src/site-adapters/` | 站点抽象层，当前包含 `ZhipinAdapter` |
| `src/composables/useApplying/` | 投递 pipeline、过滤步骤、AI、招呼语 |
| `src/composables/useWebSocket/` | Boss 聊天 WebSocket / protobuf 相关实现 |
| `src/message/` | 跨上下文消息协议和代理 |
| `src/stores/` | Pinia stores：配置、职位、日志、统计、agent 状态 |
| `scripts/` | bridge、CLI、MCP、orchestrator、本地运维脚本 |
| `scripts/mcp/` | MCP transport、catalog、handler、context 拆分模块 |
| `scripts/shared/` | Node agent 侧共享协议、安全与日志辅助 |
| `tests/` | 单元测试与集成测试 |

## 已知边界

- 最大运行风险仍然来自 Boss 页面 DOM 结构变化。
- relay 页面当前按 Chromium 浏览器链路设计，CLI / MCP 调用前必须保证 relay 在线。
- bridge 默认只适合 localhost 使用，不应直接暴露到公网。
- 聊天读取能力基于当前页面采集视图，不保证覆盖 Boss 全量历史消息。

## 贡献

提 PR 前请至少执行：

```bash
pnpm lint && pnpm check && pnpm test -- --run
```

详细要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 相关链接

- GitHub: <https://github.com/Ocyss/boos-helper>
- 飞书反馈问卷: <https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g>
- 飞书问卷结果: <https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc>
- GreasyFork 旧版本: <https://greasyfork.org/zh-CN/scripts/491340>
