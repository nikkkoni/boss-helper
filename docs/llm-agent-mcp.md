# Boss Helper 的 LLM Agent / MCP 接入指南

本文档面向希望把 Boss Helper 接到外部 LLM Agent 的使用者。

> 部署、证书、环境变量和 protobuf 说明见 [bridge-mcp-deployment.md](./bridge-mcp-deployment.md)。


## 架构说明

Boss Helper 不是一个直接监听本地端口的浏览器扩展，它的对外调用链路是分层的：

1. 浏览器扩展运行在 Boss 页面里，真正执行投递、筛选、翻页、消息发送。
2. 本地 bridge 服务监听 `127.0.0.1:4317`，对外暴露 HTTP 和 SSE。
3. relay 页面把 bridge 收到的命令转发给扩展，并通过单独的外部事件端口把扩展事件回传给 bridge。
4. 页面控制器处理 `start`、`jobs.list`、`jobs.detail`、`jobs.review` 等命令。
5. MCP server 再把现有 bridge HTTP 能力封装成一组标准 MCP tools，供外部 LLM Agent 通过 stdio 调用。

也就是说，MCP 不是旁路协议，它只是现有 bridge 的标准工具层。

## 启动前提

在任何 Agent、CLI 或 MCP 调用之前，先确认下面 4 个条件：

1. 浏览器里已经安装并启用扩展。
2. 至少打开了一个 Boss 职位页。
3. 插件已经在该页面完成初始化。
4. relay 页面已经连接到扩展，且若你依赖事件观察，relay 页 `events` 徽标应保持 `connected`。

如果缺少其中任何一段，`start`、`stats`、`jobs.list`、`jobs.detail` 等命令都可能失败。

## 最短启动路径

最短可用路径如下：

1. 安装或本地加载扩展。
2. 打开 Boss 职位页并完成登录。
3. 运行 `pnpm agent:start`，自动拉起 bridge 并打开 relay 页面。
4. 在 relay 页面填入扩展 ID，保持页面常驻。
5. 确认 `pnpm agent:doctor` 输出正常。
6. 运行 `pnpm agent:mcp`，把现有能力暴露给支持 stdio 的 MCP 客户端。

如果你只需要脚本或命令行，不一定要启动 MCP；但如果目标是让外部 LLM Agent 直接调工具，MCP 是推荐入口。

## 现有脚本分别做什么

### `pnpm agent:start`

一键启动辅助脚本。

- 检查 `127.0.0.1:4317` 是否已有 bridge
- 若没有则后台拉起 bridge
- 生成 relay 页面地址
- 默认尝试打开浏览器；在 macOS 下会优先打开 `Google Chrome`，也可以用 `--browser` 覆盖
- 若 bridge 已健康运行，则直接复用，不会重复拉起进程

适合第一次接入时快速把链路跑起来。

### `pnpm agent:bridge`

只启动本地 bridge HTTP 服务，不自动打开浏览器。

适合你想手动控制 relay 页面，或者在已有环境中单独维护 bridge 时使用。

### `pnpm agent:doctor`

做链路诊断，确认 bridge、relay、扩展 ID 是否在线。

建议在真正调用 `start`、`jobs.list` 或 MCP tools 之前先跑一次。

注意：`relayConnected=true` 只说明 bridge 当前有 relay 页连上 `/events` SSE；它不等于 relay 页的扩展事件端口一定健康，也不等于目标 Boss 页一定可控。

### `pnpm agent:cli`

CLI 是 bridge HTTP 的一层轻量封装。

适合：

- 手工排障
- 验证某个命令的 payload
- 在脚本外快速看命令返回值

### `pnpm agent:orchestrate`

这是仓库内置的最小外部编排示例。

它会演示一条接近实际自动化的流程：

1. 可选执行 `navigate`
2. 读取 `resume.get`
3. 调用 `jobs.list`
4. 对候选职位执行 `jobs.detail`
5. 做简单关键词分析
6. 可选调用 `start`
7. 可选订阅事件并自动处理 `jobs.review`

