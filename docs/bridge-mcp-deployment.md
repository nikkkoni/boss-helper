# Boss Helper MCP / Bridge 部署说明

本文档聚焦本地 companion 链路的部署与运维：bridge、relay、CLI、MCP server、环境变量，以及聊天能力依赖的 protobuf schema。

如果你想看外部 LLM Agent 应该怎样调用这些工具，请继续阅读 [llm-agent-mcp.md](./llm-agent-mcp.md)。如果你想先理解整个系统分层，请先看 [architecture-analysis.md](./architecture-analysis.md)。

## 组件关系

本地自动化链路由 5 个部分组成：

1. 浏览器扩展：真正执行 Boss 页面内的投递、过滤、翻页、聊天发送。
2. `agent-bridge.mjs`：监听 localhost HTTP / HTTPS / SSE，对外暴露命令接口。
3. `agent-relay.html`：在浏览器普通页面里运行，把 bridge 命令转发给扩展，把扩展事件回传给 bridge，并通过 keepalive 维持 MV3 事件端口。
4. CLI / orchestrator：对 bridge HTTP 的命令行封装。
5. `agent-mcp-server.mjs`：把 bridge HTTP 封装为 stdio MCP tools。

注意：MCP server 不是替代 bridge 的新服务层，而是 bridge 的一个适配器。

## 本地要求

| 项目 | 说明 |
| --- | --- |
| Node.js | 建议 20.x，与 CI 保持一致 |
| pnpm | 建议 9.x |
| 浏览器 | Chromium 内核浏览器，relay 页面当前按 Chrome / Edge 行为设计 |
| 扩展状态 | 已安装或本地加载 Boss Helper 扩展 |
| 页面状态 | 至少打开一个 Boss 职位页，并完成插件初始化 |
| 端口 | 默认需要 `4317`（HTTP）和 `4318`（HTTPS relay）可用 |
| 本地证书 | 首次访问 `https://127.0.0.1:4318/` 或 `https://localhost:4318/` 时需要接受自签名证书 |

## 会生成的本地文件

这些文件都在仓库根目录，默认已被 `.gitignore` 忽略：

| 文件 | 作用 |
| --- | --- |
| `.boss-helper-agent-token` | bridge 共享 token；如果环境变量未显式指定，会自动生成并持久化 |
| `.boss-helper-agent-cert.json` | localhost 自签名证书和私钥 |
| `.boss-helper-agent-bridge.log` | `pnpm agent:start` 后台拉起 bridge 时的日志 |
| `.boss-helper-agent-bridge.pid` | 后台 bridge 进程 ID |

不要把这些文件提交到仓库。

## 最短启动路径

### 1. 本地加载扩展

```bash
pnpm install
pnpm build:chrome
```

然后在 Chromium 浏览器开发者模式中加载 `.output/chrome-mv3/`。

### 2. 打开 Boss 职位页

当前支持这些路径：

- `/web/geek/job`
- `/web/geek/job-recommend`
- `/web/geek/jobs`

### 3. 一键启动 bridge + relay 页面

```bash
pnpm agent:start -- --extension-id <你的扩展ID>
```

这个命令会：

- 检查 bridge 是否已在运行
- 自动后台拉起 `agent-bridge.mjs`
- 生成 relay URL
- 尝试打开 relay 页面；在 macOS 下默认使用 `Google Chrome`，也可以用 `--browser` 覆盖

首次打开 relay 页面时，请先接受本地自签名证书，然后保持页面常驻。

### 4. 运行诊断

```bash
pnpm agent:doctor
```

如果 `relayConnected` 为 `true`，说明 bridge 当前至少有一个 relay 页面连上了 `/events` SSE。它不等于“Boss 页面一定可控”，也不等于 relay 页的扩展事件端口一定健康。

### 5. 启动 MCP server

```bash
pnpm agent:mcp
```

之后就可以把它注册到支持 stdio 的 MCP 客户端中。

## 手动启动方式

### 只启动 bridge

```bash
pnpm agent:bridge
```

默认会监听：

- `http://127.0.0.1:4317`
- `https://127.0.0.1:4318`

其中：

