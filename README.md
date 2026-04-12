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
- [todo.md](todo.md): MCP 全自动化路线图、下一位 agent 约束和详细任务清单
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

3. `pnpm agent:start` 会优先复用已健康运行的 bridge；在 macOS 下默认会用 `Google Chrome` 打开 relay 页面，也可以用 `--browser` 覆盖；如果你手动执行 `pnpm agent:bridge`，而 4317/4318 已被占用，则会直接报 `EADDRINUSE`。
4. 首次打开 relay 页面时接受本地自签名证书，并保持页面常驻；建议确认页面状态至少为 `bridge: connected` 和 `events: connected`。
5. 运行诊断：

```bash
pnpm agent:doctor
```

6. 然后按需要选择：

```bash
pnpm agent:cli stats
pnpm agent:mcp
pnpm agent:orchestrate -- --query 前端 --include vue,react --start --watch
```

补充说明：仓库内置的 MCP server 同时兼容 `Content-Length` framed stdio 和 newline-delimited JSON-RPC。像 OpenCode 1.4.x 这类按行发送 JSON-RPC 的客户端，也可以直接加载 `pnpm agent:mcp`。

完整部署说明见 [docs/bridge-mcp-deployment.md](docs/bridge-mcp-deployment.md)。

## Agent 命令概览

页面控制器当前支持这些命令：

- 批处理控制：`start`、`pause`、`resume`、`stop`、`stats`、`navigate`
- 只读诊断：`readiness.get`、`plan.preview`
- 简历 / 职位：`resume.get`、`jobs.list`、`jobs.refresh`、`jobs.detail`、`jobs.review`、`logs.query`
- 聊天：`chat.list`、`chat.history`、`chat.send`
- 配置：`config.get`、`config.update`

bridge 额外提供：

- `POST /batch`
- `GET /agent-events`

MCP server 会把这些能力包装成 `boss_helper_*` 系列 tools。详细映射见 [docs/llm-agent-mcp.md](docs/llm-agent-mcp.md)。

在此基础上，MCP 现在还提供：

- 冷启动引导 tool：`boss_helper_bootstrap_guide`
- 高层聚合 tool：`boss_helper_agent_context`
- 可读资源：自主投递工作流、审核闭环说明、当前 bridge 上下文
- 可复用 prompts：定向投递和外部审核闭环模板

这让外部 Agent 可以直接读取运行上下文和推荐工作流，而不只是手工拼底层命令。

如果外部 Agent 还不确定环境是否已经搭好，推荐先调用 `boss_helper_bootstrap_guide`。它会只读汇总 bridge 是否在线、relay 是否已连接、relay 是否已知 extension ID、Boss 职位页是否存在，以及下一步最小动作应该由谁执行。当前它会把步骤明确区分成需要人工完成的冷启动动作，以及扩展链路准备好后可由 Agent 继续调用的动作。

当前推荐做法是优先读取 `boss_helper_agent_context`。它会默认附带 readiness snapshot，用于区分 Boss 页不存在、页面不受支持、页面未初始化、需要登录、验证码 / 风控阻断和可继续分析这几类状态。只有在 bridge / CLI 排障时，才建议直接调用 `readiness.get`。

当 page-level readiness 或命令失败返回 `suggestedAction=refresh-page` 时，优先调用 `boss_helper_jobs_refresh`。它只会重载当前受支持的职位列表页，不会改动现有搜索条件；这也是它和 `boss_helper_navigate` 的边界。它也不会像 `boss_helper_jobs_detail` 或 `boss_helper_start` 那样读取详情或触发执行，只负责把页面恢复到新的初始化状态。

在真正调用 `start` 之前，推荐再补一层 `boss_helper_plan_preview`。它会复用当前页面和配置做只读预演，告诉外部 Agent 哪些岗位会被直接跳过、哪些需要外部 AI 审核、哪些因为缺少信息还不能安全进入执行链路。

Phase 4 当前最小增量已经把 run/session checkpoint 接进现有 `stats` 路径：`boss_helper_stats.data.run.current` 表示当前或可恢复的运行摘要，`boss_helper_stats.data.run.recent` 表示最近一次运行摘要；`boss_helper_agent_context.summary` 也会补充 `hasActiveRun`、`currentRunId`、`recentRunState`、`resumableRun`，方便外部 Agent 先判断“当前是否已经有 run 在进行中”以及“最近一次 run 是否还能直接 resume”。当前恢复边界是：`paused` 可以继续 `resume`，`error` 应先 `refresh-page` 后重建上下文，`completed` / `stopped` 只保留审计与排障摘要，不建议盲目恢复。

除 readiness snapshot 外，bridge 和关键页面命令失败时现在也会统一返回 `code`、`message`、`retryable`、`suggestedAction`。目前已覆盖 `navigate`、`resume.get`、`jobs.detail`、`chat.send`，以及 `events_recent`、`wait_for_event`、`config.update`、`start / pause / resume / stop` 这组事件与控制链路。page-level readiness 的 `suggestedAction` 仍稳定收敛为 `navigate`、`wait-login`、`refresh-page`、`stop`、`continue`；命令级失败额外可能返回 `retry`、`fix-input`、`reconnect-relay`、`resume`，方便外部 Agent 区分“直接重试”与“先修输入/恢复 relay / 恢复暂停中的批次”。如果当前已经停留在受支持职位页，`refresh-page` 的低风险对应原语就是 `boss_helper_jobs_refresh`。

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
| 改 bridge / MCP | `scripts/` -> `pnpm agent:doctor` + `pnpm agent:cli status` |
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