它不是 MCP server，但很适合作为“怎样编排这些命令”的参考实现。

### `pnpm agent:mcp`

这是仓库内置的 stdio MCP server。

它会把现有 bridge HTTP 能力封装成 MCP tools，供支持 MCP 的客户端直接调用。

注意：`pnpm agent:mcp` 不负责启动 bridge，也不会帮你连接 relay。它依赖现有 bridge/relay/Boss 页面链路已经在线。

## MCP 工具与现有命令映射

当前 MCP server 暴露这些 tools：

- `boss_helper_health` -> `GET /health`
- `boss_helper_status` -> `GET /status`
- `boss_helper_bootstrap_guide` -> 只读检查 bridge / relay / extensionId / Boss 页冷启动前置条件，并给出精确下一步
- `boss_helper_agent_context` -> 聚合 `health` / `status` / `readiness.get` / `resume.get` / `jobs.list` / `stats` / `logs.query` / 最近事件，返回可直接规划下一步的运行上下文
- `boss_helper_plan_preview` -> 在不触发真实 `start` 的前提下，只读预演当前岗位会如何被处理
- `boss_helper_start` -> `start`
- `boss_helper_pause` -> `pause`
- `boss_helper_resume` -> `resume`
- `boss_helper_stop` -> `stop`
- `boss_helper_stats` -> `stats`，现额外附带 `run.current` / `run.recent` checkpoint 摘要，以及 `risk` 安全护栏摘要
- `boss_helper_navigate` -> `navigate`
- `boss_helper_resume_get` -> `resume.get`
- `boss_helper_jobs_list` -> `jobs.list`
- `boss_helper_jobs_refresh` -> `jobs.refresh`
- `boss_helper_jobs_detail` -> `jobs.detail`
- `boss_helper_jobs_review` -> `jobs.review`
- `boss_helper_logs_query` -> `logs.query`
- `boss_helper_chat_list` -> `chat.list`
- `boss_helper_chat_history` -> `chat.history`
- `boss_helper_chat_send` -> `chat.send`
- `boss_helper_config_get` -> `config.get`
- `boss_helper_config_update` -> `config.update`
- `boss_helper_batch` -> `POST /batch`
- `boss_helper_events_recent` -> 读取 `/agent-events` 的 `history`
- `boss_helper_wait_for_event` -> 等待 `/agent-events` 的下一条匹配事件

此外，MCP server 现在还额外暴露两类高层能力，专门给外部 Agent 做上下文构建与工作流复用：

- `resources`
  - `boss-helper://guides/autonomy-workflow`：推荐的“观察 -> 决策 -> 执行 -> 观察”工作流
  - `boss-helper://guides/review-loop`：`job-pending-review` 外部审核闭环说明
  - `boss-helper://runtime/bridge-context`：当前 bridge / relay 就绪情况、推荐工具和下一步建议
- `prompts`
  - `boss_helper_targeted_delivery`：定向投递工作流提示模板
  - `boss_helper_review_closure`：外部审核闭环提示模板

这意味着外部 Agent 不再需要只靠硬编码提示词猜测调用顺序，而是可以直接从 MCP server 读取“当前上下文”和“推荐工作流”。

## 高层自主能力

### `boss_helper_bootstrap_guide`

这个 tool 面向“环境还没完全搭好”的冷启动阶段。

它会只读汇总这些关键前置条件：

- bridge 是否在线
- relay 是否已连接
- 当前在线 relay 是否已知 extension ID
- Boss 职位页是否存在
- 页面是否已经初始化、是否需要登录、是否存在验证码 / 风控 / 阻断模态框

返回值会稳定包含：

- `readiness`：上述冷启动与页面前置条件的布尔快照
- `summary`：当前所处 bootstrap 阶段、下一步动作、是否必须人工介入
- `steps`：逐步骤清单，明确这一步是 `user` 还是 `agent` 应执行
- `nextSteps`：当前最小下一步