- HTTP 端口主要供 CLI / MCP / 外部脚本发命令
- HTTPS 端口主要供 relay 页面访问，并满足扩展 `externally_connectable` 的 HTTPS 限制

### 手动打开 relay 页面

```text
https://127.0.0.1:4318/
```

或：

```text
https://localhost:4318/
```

进入页面后：

1. 填写扩展 ID。
2. 点击“保存并重连”。
3. 保持页面常驻。

### 验证 bridge 和 relay

```bash
pnpm agent:cli health
pnpm agent:cli status
pnpm agent:cli readiness.get
pnpm agent:doctor
```

### 状态语义

- `relayConnected`：bridge 当前至少有一个 relay 页面连上 `GET /events`。这代表 bridge -> relay 页在线，但不代表目标 Boss 标签页已经可控。
- relay 页 `events: connected`：relay 已通过 `chrome.runtime.connect(...)` 连上扩展 background 的外部事件端口。这是 relay -> extension 的单独链路。
- `eventSubscribers`：bridge 当前有多少客户端订阅了 `GET /agent-events`。这通常是 orchestrator、MCP watcher 或外部脚本，不是 relay 页本身。
- relay 页现在会每 20 秒往扩展事件端口发送 keepalive，减少 Chrome MV3 service worker 空闲回收造成的周期性断线。
- 如果你需要区分“Boss 页不存在 / 页面不受支持 / 页面未初始化 / 需要登录 / 验证码或风控阻断 / 页面可继续分析”，不要只看 `health` 或 `status`，应改为调用 `readiness.get`，或在 MCP 侧直接读取 `boss_helper_agent_context.readiness`。

## 脚本清单

| 命令 | 作用 |
| --- | --- |
| `pnpm agent:start` | 一键拉起 bridge 并打开 relay 页面；若 bridge 已健康运行则直接复用 |
| `pnpm agent:bridge` | 只启动 bridge；如果端口已被占用会直接报 `EADDRINUSE` |
| `pnpm agent:cli <command>` | 通过 CLI 调 bridge |
| `pnpm agent:doctor` | 检查 bridge、relay 和扩展连接状态 |
| `pnpm agent:mcp` | 暴露 stdio MCP tools |
| `pnpm agent:orchestrate` | 内置的最小自动编排示例 |

常用只读诊断命令：

- `pnpm agent:cli health`
- `pnpm agent:cli status`
- `pnpm agent:cli readiness.get`
- `pnpm agent:cli stats`
- `pnpm agent:cli plan.preview`
- `pnpm agent:cli jobs.current`

常用低风险恢复命令：

- `pnpm agent:cli jobs.refresh`

其中 `readiness.get` 会返回结构化页面快照，至少覆盖：Boss 页是否存在、URL、是否为支持页面、扩展面板是否完成初始化、页面是否可控、是否需要登录、是否出现验证码 / 风控提示、是否有阻断操作的模态框，以及建议动作 `suggestedAction`。

如果你是通过 MCP 接入，而不是直接用 CLI 做本地排障，冷启动阶段更推荐先调用 `boss_helper_bootstrap_guide`。它会把 bridge、relay、extension ID、Boss 页存在性和页面 readiness 汇总成一个只读 bootstrap 结果，并明确告诉外部 Agent：当前下一步是 `start-bridge`、`open-relay`、`configure-extension-id`、`open-boss-page`、`navigate` 还是可以直接 `continue`。

这个 tool 的重点不是替你自动执行冷启动动作，而是把“还缺哪一步”和“这一步是人工做还是 Agent 继续做”稳定结构化出来。当前通常仍需要人工完成的动作包括：启动本地浏览器扩展环境、打开 relay 页面、填写 extension ID、首次打开 Boss 职位页、完成登录和处理验证码 / 风控提示。

`plan.preview` 则会在不触发真实投递的前提下，对当前岗位列表做只读执行预演。它适合放在 `jobs.list` / `jobs.detail` 之后、`start` 之前，用来判断：哪些岗位会被过滤，哪些仍需外部 AI 审核，哪些因为缺少卡片/地址/模型而不适合立刻执行。

