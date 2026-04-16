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
- 简历 / 职位：`resume.get`、`jobs.list`、`jobs.current`、`jobs.refresh`、`jobs.detail`、`jobs.review`、`logs.query`
- 聊天：`chat.list`、`chat.history`、`chat.send`
- 配置：`config.get`、`config.update`

bridge 额外提供：

- `POST /batch`
- `GET /agent-events`

MCP server 会把这些能力包装成 `boss_helper_*` 系列 tools。详细映射见 [docs/llm-agent-mcp.md](docs/llm-agent-mcp.md)。

在此基础上，MCP 现在还提供：

- 冷启动引导 tool：`boss_helper_bootstrap_guide`
- 高层聚合 tool：`boss_helper_agent_context`
- 审计报告 tool：`boss_helper_run_report`
- 可读资源：自主投递工作流、审核闭环说明、当前 bridge 上下文
- 可复用 prompts：定向投递和外部审核闭环模板

这让外部 Agent 可以直接读取运行上下文和推荐工作流，而不只是手工拼底层命令。

如果外部 Agent 还不确定环境是否已经搭好，推荐先调用 `boss_helper_bootstrap_guide`。它会只读汇总 bridge 是否在线、relay 是否已连接、relay 是否已知 extension ID、Boss 职位页是否存在，以及下一步最小动作应该由谁执行。当前它会把步骤明确区分成需要人工完成的冷启动动作，以及扩展链路准备好后可由 Agent 继续调用的动作。

当前推荐做法是优先读取 `boss_helper_agent_context`。它会默认附带 readiness snapshot，用于区分 Boss 页不存在、页面不受支持、页面未初始化、需要登录、验证码 / 风控阻断和可继续分析这几类状态。只有在 bridge / CLI 排障时，才建议直接调用 `readiness.get`。

`boss_helper_agent_context` 现在还会额外返回一个结构化 `workflow`，把仓库里已经在 `agent-orchestrator` 中验证过的高层流程片段下沉到 MCP：例如当前应优先做冷启动自举、恢复页面、处理待审核闭环、观察进行中的 run、恢复 paused run，还是先做岗位分析与 `plan.preview`。这比单纯阅读 `recommendations` 更适合让外部 Agent 做稳定分支，因为它同时给出 `stage`、`goal`、`why`、`nextActions`、`recommendedTools`，以及在事件驱动阶段额外给出的 `eventFocus.watchTypes` / `eventFocus.terminalTypes`、在岗位分析阶段给出的 `candidateFocus.inspectFirst`、在已拿到 preview 时给出的 `planFocus`，避免外部 Agent 再复制一整套 orchestrator 判断，或自己猜该优先盯哪些事件、先读哪几个岗位、preview 之后该先收敛哪条分支。当前如果显式带 `include=['plan']`，MCP 聚合层会先优先收敛到“当前已选中岗位”，否则再退回 `candidateFocus.inspectFirst` 的少量岗位做只读 preview，而不是默认对整页岗位做一次 full preview。最新增量还会在 `sections.plan.scope` 和 `workflow.planFocus.scope` 中显式透出这次聚合 preview 的来源与命中岗位：当前至少区分 `selected-current-job`、`candidate-focus` 和 `page-default`，外部 Agent 不必再从 `targetJobIds` 反推这次 preview 是如何收敛出来的。

当 page-level readiness 或命令失败返回 `suggestedAction=refresh-page` 时，优先调用 `boss_helper_jobs_refresh`。它只会重载当前受支持的职位列表页，不会改动现有搜索条件；这也是它和 `boss_helper_navigate` 的边界。它也不会像 `boss_helper_jobs_detail` 或 `boss_helper_start` 那样读取详情或触发执行，只负责把页面恢复到新的初始化状态。

`boss_helper_navigate` 现在还多了一条保守恢复边界：如果当前唯一的 Boss 标签页已经漂移到不受支持的站内页面，例如 `verify.html`、首页或其他非职位搜索路由，background 会直接在现有 Boss tab 上重写 URL，把页面带回受支持的职位搜索页，而不是再要求页面内 agent controller 先就绪。对 `verify.html` 这类带 `callbackUrl` 的页面，会优先复用 callback 里的目标职位页；其他 unsupported Boss 页则回退到 `/web/geek/jobs`。这条放宽只作用于外部 `navigate`，不会把其他写命令一并放开到 unsupported page。