当前 `summary.nextAction` 可能出现：

- `start-bridge`
- `open-relay`
- `configure-extension-id`
- `open-boss-page`
- `navigate`
- `wait-login`
- `refresh-page`
- `stop`
- `continue`

使用建议：

1. 当你不确定本地环境是否已准备好时，先调用 `boss_helper_bootstrap_guide`
2. 只有在它返回 `summary.ready=true` 后，再进入 `boss_helper_agent_context`
3. 如果它指出 `actor=user` 的步骤，不要让外部 Agent 盲重试；应等待人工完成

它和 `boss_helper_agent_context` 的边界是：

- `boss_helper_bootstrap_guide` 负责回答“链路还缺哪一步、下一步谁来做”
- `boss_helper_agent_context` 负责回答“当前页面上下文是什么、适合继续做什么”

### `boss_helper_agent_context`

这是这次深度集成新增的高层 tool。

它不是简单转发单个 bridge 接口，而是把外部 Agent 做决策前最常需要的上下文一次性聚合回来，包括：

- `health`
- `status`
- `readiness.get`
- `plan.preview`
- `config.get`
- `resume.get`
- `jobs.list`
- `stats`
- `logs.query`
- 最近事件快照

调用时可以通过 `include` 选择需要的 section，例如：

```json
{
  "include": ["readiness", "resume", "jobs", "events", "stats"],
  "jobsLimit": 5,
  "eventTypes": ["job-pending-review", "job-succeeded"]
}
```

`readiness` section 现在会默认返回，即使你没有在 `include` 中显式写出它，外部 Agent 也仍然可以依赖同一套 readiness schema 做判断。

返回值除了各 section 的原始结果，还会补：

- `readiness`：bridge / relay / Boss 页面存在性、支持性、初始化状态、可控性、登录状态、验证码 / 风控 / 模态阻断，以及 `suggestedAction`
- `summary`：岗位数、待审核事件数、当日投递数，以及 `hasActiveRun`、`currentRunId`、`recentRunState`、`resumableRun`、`riskLevel`、`riskWarningCount`、`remainingDeliveryCapacity` 这类运行与护栏摘要
- `recommendations`：下一步建议

当前顶层 `readiness` 至少包含这些关键字段：

- `bossPageFound`
- `pageSupported`
- `pageInitialized`
- `pageControllable`
- `loginRequired`
- `hasCaptcha`
- `hasRiskWarning`
- `hasBlockingModal`
- `suggestedAction`

其中 `suggestedAction` 当前稳定收敛为：`navigate`、`wait-login`、`refresh-page`、`stop`、`continue`。外部 Agent 应优先依据这些结构化字段分支，而不是依赖中文错误文案。

对于外部 Agent 来说，这个 tool 的价值在于先拿到“可执行态快照”，再决定是 `navigate`、`jobs.detail`、`start` 还是优先处理审核事件。

### `boss_helper_stats`

`boss_helper_stats` 现在不仅返回瞬时 `progress` 和统计数据，还会附带最小 run/session checkpoint 与安全护栏摘要：

- `data.run.current`：当前或可恢复的运行摘要，包含 `runId`、目标岗位、已分析 / 已处理岗位、最近决策、最后错误、当前页码和当前岗位
- `data.run.recent`：最近一次运行的摘要，即使当前 run 已结束，也可用于人工排障和自动恢复判断
- `data.risk`：当前 `deliveryLimit` 使用情况、剩余额度、去重/通知/缓存护栏是否开启、AI 自动回复等高风险开关，以及结构化 `warnings`

其中与 Phase 7 主动护栏直接相关的 warning 目前至少包括：

- `consecutive-failure-streak`：当前连续失败计数正在接近自动暂停阈值
- `consecutive-failure-auto-stop`：连续失败已达到阈值，本轮已自动进入暂停收尾

当前恢复边界建议如下：