`jobs.current` 则用于读取“当前页面已经选中的岗位快照”。它不会像 `jobs.detail` 一样主动点击指定岗位，也不会切换列表项；如果页面当前还没有选中的详情卡片，它会返回一个成功的空快照（`selected=false`、`job=null`），让外部 Agent 自然退回 `jobs.list` 或后续显式调用 `jobs.detail`。它和 `jobs.detail` 的边界是：前者只读当前页面状态，后者按 `encryptJobId` 主动读取或加载指定岗位详情。

`jobs.refresh` 则会重新加载当前受支持的 Boss 职位列表页，但不会改动现有 URL、搜索条件或页码。它适合放在 `readiness.get` 或其他命令返回 `suggestedAction=refresh-page` 之后，用来恢复页面控制器、详情卡片状态或列表初始化；它和 `navigate` 的边界是“保留当前搜索上下文”，和 `start` 的边界是“不会触发真实投递”。

外部 `navigate` 现在还承担一条更底层的恢复职责：当当前 Boss tab 已经漂移到站内但不受支持的页面，例如 `https://www.zhipin.com/web/passport/zp/verify.html?...`、首页或其他非职位搜索路由时，background 不再要求页面内 controller 先就绪，而是会直接在这个 Boss tab 上改写 URL，把页面切回受支持的职位搜索页。对 `verify.html` 这类页面，会优先尝试复用 `callbackUrl` 中原本指向的职位页；如果没有可复用的受支持回跳地址，则保守回退到 `/web/geek/jobs`。这条放宽只作用于 `navigate` 自身，不会把其他写命令同步放开到 unsupported page。

`chat.list` 仍然只读取“当前页面采集到的聊天会话摘要”，不是 Boss 平台的全量聊天历史。但它现在会为每个会话补 `latestRole` 与 `needsReply`，并支持在 payload 中传 `pendingReplyOnly=true`，只读筛出“最后一条消息来自 Boss、当前仍待回复”的会话。返回体里的 `pendingReplyCount` 和 `totalConversations` 会分别保留待回复会话数与当前页面采集到的总会话数，方便外部 Agent 在不触发真实发送的前提下，先评估聊天工作量和优先级。

`stats` 现在除了原有的 `progress` / `todayData` / `historyData` 之外，还会附带 `run.current`、`run.recent` 与 `risk`。前两者分别表示：当前或可恢复的运行摘要，以及最近一次运行的 checkpoint；`risk` 则会汇总当前 `deliveryLimit` 使用情况、剩余额度、去重/通知/缓存护栏是否开启、AI 自动回复等高风险开关，以及结构化 `warnings`。`risk.delivery` 现在不仅包含 `limit` / `usedToday` / `remainingToday`，还会在仓库侧补充 `runLimit` / `usedInRun` / `remainingInRun` / `runReached`，用于判断当前 run 是否已经达到每轮投递上限；`risk.observed.sessionDuplicates` 则会把当前会话里的重复命中拆成 `communicated`、`sameCompany`、`sameHr` 和 `other`，帮助外部 Agent 区分到底是哪类去重护栏在拦截职位。外部 Agent 可优先据此判断是否已经存在进行中的 run、最近一次 run 是否处于 `paused` 可恢复状态，以及本轮在护栏层面是否仍适合继续 `start`。当前恢复边界如下：`paused` 默认可 `resume`，但若 `risk.delivery.reached=true` 或 `run.lastError.code=run-delivery-limit-reached`，则不要直接恢复；前者应先 `stop` 当前 run 并等待下一个自然日，后者应先 `stop` 当前 run 再重新 `start` 新一轮；`error` 应先刷新页面并重读 readiness，`completed` / `stopped` 仅保留排障摘要，不应直接当作可恢复会话。