如果页面里已经有一个岗位卡片处于当前选中状态，优先调用 `boss_helper_jobs_current`。它只读取“当前页面已经选中的岗位快照”，不会主动点击列表、不会切换卡片，也不会等待新的详情加载；这也是它和 `boss_helper_jobs_detail` 的边界。后者仍适用于“指定某个 `encryptJobId` 并在需要时主动加载该岗位详情”的场景。

在真正调用 `start` 之前，推荐再补一层 `boss_helper_plan_preview`。它会复用当前页面和配置做只读预演，告诉外部 Agent 哪些岗位会被直接跳过、哪些需要外部 AI 审核、哪些因为缺少信息还不能安全进入执行链路。需要注意的是，直接调用 `boss_helper_plan_preview` 仍保持它原本的显式语义；只有 `boss_helper_agent_context(include=['plan'])` 会默认把 preview 收敛到少量候选岗位，优先服务于低扰动的上下文聚合。

Phase 4 当前最小增量已经把 run/session checkpoint 接进现有 `stats` 路径：`boss_helper_stats.data.run.current` 表示当前或可恢复的运行摘要，`boss_helper_stats.data.run.recent` 表示最近一次运行摘要；`boss_helper_agent_context.summary` 也会补充 `hasActiveRun`、`currentRunId`、`recentRunState`、`resumableRun`，方便外部 Agent 先判断“当前是否已经有 run 在进行中”以及“最近一次 run 是否还能直接 resume”。当前恢复边界是：`paused` 默认可继续 `resume`，但如果 `risk.delivery.reached=true` 或 `run.lastError.code=run-delivery-limit-reached`，就不应直接恢复；`error` 应先 `refresh-page` 后重建上下文，`completed` / `stopped` 只保留审计与排障摘要，不建议盲目恢复。

Phase 7 的首个增量则把安全护栏摘要也接入了 `stats`：`boss_helper_stats.data.risk` 会汇总当前 `deliveryLimit` 使用情况、剩余额度、去重/通知/缓存护栏是否开启、AI 自动回复等高风险开关，以及结构化 `warnings`。对应地，`boss_helper_agent_context.summary` 也会补充 `riskLevel`、`riskWarningCount`、`remainingDeliveryCapacity`，让外部 Agent 在决定是否 `start` 之前，先看到当前风险面而不是只看页面是否可控。最新补充的 `risk.observed.sessionDuplicates` 还会把当前会话里“已经沟通过 / 相同公司已投递 / 相同 HR 已投递 / 其他重复原因”的命中次数拆开，方便外部 Agent 判断真正起作用的是哪一道去重护栏，而不是只看到一个总的 `repeatFilteredToday`。

Phase 8 的当前最小增量则把可观测性和审计视图补进了 MCP：`boss_helper_run_report` 会直接聚合 `boss_helper_stats`、`boss_helper_logs_query` 和最近事件，输出当前或最近一次 run 的结构化 `decisionLog`、分类计数、审核摘要和恢复建议。它会把日志统一归类为 `execution` / `business` / `risk` / `page` / `config` / `system` 六类，方便外部 Agent 在失败后快速判断是页面问题、配置问题、风险护栏，还是业务过滤导致的跳过；同时它也会保留外部 AI 审核的通过/拒绝结论与待审核事件计数，但当前仍只覆盖 `current/recent run + recent events`，不是完整历史审计库。最新仓库侧增量还把同一套稳定审计归因下沉到了 `boss_helper_logs_query`：单条日志现在会附带 `audit.category` / `audit.outcome` / `audit.reasonCode`，并在页面侧可判定时透出 `runId` 与 `review.status/source/handledBy/finalDecisionAt/reasonCode/timeoutSource/replacementCause/queueDepth/queueOverflowLimit/timeoutMs/replacementRunId`；`boss_helper_run_report` 会优先复用这些 page-side 审计字段、日志自带的 `runId` 以及 review 元数据，减少 MCP 聚合层继续依赖中文文案和 recent events 做二次推断。