- `paused`：可直接尝试 `boss_helper_resume`
- `error`：先读取 `boss_helper_agent_context.readiness`，必要时刷新 Boss 页面再恢复
- `completed` / `stopped`：只把它们当作审计与排障摘要，不要直接当作可恢复会话

如果你在 live 浏览器里刚更新了仓库代码，但 `boss_helper_stats` 仍只返回旧的 `progress` / `todayData` / `historyData` 结构，没有 `run` 字段，通常说明浏览器里的 unpacked extension 还没 reload 到当前 build，而不是 MCP server 本身失效。

如果 `data.risk.level=high`，推荐把它当作“先复核配置再执行”的信号，而不是只因为页面 readiness 正常就直接 `start`。一个典型流程是：先看 `boss_helper_agent_context.summary.riskLevel`，必要时再展开 `boss_helper_stats.data.risk.warnings`，确认是否只是接近限额，还是确实关闭了关键去重护栏或打开了高风险聊天自动化。

如果当前 run 处于 `paused`，且 `data.risk.warnings` 里出现 `consecutive-failure-auto-stop`，优先检查 `data.run.current.lastError` 或 `data.run.recent.lastError` 再决定是否 `boss_helper_resume`。MCP 聚合层 `boss_helper_agent_context.recommendations` 也会在这种场景下先提示“检查风险摘要和最近错误”，而不是默认建议直接恢复。

## `boss_helper_jobs_refresh`

这个 tool 用于在当前已经位于受支持 Boss 职位搜索页时，做一次低风险页面刷新，帮助外部 Agent 从“页面未初始化完成”“详情卡片状态漂移”“需要重新挂载页面控制器”这类异常里恢复。

它的边界是：

- 相比 `boss_helper_navigate`，它不会修改现有 URL、搜索条件或页码，只会重载当前列表页
- 相比 `boss_helper_jobs_detail`，它不读取任何职位详情
- 相比 `boss_helper_start`，它不会触发真实投递，只负责恢复页面状态

推荐在这些场景调用：

- `boss_helper_agent_context.readiness.suggestedAction=refresh-page`
- 某个命令失败并返回 `suggestedAction=refresh-page`
- 已确认还在正确列表页，但页面控制器需要重新初始化

## `boss_helper_plan_preview`

这个 tool 用于在不触发真实 `start` 的前提下，预演当前页面里的岗位会怎样进入执行链路。它会复用当前页面岗位、当前配置和可选 `configPatch` / `jobIds` / `resetFiltered`，输出：

- `ready`：当前只读前置过滤已通过，可直接进入执行链路
- `skip`：会被现有状态或前置过滤直接跳过
- `missing-info`：缺少卡片、地址、模型等关键输入，当前无法稳定预演
- `needs-manual-review`：为保持 preview 无副作用，内部 AI 筛选没有真的执行
- `needs-external-review`：当前配置要求走外部 AI 审核闭环

推荐顺序是：

1. `boss_helper_bootstrap_guide`
2. `boss_helper_health`
3. `boss_helper_status`
4. `boss_helper_agent_context`
5. 如返回 `suggestedAction=refresh-page`，先调用 `boss_helper_jobs_refresh`
6. `boss_helper_jobs_list` / `boss_helper_jobs_detail`
7. `boss_helper_plan_preview`
8. `boss_helper_start`

如果你只想判断“现在页面能不能操作”，读 `boss_helper_agent_context.readiness` 就够了；如果你要决定“现在 start 会处理哪些岗位以及为什么”，则优先调用 `boss_helper_plan_preview`。

如果你在 bridge / CLI 层做低层排障，也可以直接调用 `readiness.get`：

```bash
pnpm agent:cli readiness.get
```

但对 MCP 客户端来说，仍然应该优先使用 `boss_helper_agent_context`，避免额外拼装 `health` / `status` / `readiness.get`。

## 结构化错误模型

除 `readiness` 这种只读快照外，关键命令失败时现在也会统一返回四个恢复字段：`code`、`message`、`retryable`、`suggestedAction`。