如果你已经知道“有一个 run 出问题了”，但还不确定它主要是页面问题、配置问题、风险中断还是普通业务过滤，更推荐直接调用 MCP 的 `boss_helper_run_report`。它会在 MCP 侧把 `stats`、`logs.query` 和 recent events 聚合成一个审计报告，统一产出 `decisionLog`、`summary.categoryCounts`、`summary.outcomeCounts` 和 `reviewAudit`。当前它只覆盖 current/recent run，且事件部分基于 recent history，不是完整历史归档；但对“刚刚这轮为什么停了”这种排障场景，通常比手工拼三次调用更高效。最新仓库侧增量还让 `logs.query` 本身返回稳定的 `audit.category` / `audit.outcome` / `audit.reasonCode`，并在页面侧已有运行态上下文时透出 `runId` 与 `review.status/source/handledBy/finalDecisionAt/reasonCode/timeoutSource/replacementCause/queueDepth/queueOverflowLimit/timeoutMs/replacementRunId`；因此当页面侧已经给出结构化审计结论时，MCP 聚合层会优先复用这些字段，而不是再次按中文文案推断。

对应地，`boss_helper_agent_context.summary` 现在也会补充 `riskLevel`、`riskWarningCount`、`remainingDeliveryCapacity`。如果 MCP 聚合层已经提示风险摘要为 `high`，推荐先读取 `boss_helper_stats` 查看 `risk.warnings`，而不是直接推进真实执行。

如果你已经在用 MCP 的 `boss_helper_agent_context.workflow` 做高层分支，最新仓库侧增量还会在 `review-loop`、`observe-run` 这类事件驱动阶段补一个只读 `eventFocus`：`watchTypes` 表示当前应优先观察的事件类型，`terminalTypes` 表示一旦出现通常就该结束观察、改做恢复或收尾判断的事件类型。这样外部 Agent 不需要再自己复制 `agent-orchestrator` 里的事件优先级。

对于 `workflow.stage=analyze-jobs`，MCP 聚合层现在还会补一个只读 `candidateFocus`：它不会替代真实 `jobs.list` / `jobs.current` / `jobs.detail`，但会先把“建议优先读取哪几个岗位”结构化暴露出来。当前最小策略是优先返回列表里已经有 `hasCard=true` 的岗位，再按列表顺序补齐少量候选，避免外部 Agent 一上来就对整页所有职位逐个拉详情。

如果外部 Agent 已经读过 `boss_helper_plan_preview`，或希望把 preview 结果直接并入当前上下文，现在也可以在 `boss_helper_agent_context` 里带 `include=['plan']`。MCP 聚合层会把 preview 结果放进 `sections.plan`，并额外生成 `workflow.planFocus`，把“先缩小到 ready 候选”“先处理 external review”“先补缺失信息”“先复核 manual review”这类下一步收敛动作结构化暴露出来，减少外部 Agent 再手写一层 preview summary -> next action 的转换逻辑。为了降低 live 页面扰动，这里的聚合 preview 默认不会直接扫整页：会优先使用当前已选中岗位，其次退回 `workflow.candidateFocus.inspectFirst` 的少量候选岗位；只有直接调用 `boss_helper_plan_preview` 时，才继续保持调用方自己决定 `jobIds` 或整页范围的语义。最新增量还会在 `sections.plan.scope` 与 `workflow.planFocus.scope` 中显式透出本次 preview 的收敛来源和值得关注的 `targetJobIds`；当前至少区分 `selected-current-job`、`candidate-focus` 和 `page-default`，便于外部 Agent 在记录审计或继续收窄候选时直接复用。

最新三层主动护栏分别是“连续失败自动暂停”“累计失败自动暂停”和“每轮投递上限自动暂停”：当批次连续 3 次出现非 warning 失败、当前批次累计 5 次出现非 warning 失败，或单次 run 成功投递达到 20 次时，页面侧都会自动把当前 run 切到暂停收尾流程，并发出 `limit-reached` 事件，`detail.guardrailCode` 固定为 `consecutive-failure-auto-stop`、`failure-count-auto-stop` 或 `run-delivery-limit-reached`。同一原因也会写入 `stats.data.run.current/recent.lastError` 与 `stats.data.risk.warnings`；第三种场景还会同步更新 `stats.data.run.current/recent.deliveredJobIds` 与 `stats.data.risk.delivery.usedInRun` / `remainingInRun` / `runReached`，方便外部 Agent 在 bridge、CLI、MCP 三条链路上都用同一个结构化信号判断“先排障再 resume”，还是“先 stop 再 start 新一轮”。此外，当今日 `deliveryLimit` 已经耗尽时，`risk.warnings` 也会出现 `delivery-limit-reached`，暂停中的 run 会把 `lastError.code` 记为同一结构化护栏码，而 `start` / `resume` 会直接返回 `code=delivery-limit-reached` / `suggestedAction=stop`，避免外部 Agent 在已无当日额度时继续推进真实执行。