最新三层主动护栏增量会在以下场景自动收紧执行规模：批次连续 3 次出现非 warning 失败、当前批次累计 5 次出现非 warning 失败，或单次 run 成功投递达到 20 次。对应地，`limit-reached` 事件会携带 `detail.guardrailCode=consecutive-failure-auto-stop` / `failure-count-auto-stop` / `run-delivery-limit-reached`，`run.lastError.code` 与 `boss_helper_stats.data.risk.warnings` 也会同步暴露触发原因；其中第三种场景还会把 `boss_helper_stats.data.risk.delivery.usedInRun` / `remainingInRun` / `runReached` 暴露给外部 Agent。现在每日 `deliveryLimit` 触顶时也会在 `risk.warnings` 中暴露 `delivery-limit-reached`，并把暂停态 run 的 `lastError.code` 记为同一结构化护栏码，方便 MCP 聚合层直接判断“先 stop 再等下一个自然日”，而不是继续建议 `resume`。

除 readiness snapshot 外，bridge 和关键页面命令失败时现在也会统一返回 `code`、`message`、`retryable`、`suggestedAction`。目前已覆盖 `navigate`、`resume.get`、`jobs.detail`、`chat.send`，以及 `events_recent`、`wait_for_event`、`config.update`、`start / pause / resume / stop` 这组事件与控制链路。page-level readiness 的 `suggestedAction` 仍稳定收敛为 `navigate`、`wait-login`、`refresh-page`、`stop`、`continue`；命令级失败额外可能返回 `retry`、`fix-input`、`reconnect-relay`、`resume`，方便外部 Agent 区分“直接重试”与“先修输入/恢复 relay / 恢复暂停中的批次”。如果当前已经停留在受支持职位页，`refresh-page` 的低风险对应原语就是 `boss_helper_jobs_refresh`；如果当前还停在 Boss 站内但不受支持的页面，优先调用 `boss_helper_navigate`，它现在可以直接把现有 Boss tab 拉回职位搜索页。

`chat.list` 现在会为每个会话额外返回 `latestRole` 和 `needsReply`，并支持在 payload 中传 `pendingReplyOnly=true` 只读筛出“最后一条消息来自 Boss、当前仍待回复”的会话。返回里的 `pendingReplyCount` 与 `totalConversations` 会保留筛选前后的总量上下文，避免外部 Agent 只能看到被截断后的列表，却不知道当前页面总共有多少会话、其中多少仍待回复。

推荐顺序是先 `chat.list`（必要时带 `pendingReplyOnly=true`）做只读筛选，再按 `conversationId` 调 `chat.history` 复核上下文，最后才决定是否真的执行 `chat.send`。这样外部 Agent 不会把“当前页面采集到了会话”误判成“已经适合直接发消息”。

`chat.send` 现在也被收紧为显式高风险动作：通过 bridge / CLI / MCP 调用时，必须在 payload 中传 `confirmHighRisk=true`，否则会返回 `high-risk-action-confirmation-required`。这样外部 Agent 不能再把聊天发送默认跟随主流程触发。

同样地，外部 `start` / `resume` 入口现在也需要显式确认：通过 bridge / CLI / MCP 调用时，必须在 payload 中传 `confirmHighRisk=true`，否则不会真正启动或恢复 run，而是直接返回 `high-risk-action-confirmation-required`。即使显式确认已给出，如果当天已经达到 `deliveryLimit`，`start` / `resume` 仍会继续被仓库侧护栏拒绝，并返回 `code=delivery-limit-reached` / `suggestedAction=stop`。这项限制只作用于外部自动化入口，不影响页面面板里的手动“开始 / 继续”按钮。

为了避免外部 Agent 在“要不要真的执行”这一步只看到一条拒绝文案，`start` / `resume` 在未显式确认时现在还会在响应 `data.preflight` 中附带一份结构化执行前摘要：包含当前命令、目标岗位数、当前/可恢复 run、剩余投递容量，以及基于当前配置（对 `start` 还会叠加 `configPatch`）计算出的风险摘要。这样外部 Agent 可以先读同一条阻断响应里的 `preflight`，再决定是否真的提交 `confirmHighRisk=true`。

`config.update` 现在也补上了更细粒度的聊天自动化护栏：如果 patch 会启用 `aiReply`，或修改一个已经启用的 `aiReply` 配置，外部 bridge / CLI / MCP 调用同样必须显式传 `confirmHighRisk=true`，否则会直接拒绝执行。这样外部 Agent 不能在未确认风险的前提下，先把 AI 自动回复悄悄打开，再等待后续运行链路触发聊天自动化。

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