当前优先覆盖这些路径：

- `boss_helper_navigate`
- `boss_helper_resume_get`
- `boss_helper_jobs_detail`
- `boss_helper_chat_send`
- `boss_helper_events_recent`
- `boss_helper_wait_for_event`
- `boss_helper_config_update`
- `boss_helper_start` / `boss_helper_pause` / `boss_helper_resume` / `boss_helper_stop`
- bridge 侧的 `relay-not-connected`、`bridge-timeout`、`page-timeout`

需要注意两层 `suggestedAction` 的语义边界：

- `boss_helper_agent_context.readiness.suggestedAction` 仍然只用于 page-level readiness，稳定收敛为 `navigate`、`wait-login`、`refresh-page`、`stop`、`continue`
- 命令失败响应里的 `suggestedAction` 会更宽一些，除上述值外，还可能出现 `retry`、`fix-input`、`reconnect-relay`、`resume`

推荐外部 Agent 的分支方式如下：

- `retryable=true` 且 `suggestedAction=retry`：可以直接重试当前命令
- `suggestedAction=refresh-page`：优先调用 `boss_helper_jobs_refresh`；如果当前不在受支持职位页或没有 MCP 控制面，再手动刷新 Boss 页面后重试
- `suggestedAction=navigate`：先切回受支持的职位搜索页
- `suggestedAction=wait-login`：等待用户完成登录，不要盲重试
- `suggestedAction=fix-input`：修改参数后再发起下一次调用
- `suggestedAction=reconnect-relay`：先恢复 relay 页面与扩展链路
- `suggestedAction=resume`：当前批次处于暂停态，先恢复再决定是否继续等待事件或发送控制命令

如果你刚给仓库新增了一个 MCP tool 或 agent command，而 live 浏览器里加载的扩展还是旧版本，那么对应调用现在会优先返回 `code=invalid-command`，并伴随 `suggestedAction=refresh-page`。这种场景通常不是 bridge token 失效，而是需要先重新加载扩展 / relay，让浏览器运行到当前仓库版本。

对于 direct MCP tools，这些字段会出现在对应命令返回的桥接 payload 中；对于 `boss_helper_agent_context`，这些字段会被透传到 `sections.<name>` 下，避免外部 Agent 只能读中文文案判断恢复动作。

## 推荐调用顺序

推荐外部 Agent 按下面顺序接入，而不是一上来就直接 `start`：

1. `boss_helper_health`
2. `boss_helper_status`
3. `boss_helper_agent_context`
4. 必要时调用 `boss_helper_navigate`
5. 如果返回 `refresh-page` 恢复信号，调用 `boss_helper_jobs_refresh`
6. `boss_helper_jobs_list`
7. `boss_helper_jobs_detail`
8. `boss_helper_resume_get`
9. 基于职位详情和简历做判断
10. `boss_helper_start` 或 `boss_helper_stop`
11. 运行中通过 `boss_helper_events_recent` / `boss_helper_wait_for_event` 观察结果
12. 如果启用了外部 AI 审核模式，则处理 `job-pending-review` 并调用 `boss_helper_jobs_review`

这条顺序的核心是：先观察，再决策，再执行，而不是把外部智能体退化成“只会发 start 的遥控器”。

## 外部 AI 审核闭环

如果你打开了外部 AI 审核模式，运行中的职位会在 AI 筛选阶段发出 `job-pending-review` 事件。

典型闭环是：

1. Agent 通过 `boss_helper_wait_for_event` 等待 `job-pending-review`
2. 取出事件里的 `encryptJobId`
3. 必要时再调用 `boss_helper_jobs_detail`
4. 外部模型判断是否接受
5. 调用 `boss_helper_jobs_review`
6. 提交 `accepted`、`rating`、`reason`、`positive`、`negative`，可选附带 `greeting`

这时外部 Agent 才真正成为筛选决策者，而不是只改配置的人。