除 `readiness.get` 外，bridge 现在也会为关键命令失败补统一错误元数据：`code`、`message`、`retryable`、`suggestedAction`。这意味着 CLI、MCP 和直接 HTTP 调用在遇到 `relay-not-connected`、`bridge-timeout`、`page-timeout`、`unsupported-page`、`navigate-invalid`、`job-detail-load-failed`、`event-timeout`、`events-history-unavailable`、`empty-config-patch`、`validation-failed`、`already-running`、`paused` 等失败时，不需要再依赖中文文案判断是否该重试、刷新页面、修参数、恢复批次或重连 relay。

其中命令级 `suggestedAction` 当前可能出现：`navigate`、`wait-login`、`refresh-page`、`stop`、`retry`、`fix-input`、`reconnect-relay`、`resume`。如果你只想判断页面 readiness，仍应优先读 `readiness.get` 或 MCP 的 `boss_helper_agent_context.readiness`；如果你在处理命令失败恢复，则优先看对应错误 envelope 里的 `retryable` 和 `suggestedAction`。当 `suggestedAction=refresh-page` 且当前仍位于受支持职位页时，优先调用 `jobs.refresh` 或 MCP 的 `boss_helper_jobs_refresh`，而不是重新拼装一次 `navigate` 参数；当 `suggestedAction=navigate` 且当前 Boss tab 只是漂移到了 unsupported Boss 页面时，直接调用 `navigate` / `boss_helper_navigate` 即可，不需要先等页面内 controller 恢复。

另一个默认保守的高风险护栏是 `chat.send`：通过 bridge / CLI / MCP 调用时，必须在 payload 中显式传 `confirmHighRisk=true`，否则会直接返回 `high-risk-action-confirmation-required` / `suggestedAction=fix-input`。这项限制只影响外部自动化入口，不影响用户在 Boss 页面里手动聊天。

现在 `start` 与 `resume` 也采用同样的外部确认边界：bridge / CLI / MCP 调用时必须显式传 `confirmHighRisk=true`，否则不会真正启动或恢复 run，而是返回 `high-risk-action-confirmation-required`。显式确认并不会绕过每日额度护栏；如果当天已经达到 `deliveryLimit`，这两条命令仍会继续返回 `delivery-limit-reached` / `suggestedAction=stop`。这项限制同样只针对外部入口，不影响页面内的手动“开始 / 继续”按钮。

此外，这两类阻断响应现在还会在 `data.preflight` 中附带结构化执行前摘要：至少包含当前命令、目标岗位数、当前/可恢复 run、剩余投递容量，以及基于当前配置计算出来的 `risk`。对 `start` 而言，如果请求里带了 `configPatch`，这个 preflight 会按补丁后的有效配置重新计算风险；例如外部 Agent 试图通过 `start.configPatch` 打开 `aiReply` 时，即使 `confirmHighRisk=false`，也能先从同一条阻断响应里看到 `preflight.risk.automation.aiReplyEnabled=true`，而不必真的启动 run 才发现风险面。

`config.update` 则补上了更细粒度的聊天自动化护栏：如果 patch 会启用 `aiReply`，或修改一个已经启用的 `aiReply` 配置，外部 bridge / CLI / MCP 调用也必须显式传 `confirmHighRisk=true`，否则会直接返回 `high-risk-action-confirmation-required` / `suggestedAction=fix-input`。这样外部 Agent 不能先静默放开 AI 自动回复，再让后续 run 在页面里自动触发聊天回复。

## 环境变量

bridge / CLI / MCP 目前使用这些环境变量：

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `BOSS_HELPER_AGENT_HOST` | `127.0.0.1` | bridge 监听 host，也是 CLI / MCP 的目标 host |
| `BOSS_HELPER_AGENT_PORT` | `4317` | bridge HTTP 端口 |
| `BOSS_HELPER_AGENT_HTTPS_PORT` | `BOSS_HELPER_AGENT_PORT + 1` | relay HTTPS 页面端口 |
| `BOSS_HELPER_AGENT_BRIDGE_TOKEN` | 自动生成 | bridge 共享 token；未设置时会写入 `.boss-helper-agent-token` |
| `BOSS_HELPER_AGENT_TIMEOUT` | `30000` | bridge 的默认命令超时；部分命令会按类型覆盖 |

### 环境变量示例

```bash
export BOSS_HELPER_AGENT_HOST=127.0.0.1
export BOSS_HELPER_AGENT_PORT=4317
export BOSS_HELPER_AGENT_HTTPS_PORT=4318
export BOSS_HELPER_AGENT_BRIDGE_TOKEN=replace-with-your-own-token
export BOSS_HELPER_AGENT_TIMEOUT=45000
```

如果你修改了 host 或端口，需要同步更新：

- relay 页面访问地址
- CLI / orchestrator / MCP 客户端配置
- 本地自动化脚本中的 bridge base URL

## 认证机制

bridge 使用 token 进行 API 认证，所有客户端必须携带正确的 token 才能访问受保护的接口。

### Token 来源

Token 存储在 `.boss-helper-agent-token` 文件中（位于仓库根目录），生成逻辑如下：

1. 优先读取环境变量 `BOSS_HELPER_AGENT_BRIDGE_TOKEN`
2. 若未设置，则读取 `.boss-helper-agent-token` 文件内容
3. 若文件也不存在，则自动生成随机 token 并写入文件

### 认证 Header

HTTP 请求必须携带以下 header：

```
x-boss-helper-agent-token: <你的token>
```

### 接口认证范围

| 接口 | 是否需要 token |
| --- | --- |
| `GET /` (relay 页面) | 否（依赖 session cookie） |
| `GET /health` | 否 |
| `GET /status` | 是 |
| `GET /events` | 是（依赖 session cookie） |
| `GET /agent-events` | 是 |
| `POST /command` | 是 |
| `POST /batch` | 是 |
| `POST /responses` | 是（依赖 session cookie） |
| `POST /relay/announce` | 是（依赖 session cookie） |
| `GET /relay/bootstrap` | 是（依赖 session cookie） |

### Token 排障

如果遇到 `unauthorized-bridge-token` 错误：

1. 确认 `.boss-helper-agent-token` 文件内容与 bridge 启动时使用的 token 一致
2. 如果文件包含测试 token（如 `vitest-bridge-token-*`），可能需要重启 bridge 以生成新 token
3. 检查 CLI / MCP 是否正确读取了 token 文件
4. 确认没有连接到错误的 bridge 端口

重启 bridge 并刷新 token：

```bash
# 停止现有 bridge（如果有 PID 文件）
kill $(cat .boss-helper-agent-bridge.pid 2>/dev/null) 2>/dev/null
# 重新启动
pnpm agent:bridge
```

## 认证机制

bridge 使用 token 进行 API 认证，所有客户端必须携带正确的 token 才能访问受保护的接口。

### Token 来源

Token 存储在 `.boss-helper-agent-token` 文件中（位于仓库根目录），生成逻辑如下：

1. 优先读取环境变量 `BOSS_HELPER_AGENT_BRIDGE_TOKEN`
2. 若未设置，则读取 `.boss-helper-agent-token` 文件内容
3. 若文件也不存在，则自动生成随机 token 并写入文件

### 认证 Header

HTTP 请求必须携带以下 header：

```
x-boss-helper-agent-token: <你的token>
```

### 接口认证范围

| 接口 | 是否需要 token |
| --- | --- |
| `GET /` (relay 页面) | 否（依赖 session cookie） |
| `GET /health` | 否 |
| `GET /status` | 是 |
| `GET /events` | 是（依赖 session cookie） |
| `GET /agent-events` | 是 |
| `POST /command` | 是 |
| `POST /batch` | 是 |
| `POST /responses` | 是（依赖 session cookie） |
| `POST /relay/announce` | 是（依赖 session cookie） |
| `GET /relay/bootstrap` | 是（依赖 session cookie） |

### Token 排障

如果遇到 `unauthorized-bridge-token` 错误：