## 配置校验与长超时说明

### `config.update` 校验

`config.update` 不是简单 merge，当前已经接了字段级校验。外部 Agent 如果传错数据，会收到明确错误，而不是沉默失败。

已覆盖的重点校验包括：

- `deliveryLimit.value` 范围
- `delay.*` 不能为负数
- `salaryRange` 与 `companySizeRange` 的结构合法性
- `aiFiltering.score` 范围
- `aiFiltering.externalTimeoutMs` 下限

这对 LLM 来说很重要，因为它需要明确错误才能做自我纠错。

### 长超时命令

不是所有命令都应该按统一 5 秒处理。

当前仓库已经按命令区分超时，尤其要注意：

- `jobs.detail` 允许长超时，因为它可能需要等待页面加载职位卡片详情
- `stop` 允许长超时，因为它可能需要等待当前岗位处理收尾

MCP server 也沿用这个约定，所以外部 Agent 不要把这类命令误判成“系统卡死”。

## 聊天能力边界

当前聊天相关命令已经可用，但边界要说清楚：

- `chat.send`：可直接通过当前页面可用的 Boss 通道发消息
- `chat.list`：返回当前页面采集到的会话摘要
- `chat.history`：返回当前页面采集到的会话消息

这里的读取能力是“当前页面采集视图”，不是 Boss 平台的完整历史库，因此不保证覆盖全量历史聊天。

## 认证与 Token 说明

bridge 使用 `x-boss-helper-agent-token` header 进行 API 认证。MCP server 和 CLI 会自动从 `.boss-helper-agent-token` 文件读取 token，但如果你直接通过 HTTP 调用 bridge，需要手动携带该 header：

```bash
curl http://127.0.0.1:4317/command \
  -H "Content-Type: application/json" \
  -H "x-boss-helper-agent-token: $(cat .boss-helper-agent-token)" \
  -X POST \
  -d '{"command":"stats","payload":{}}'
```

如果遇到 `unauthorized-bridge-token` 错误：
1. 确认 `.boss-helper-agent-token` 文件内容与 bridge 启动时一致
2. 如果文件包含测试 token（如 `vitest-bridge-token-*`），重启 bridge 以刷新 token
3. 检查是否连接到了错误的 bridge 端口