1. 确认 `.boss-helper-agent-token` 文件内容与 bridge 启动时使用的 token 一致
2. 如果文件包含测试 token（如 `vitest-bridge-token-*`），可能需要重启 bridge 以生成新 token
3. 检查 CLI / MCP 是否正确读取了 token 文件
4. 确认没有连接到错误的 bridge 端口

重启 bridge 并刷新 token：

```bash
# 停止现有 bridge（如果有 PID 文件）
kill $(cat .boss-helper-agent-bridge.pid 2>/dev/null) 2>/dev/null
# 重新启动
pnpm agent:bridge
```

## HTTP / SSE 接口

bridge 当前对外暴露这些接口：

- `GET /`
- `GET /health`
- `GET /status`
- `GET /events`
- `GET /agent-events`
- `POST /command`
- `POST /batch`
- `POST /responses`
- `POST /relay/announce`
- `GET /relay/bootstrap`

常用接口含义：

| 接口 | 作用 |
| --- | --- |
| `GET /` | relay 页面，建立 session cookie |
| `GET /health` | 检查 bridge 是否存活 |
| `GET /status` | 检查 relay、队列和 `agent-events` 订阅状态 |
| `POST /command` | 发送单条命令 |
| `POST /batch` | 顺序执行一组命令 |
| `GET /agent-events` | 订阅实时投递事件 |

其中需要特别区分：

- `relayConnected` 反映的是 relay 页到 `/events` 的 SSE 连接。
- `eventSubscribers` 反映的是谁在订阅 `GET /agent-events`。
- relay 页自己的 `events` 徽标反映的是 relay 到扩展 background 的外部事件端口。

除 `/` 和 `/health` 外，其余接口都需要认证：

- CLI / MCP / 脚本客户端：携带 `x-boss-helper-agent-token` 请求头。
- relay 页面：先通过 `GET /` 建立同源 HTTPS session cookie，再访问 `/events`、`/relay/bootstrap`、`/responses`、`/relay/announce` 等接口。

## MCP 部署说明

`agent-mcp-server.mjs` 本身不管理 relay，也不会启动 bridge。它只做两件事：

1. 读取 bridge 运行时配置和 token。
2. 把 bridge 的 HTTP / SSE 能力包装成 MCP tools。

stdio 传输兼容性说明：

- 传统 MCP 客户端通常使用 `Content-Length` framed transport。
- 部分本地客户端，例如 OpenCode 1.4.x，会通过 stdio 直接按行发送 JSON-RPC。
- 当前仓库内置的 MCP server 同时兼容这两种输入输出格式，因此无需额外包一层代理。

最小注册示例：

```json
{
  "mcpServers": {
    "boss-helper": {
      "command": "pnpm",
      "args": ["agent:mcp"],
      "cwd": "/Users/wang/Documents/boss/boss-helper"
    }
  }
}
```

如果 MCP 客户端支持环境变量覆盖，也可以显式传入上面的 bridge 环境变量。

## Protobuf schema

bridge 的命令协议是 JSON，但页面内聊天能力依赖 Boss WebSocket 的 protobuf 协议。

相关文件：

- 完整 schema：`src/assets/chat.proto`
- 运行时最小 schema：`src/composables/useWebSocket/type.ts`
- 发送封装：`src/composables/useWebSocket/protobuf.ts`
- 捕获 / 解码：`src/pages/zhipin/services/chatStreamHooks.ts`
- 消息落库：`src/pages/zhipin/services/chatStreamMessages.ts`

当前最关键的消息结构是：

```proto
message TechwolfChatProtocol {
  required int32 type = 1;
  repeated TechwolfMessage messages = 3;
}

message TechwolfMessage {
  required TechwolfUser from = 1;
  required TechwolfUser to = 2;
  optional int64 mid = 4;
  optional int64 time = 5;
  required TechwolfMessageBody body = 6;
}

message TechwolfMessageBody {
  required int32 type = 1;
  required int32 templateId = 2;
  optional string text = 3;
}
```

这部分协议主要影响：

- `chat.send`
- `chat.list`
- `chat.history`
- 页面内聊天消息采集

如果你修改了聊天协议相关实现，至少要同时检查：