详细认证机制见 [bridge-mcp-deployment.md](./bridge-mcp-deployment.md#认证机制)。

## 认证与 Token 说明

bridge 使用 `x-boss-helper-agent-token` header 进行 API 认证。MCP server 和 CLI 会自动从 `.boss-helper-agent-token` 文件读取 token，但如果你直接通过 HTTP 调用 bridge，需要手动携带该 header：

```bash
curl http://127.0.0.1:4317/command \
  -H "Content-Type: application/json" \
  -H "x-boss-helper-agent-token: $(cat .boss-helper-agent-token)" \
  -X POST \
  -d '{"command":"stats","payload":{}}'
```

如果遇到 `unauthorized-bridge-token` 错误：
1. 确认 `.boss-helper-agent-token` 文件内容与 bridge 启动时一致
2. 如果文件包含测试 token（如 `vitest-bridge-token-*`），重启 bridge 以刷新 token
3. 检查是否连接到了错误的 bridge 端口

详细认证机制见 [bridge-mcp-deployment.md](./bridge-mcp-deployment.md#认证机制)。

## 常见错误与排障

### `unauthorized-bridge-token`

bridge token 不匹配。请检查：

- `.boss-helper-agent-token` 文件内容是否与 bridge 启动时使用的 token 一致
- 如果文件包含测试 token（如 `vitest-bridge-token-*`），需要重启 bridge 以生成新 token
- MCP / CLI 是否连接到了错误的 bridge 端口
- 直接 HTTP 调用时是否携带了 `x-boss-helper-agent-token` header

### `relay-not-connected`

含义：bridge 在线，但 relay 页面没有连接扩展。

处理：

1. 打开 `https://127.0.0.1:4318/`
2. 使用 Chromium 浏览器访问
3. 填写扩展 ID
4. 保持 relay 页面常驻

### relay 页显示 `events: disconnected` / `events: reconnecting`

含义：bridge -> relay 页在线，但 relay -> extension 的外部事件端口没有稳定保持。

处理：

1. 刷新 relay 页面，必要时重新填写扩展 ID 并点击“保存并重连”。
2. 如果刚修改过 `background.ts`、relay 或事件协议相关代码，先重新构建扩展并在浏览器里重新加载。
3. 观察 relay 页是否稳定停在 `bridge: connected` 和 `events: connected`。
4. 注意 `/status.eventSubscribers` 统计的是谁在订阅 `/agent-events`，不是 relay 页自己的 `events` 徽标。

### `target-tab-not-found`

含义：扩展没有找到可用的 Boss 职位页。

处理：

1. 打开 Boss 职位页
2. 确认路径是 `/web/geek/job`、`/web/geek/job-recommend` 或 `/web/geek/jobs`
3. 确认插件已经在页面中初始化完成

### `bridge-timeout`

含义：relay 没有在指定超时内返回结果。

常见原因：

- relay 页面被关闭
- Boss 页面未完成初始化
- `jobs.detail` 正在等待卡片详情，但页面状态异常

### `Operation timed out after 10000ms`

含义：MCP 客户端在启动 `pnpm agent:mcp` 后，没能在自己的超时窗口内完成 MCP 握手。

先区分两类问题：

- 如果 `pnpm agent:mcp` 在终端里直接报错退出，优先修复本地 Node / pnpm / 工作目录问题。
- 如果 `pnpm agent:mcp` 能正常挂起，但客户端仍然超时，更可能是 stdio 握手格式或客户端配置问题。

当前仓库的 MCP server 已同时兼容：

- `Content-Length` framed stdio
- newline-delimited JSON-RPC

像 OpenCode 1.4.x 这类按行发送 JSON-RPC 的客户端，也应能直接加载。如果仍遇到超时，建议按下面顺序排查：

1. 在仓库根目录执行 `opencode mcp list`。
2. 确认 `opencode debug config` 里实际加载了当前项目的 `opencode.json`。
3. 确认不是从别的目录启动了客户端。
4. 再检查 bridge / relay 是否已通过 `pnpm agent:doctor` 就绪。

### `validation-failed`

含义：`config.update` 的 patch 没通过字段级校验。

处理方式不是重试同一个错误 patch，而是读取错误字段并修正参数。

### `review-not-found`

含义：调用 `jobs.review` 时，没有匹配到当前待审核岗位。

通常说明事件已经超时、已被处理，或者你传错了 `encryptJobId`。

## MCP 注册示例

下面是一个通用的 stdio MCP 注册示例。不同客户端的配置文件格式可能不同，但核心字段通常就是 `command`、`args` 和 `cwd`：

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

如果你的客户端支持环境变量覆盖，也可以额外传：

- `BOSS_HELPER_AGENT_HOST`
- `BOSS_HELPER_AGENT_PORT`

默认情况下，MCP server 会连接到 `http://127.0.0.1:4317`。

如果客户端本身支持设置启动超时，可以保留 `10000ms` 这一量级；正常情况下 MCP 握手会在远短于这个阈值的时间内完成。

## OpenCode 自配置指南

如果你希望 OpenCode 进入仓库后就能自动识别 Boss Helper MCP，并且知道正确的调用顺序，推荐把两类文件都提交到仓库根目录：

- `opencode.json`：注册本地 MCP server，并补充项目级 OpenCode 配置
- `AGENTS.md`：告诉 OpenCode 这个仓库的结构、验证命令和 Boss Helper 的推荐工作流

推荐配置如下：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["CONTRIBUTING.md"],
  "mcp": {
    "boss_helper": {
      "type": "local",
      "command": ["pnpm", "agent:mcp"],
      "enabled": true,
      "timeout": 10000,
      "environment": {
        "BOSS_HELPER_AGENT_HOST": "127.0.0.1",
        "BOSS_HELPER_AGENT_PORT": "4317",
        "BOSS_HELPER_AGENT_HTTPS_PORT": "4318"
      }
    }
  },
  "permission": {
    "bash": "ask",
    "edit": "allow",
    "webfetch": "allow",
    "boss_helper*": "allow"
  }
}
```

这份配置的作用是：

1. OpenCode 在项目根目录启动时，会自动加载 `opencode.json`
2. `boss_helper` MCP 会通过 `pnpm agent:mcp` 启动
3. `CONTRIBUTING.md` 会作为额外 instructions 注入上下文
4. `bash` 默认需要确认，但 Boss Helper MCP tools 可直接使用

补充说明：OpenCode 1.4.x 当前会通过 stdio 按行发送 JSON-RPC，而不是传统的 `Content-Length` framed transport；仓库内置 MCP server 已兼容这种模式。

同时建议在根目录维护一份精简的 `AGENTS.md`，至少包含这些规则：

- 遇到 `MCP`、`bridge`、`relay`、`OpenCode`、外部 agent 相关任务时，先读 `docs/llm-agent-mcp.md` 和 `docs/bridge-mcp-deployment.md`
- 不要误以为 `pnpm agent:mcp` 会启动 bridge；它只暴露 stdio MCP tools
- 默认调用顺序应是 `boss_helper_health` -> `boss_helper_status` -> `boss_helper_agent_context`
- 只有在看过上下文后，才继续 `boss_helper_navigate`、`boss_helper_jobs_refresh`、`boss_helper_jobs_list`、`boss_helper_jobs_detail`、`boss_helper_start`
- 如果启用了外部审核模式，必须补完 `job-pending-review` -> `boss_helper_jobs_review` 闭环

给 OpenCode 的首轮任务提示词，可以直接写成：

```text
先按仓库里的 AGENTS.md 和 opencode.json 完成自检：
1. 确认 boss_helper MCP 已加载
2. 如果 bridge 或 relay 未就绪，只告诉我最短启动步骤，不要直接调用 start
3. 先读取 boss_helper_health、boss_helper_status、boss_helper_agent_context
4. 再根据 recommendations 告诉我下一步应该做什么
```

如果 OpenCode 没有读到项目配置，优先排查这几件事：

1. 是否从仓库根目录启动了 OpenCode
2. `opencode.json` 是否位于仓库根目录
3. 是否已经运行过 `pnpm agent:start` 并保持 relay 页面在线
4. `pnpm agent:doctor` 是否显示 `relayConnected=true`

## 推荐实践

如果你要把 Boss Helper 作为外部 LLM Agent 的执行器，建议采用下面这套最稳妥的工作流：

1. 用 `boss_helper_health` / `boss_helper_status` 先确认链路可用
2. 用 `boss_helper_agent_context` 先读取聚合上下文和推荐下一步
3. 用 `boss_helper_navigate` 切换到正确搜索页；如果只需要恢复当前页初始化，改用 `boss_helper_jobs_refresh`
4. 用 `boss_helper_jobs_list` 和 `boss_helper_jobs_detail` 做候选职位分析
5. 用 `boss_helper_resume_get` 把判断建立在真实简历上
6. 只对明确选中的岗位执行 `boss_helper_start`
7. 对运行中的结果用事件工具观察，而不是频繁盲轮询
8. 如果启用外部审核模式，必须处理 `job-pending-review` -> `boss_helper_jobs_review` 闭环
9. 需要稳定工作流时，优先读取 MCP `resources` 和 `prompts`，而不是在客户端侧复制一份说明文档
10. 异常时优先 `boss_helper_stop`，不要只停在 `pause`

这样才能把这个仓库真正当作一个“可被 LLM Agent 驱动的求职执行引擎”，而不是一个只能远程点开始按钮的插件。