1. `chat.proto` 的字段定义
2. `type.ts` 里的 runtime schema
3. `protobuf.ts` 的发送编码
4. `chatStreamMessages.ts` 的解码和消息映射

## 安全约束

当前 bridge / relay 机制默认依赖这些约束：

1. 扩展 `externally_connectable` 只允许 `https://localhost/*` 和 `https://127.0.0.1/*`。
2. `background.ts` 只接受来自 `localhost` / `127.0.0.1` 的 HTTPS relay 页面。
3. bridge 请求必须附带共享 token。
4. 事件订阅端口名带 token，防止普通页面误连。
5. relay 页会通过 keepalive 保持外部事件端口活跃，降低 MV3 background 空闲超时引发的周期性断连。

这套方案只适合本机使用，不应该直接暴露到公网。

## 常见问题

### `relay-not-connected`

bridge 在线，但 relay 页面没有连接扩展。

结构化恢复信号：`retryable=true`，`suggestedAction=reconnect-relay`

处理方式：

1. 打开 `https://127.0.0.1:4318/`
2. 接受本地证书
3. 填写扩展 ID
4. 保持页面常驻

### `target-tab-not-found`

扩展没有找到可用的 Boss 职位页。

结构化恢复信号：`retryable=true`，`suggestedAction=navigate`

处理方式：

1. 打开支持的 Boss 职位页
2. 确认插件已经完成初始化
3. 再重试 `stats` 或 `start`

### `bridge-timeout`

relay 没有在超时时间内返回响应。常见原因：

结构化恢复信号：`retryable=true`，`suggestedAction=retry`

- relay 页面被关闭
- Boss 页面未初始化完成
- `jobs.detail` 正在等待职位详情卡片加载

如果同时看到页面侧错误为 `page-timeout` 或 `tab-forward-failed`，通常应该优先调用 `jobs.refresh` 或 `boss_helper_jobs_refresh` 刷新 Boss 页面，再决定是否继续重试。

### `Operation timed out after 10000ms`

这类报错通常发生在 MCP 客户端启动阶段，而不是 bridge 命令执行阶段。

优先排查：

1. 当前仓库代码是否包含最新的 MCP stdio 兼容修复。
2. 是否从仓库根目录启动客户端，使其真正读到根目录下的 `opencode.json`。
3. `pnpm agent:mcp` 是否能在终端里单独启动。
4. 如果是 OpenCode，执行 `opencode mcp list` 查看是否仍然卡在 MCP 启动握手。

如果 `pnpm agent:mcp` 能启动，但客户端仍提示 10 秒超时，最常见原因是客户端与 server 的 stdio 传输格式不匹配；当前版本已经兼容 `Content-Length` 和按行 JSON-RPC 两种模式。

### relay 页持续出现“扩展事件连接断开”

如果 relay 页日志里反复出现“扩展事件连接断开，3s 后重连”，通常说明 relay -> extension 这条事件端口没有稳定保持。

处理方式：

1. 如果刚修改过 `background.ts` 或 relay 相关代码，先执行 `pnpm build:chrome`，然后在浏览器扩展管理页重新加载本地扩展。
2. 刷新 relay 页面，必要时重新填写扩展 ID 后点击“保存并重连”。
3. 确认 relay 页状态最终停在 `bridge: connected` 和 `events: connected`。
4. 如果 `relayConnected=true` 但 relay 页 `events` 仍在反复重连，命令链路可能还能工作，但 `/agent-events` 驱动的观察和审核闭环会不稳定。

### `unauthorized-bridge-token`

bridge token 不匹配。请检查：

- `.boss-helper-agent-token`
- 进程环境变量里的 `BOSS_HELPER_AGENT_BRIDGE_TOKEN`
- MCP / CLI 是否连接到了错误的 bridge 端口

## 变更这条链路时的最小验证

如果你改了 bridge、relay、MCP 或 protobuf 相关代码，建议至少跑完：

```bash
pnpm lint && pnpm check && pnpm test -- --run
pnpm agent:doctor
pnpm agent:cli status
```

如果修改了扩展生命周期或跨端消息行为，再补充：

```bash
pnpm build:chrome
pnpm test:e2e
```
