# MCP Full Automation Todo

## Goal

让外部 AI Agent 可以通过 MCP 在 Boss Helper 上实现稳定、可恢复、可审计的高自动化工作流，而不是只会调用 `start` 的远程按钮。

本清单默认面向“下一位继续写代码的 agent”。优先补齐无人值守所需的诊断、自举、恢复、安全和可观测能力；除非用户明确要求，否则不要在开发验证中触发真实投递。

## Current Baseline

以下链路已在本地验证通过，可作为后续开发基线：

- `pnpm agent:doctor` 通过
- `boss_helper_health` 可用
- `boss_helper_status` 可用
- `boss_helper_agent_context` 可用
- `boss_helper_agent_context` 在 `relayConnected=false` 时可快速返回结构化 readiness 与恢复建议（实际 MCP 调用已验证）
- `boss_helper_stats` 可用
- `boss_helper_config_get` 可用
- `boss_helper_jobs_list` 可用
- `boss_helper_jobs_detail` 可用
- `jobs.refresh` / `boss_helper_jobs_refresh` 已完成仓库侧实现；它会在受支持职位页只刷新当前列表 URL，不改变现有搜索条件，并通过 `tests/agent-job-queries.test.ts`、`tests/agent-controller.test.ts`、`tests/use-delivery-control.test.ts`、`tests/agent-mcp-server.catalog.test.ts`
- 真实 stdio MCP 已验证 `boss_helper_jobs_refresh`：live Boss jobs 页接受刷新请求后，`boss_helper_agent_context` 仍返回 `readiness.ready=true` / `suggestedAction=continue`，`boss_helper_jobs_list` 继续可读
- 真实 live 样本已验证 3 个 `jobs.detail`：在 refresh 前后对同一批岗位连续读取详情，均返回 `code=job-detail` 且 `hasCard=true`，当前尚未复现 detail 失败样本
- 2026-04-13 继续执行 live 只读稳定性采样：对当前页前 10 个真实岗位按 `baseline -> jobs.refresh -> stability-check` 连续执行共 30 次 `jobs.detail`，全部返回 `code=job-detail` / `hasCard=true`；refresh 后 `readiness.ready=true` / `suggestedAction=continue`
- `tests/use-deliver.test.ts` 已对齐当前 `seenJobIds` 语义；`pnpm test -- --run` 现已恢复全绿（85 files / 346 tests）
- `boss_helper_plan_preview` 已完成仓库侧实现，并通过 `pnpm lint && pnpm check && pnpm test -- --run`、`tests/agent-plan-preview.test.ts`、`tests/agent-mcp-server.catalog.test.ts` 与 page/controller 集成测试
- 受控 Playwright fresh-build 扩展链路已验证 `plan.preview` / `boss_helper_plan_preview`：`pnpm check && pnpm build:chrome && pnpm exec playwright test tests/e2e/plan-preview.spec.ts` 通过，CLI 与真实 stdio MCP 均能经 `bridge -> relay -> extension -> page controller` 返回 ready 预演结果
- `plan.preview` 现会在自身内部按需尝试初始化 user store，并在 numeric uid 缺失时回退到 `encryptUserId` 作为账号隔离 key，避免 live Boss 页上的同公司/同 HR 过滤因 `没有获取到uid` 短路
- `boss_helper_logs_query` 可用
- `boss_helper_events_recent` 可用
- 真实 stdio MCP 已验证 `boss_helper_health`、`boss_helper_status`、`boss_helper_agent_context`、`boss_helper_events_recent`、`boss_helper_jobs_list`、`boss_helper_jobs_detail` 可用，live Boss jobs 页返回 `readiness.suggestedAction=continue`，并能读取首个岗位详情
- 真实 live Boss jobs 页已完成最终验证：`pnpm agent:doctor` / `pnpm agent:cli status` 正常，CLI `plan.preview` 与 stdio MCP `boss_helper_plan_preview` 对同一真实岗位均返回 `decision=ready`，不再出现 `没有获取到uid`
- `navigate`、`resume.get`、`jobs.detail`、`chat.send` 以及 bridge 的 `relay-not-connected` / `bridge-timeout` / `page-timeout` 失败响应，现已统一附带 `code` / `message` / `retryable` / `suggestedAction`
- `events_recent`、`wait_for_event`、`config.update`、`start / pause / resume / stop` 的失败响应，现已在 page / bridge / MCP 聚合层统一附带 `code` / `message` / `retryable` / `suggestedAction`
- `boss_helper_agent_context.sections.*` 现会透传底层命令的 `code` / `message` / `retryable` / `suggestedAction`，外部 Agent 不必再依赖中文文案做恢复分支
- 隔离 bridge 实例上，`readiness.get` 在 relay 未连接时会快速返回 `relay-not-connected`，不再默认等待超时
- 受控 Playwright 场景下，`readiness.get` 已验证 `continue` / `wait-login` / `stop` 三类 page-level snapshot，并覆盖 extension + relay + bridge 链路
- 默认 4317 bridge 已恢复真实 relay 连接，`pnpm agent:cli status` 可返回 live relay / extension 元数据
- 真实 Boss jobs 页上，`pnpm agent:cli readiness.get` 已返回 live page-level snapshot，并在页面恢复后给出 `suggestedAction=continue`
- 真实 Boss jobs 页上，`pnpm agent:cli jobs.list`、`pnpm agent:cli jobs.detail` 已验证可用
- MCP 聚合层 `agent_context` 已通过 `scripts/mcp/context.mjs` 的 live bridge 调用验证，聚合 readiness 与页面快照一致
- `stats` / `boss_helper_stats` 现已在仓库侧附带 `run.current` / `run.recent` checkpoint 摘要，`boss_helper_agent_context.summary` 也会聚合 `hasActiveRun` / `currentRunId` / `recentRunState` / `resumableRun`；已通过 `tests/agent-runtime-store.test.ts`、`tests/use-agent-batch-runner.test.ts`、`tests/use-delivery-control.test.ts`、`tests/agent-mcp-server.catalog.test.ts`、`tests/agent-mcp-context.test.ts` 与 `pnpm lint && pnpm check && pnpm test -- --run`
- `stats` / `boss_helper_stats` 现已在仓库侧附带 `risk` 安全护栏摘要，覆盖 `deliveryLimit` 使用情况、剩余额度、重复触达护栏、通知/缓存开关和高风险聊天自动化开关；`boss_helper_agent_context.summary` 也会聚合 `riskLevel` / `riskWarningCount` / `remainingDeliveryCapacity`，并在 recommendations 中提示先复核风险摘要；已通过 `tests/agent-risk-summary.test.ts`、`tests/use-agent-batch-runner.test.ts`、`tests/agent-mcp-server.catalog.test.ts`、`pnpm lint`、`pnpm check`、`pnpm test -- --run` 与 `pnpm build:chrome`
- `连续失败自动暂停` 已完成仓库侧实现：批次连续 3 次出现非 warning 失败时，会发出 `limit-reached`（`detail.guardrailCode=consecutive-failure-auto-stop`），把触发原因写入 `run.lastError`，并同步暴露到 `stats.risk.warnings` 与 `boss_helper_agent_context.recommendations`；已通过 `tests/deliver-execution.test.ts`、`tests/use-deliver.test.ts`、`tests/agent-runtime-store.test.ts`、`tests/agent-risk-summary.test.ts`、`tests/agent-mcp-context.test.ts`、`tests/use-agent-batch-runner.test.ts`、`pnpm lint`、`pnpm check`、`pnpm test -- --run` 与 `pnpm build:chrome`
- `pnpm build:chrome` 通过；真实 `pnpm agent:doctor` / `pnpm agent:cli status` / `pnpm agent:cli stats` 与 stdio MCP `boss_helper_agent_context` 已验证 bridge/MCP 链路可用，且 `summary.todayDelivered` 已兼容 `todayData.success`；在扩展 reload 后，live `pnpm agent:cli stats` 与 stdio MCP `boss_helper_agent_context(include=['readiness','stats'])` 已确认返回 `stats.data.risk`、`summary.riskLevel`、`summary.riskWarningCount` 与 `summary.remainingDeliveryCapacity`
- fresh-build 扩展链路已新增 `tests/e2e/run-summary.spec.ts`，通过 `bridge -> relay -> extension -> page controller -> MCP` 验证了 `stats.data.run` 与 `boss_helper_agent_context.summary` 在 `paused -> resumed -> completed` 与 `batch-error -> error` 两条边界上的输出
- `useDeliver.jobListHandle()` 现在只会在岗位已处理或已明确跳过后才消费定向 `seenJobIds`；pause 后未处理的 target 不会再被误判为“已完成”，resume 可继续处理剩余岗位
- `boss_helper_bootstrap_guide` 已完成仓库侧实现；它会只读汇总 bridge、relay、extension ID、Boss 页存在性与页面 readiness，并稳定返回 `summary.stage` / `summary.nextAction` / `steps` / `nextSteps`，区分当前步骤应由 `user` 还是 `agent` 执行
- `boss-helper://runtime/bridge-context` 现复用 bootstrap guide payload；`tests/agent-mcp-server.catalog.test.ts`、`tests/agent-mcp-context.test.ts` 已验证 ready 与 relay-offline 场景，真实 `pnpm agent:doctor`、`pnpm agent:cli status` 与 stdio MCP `boss_helper_bootstrap_guide` 也已在 live bridge 上验证返回 `stage=ready` / `nextAction=continue`

以下能力本轮未验证，不要假设其无人值守可用性已经足够：

- `boss_helper_start`
- `boss_helper_pause`
- `boss_helper_resume`
- `boss_helper_stop`
- `boss_helper_config_update`
- `boss_helper_chat_send`
- `boss_helper_wait_for_event` 的长时稳定性
- `boss_helper_resume_get` 在不同页面状态下的稳定性

本轮已修复一项与自动化稳定性直接相关的问题：

- `tests/agent-bridge-security.test.ts` 现在使用独立临时 `BOSS_HELPER_AGENT_TOKEN_FILE`
- 后续测试或工具脚本不得再把测试 token 写回仓库根目录 `.boss-helper-agent-token`
- background 现在会把“扩展不认识该 agent command”与“relay/token 认证失败”区分开；在旧扩展上调用新命令时，将返回更准确的 `invalid-command` / `refresh-page` 信号，而不是混淆成 `unauthorized-bridge`

## Hard Constraints For The Next Agent

1. 先观察，再执行。任何高层自主能力都必须优先复用 `boss_helper_health`、`boss_helper_status`、`boss_helper_agent_context`，不要直接从 `start` 开始设计。
2. 保持改动小而集中。优先扩展现有边界：`scripts/mcp/`、`scripts/agent-bridge.mjs`、`src/entrypoints/background.ts`、`src/pages/zhipin/hooks/useDeliveryControl.ts`、`src/message/agent/`。
3. 不要在开发验证中触发真实投递，除非用户明确批准。优先使用只读能力、dry-run、mock、E2E 或受控测试场景。
4. 不要新增平行实现。如果 `agent-orchestrator` 已有编排逻辑，优先抽取复用，而不是再造一套相似判断。
5. 如果修改 agent 命令、payload、事件类型、bridge 端点或 MCP tools，必须同步更新：`README.md`、`docs/bridge-mcp-deployment.md`、`docs/llm-agent-mcp.md`。
6. 如果新增高层自主能力，优先考虑是扩展 `boss_helper_agent_context` 还是新增高层 tool，避免把低层细节泄露给外部 agent。
7. 任何新能力都要返回可恢复的结构化错误。至少包含稳定 `code`，并尽量包含 `retryable`、`suggestedAction` 或等价信息。
8. 任何涉及 token、认证、relay session、bridge 启动的测试，都必须隔离本地文件，不得污染 `.boss-helper-agent-token`、`.boss-helper-agent-cert.json` 等仓库根目录文件。
9. 不提交本地生成文件、token、证书、日志、构建产物或 `.env*`。
10. 每个阶段完成后都要补最小验证集；bridge / relay / MCP 相关改动还要补 `pnpm agent:doctor` 和至少一条实际 MCP 工具调用验证。

## Scope

优先做这些能力：

- 冷启动自举
- 页面与账号诊断
- 可恢复错误模型
- 运行会话与 checkpoint
- dry-run / plan
- 安全护栏
- 可观测性

暂不优先：

- 复杂 UI 重构
- 非 MCP 主路径的新自动化入口
- 与无人值守无关的样式或面板优化

## Continuous Execution Workflow

这条流程用于让下一位 agent 不需要重新规划，就能沿着同一条主线持续推进。默认规则：一次只推进一个阶段，一次只交付一个最小可验证增量；如果当前环境不满足只读诊断前提，则本轮只修复阻塞，不并行推进新能力。

1. 恢复现场

- 先读完 `Goal`、`Current Baseline`、`Hard Constraints For The Next Agent`、`Validation Checklist`
- 先执行只读观测链路：`boss_helper_health` -> `boss_helper_status` -> `boss_helper_agent_context`
- 如果这一步已经不能稳定返回，本轮目标自动降级为“恢复 readiness”，不要继续做新 feature

2. 选择当前阶段

- 严格按 `Suggested Implementation Order` 选择最靠前、且交付标准尚未满足的 phase
- 在进入下一阶段前，先确认上一阶段的“交付标准”已经满足，而不是只完成部分代码
- 当前默认激活阶段是 `Phase 1: Readiness And Diagnostics`

3. 切最小增量

- 每轮只做一个最小可连续交付单元，优先级如下：
- 一个稳定 schema
- 一个只读诊断能力
- 一组结构化错误码
- 一个 dry-run / checkpoint / report 查询接口
- 如果一个需求同时包含“读”和“写”，先只落只读部分，写操作延后到下一轮

4. 按固定落地顺序实现

- 先定返回结构和错误模型，再改页面控制器 / background / bridge / MCP 映射
- 优先复用已有实现边界，不新增平行编排
- 任何会触发真实投递、真实聊天发送的能力，都必须晚于只读诊断、dry-run 和安全护栏

5. 做分层验证

- 先跑与本轮改动直接相关的单元或集成验证
- 再跑 `Validation Checklist` 里的最小验证集
- 如果改动涉及 bridge / relay / MCP，再补 `pnpm agent:doctor`、`pnpm agent:cli status` 和至少一条真实 MCP 调用
- 如果验证失败，不切换 phase，继续留在当前 phase 修完为止

6. 更新文档与基线

- 如果本轮改了 tools、端点、命令、事件、错误模型或默认行为，立即同步 `README.md`、`docs/bridge-mcp-deployment.md`、`docs/llm-agent-mcp.md`
- 把本轮新验证通过的能力回写到 `Current Baseline`
- 如果某个 phase 的交付标准已满足，把下一个 phase 升级为当前阶段

7. 回写交接信息

- 每轮结束前，必须更新本文件中的 `Execution Ledger`
- 至少写清楚：当前阶段、刚完成的最小增量、实际验证结果、下一步最小动作、已知阻塞
- 如果没有更新 ledger，不算完成交接

## Execution Ledger

用于跨轮次连续执行，后续 agent 每次完成一轮后都应更新这些字段。

- Current Active Phase: `Phase 7: Safety Guardrails`
- Current Smallest Executable Increment: `本轮已在既有 risk 摘要之上补齐首个主动护栏：当批次连续 3 次出现非 warning 失败时，页面侧会自动进入暂停收尾，发出 limit-reached(detail.guardrailCode=consecutive-failure-auto-stop)，并把原因同步写入 risk / run / events，外部 Agent 不再只能从中文文案猜测为什么停下`
- Promotion Gate: `当前这道 gate“至少交付一个真正降低默认风险面的主动护栏，并完成 lint/check/test + build + doctor/status + 实际 MCP tool 调用验证”已满足。下一 gate 是补另一个默认保守的执行上限，例如每轮上限、异常总次数上限，或把高风险自动化动作改成显式开关`
- Next Step After Current Increment: `优先实现每轮上限或异常总次数上限，并继续沿 stats.risk / run.lastError / agent_context.recommendations 暴露结构化触发原因；如需引入新配置项，先补 config schema、validation 和 risk summary，再接入真实停止逻辑`
- Known Blockers: `start / pause / resume / stop / chat.send 仍未做真实 live Boss 页无人值守验证；本轮“连续失败自动暂停”已完成 live build 装载后的只读链路验证，但仍未在 live Boss 页触发真实连续失败样本，以避免开发验证中产生真实投递，因此目前只能证明 risk/run/context 字段已现场生效，不能证明 auto-stop 分支已在 live 页面上被实际击中`
- Last Verified Baseline: `2026-04-13 已完成本轮 P7 第二个增量验证并补齐 live reload 现场确认：pnpm lint、pnpm check、pnpm test -- --run（86 files / 354 tests）与 pnpm build:chrome 通过；新增/更新 tests/deliver-execution.test.ts、tests/use-deliver.test.ts、tests/agent-runtime-store.test.ts、tests/agent-risk-summary.test.ts、tests/agent-mcp-context.test.ts、tests/use-agent-batch-runner.test.ts 通过。真实 companion 链路方面，pnpm agent:doctor、pnpm agent:cli status、pnpm agent:cli stats 正常，relayConnected=true；扩展 reload 后，stdio MCP boss_helper_agent_context（include=['readiness','stats']）与 CLI stats 均已现场返回 stats.data.risk、summary.riskLevel、summary.riskWarningCount、summary.remainingDeliveryCapacity，证明新 build 已被 live 页面加载。此前 Phase 6 的 live readiness / jobs.refresh / jobs.detail 只读基线继续保持有效`

## Phase 1: Readiness And Diagnostics

目标：让外部 Agent 能准确判断“现在能不能安全继续执行”。

任务：

- 为页面增加结构化就绪状态读取能力，至少覆盖：bridge 在线、relay 在线、Boss 页是否存在、页面 URL、是否为支持页面、插件是否初始化、页面是否可控
- 增加账号与风险状态读取能力，至少覆盖：登录状态、是否存在验证码/异常提醒/风控弹窗、是否存在阻断操作的模态框
- 明确区分“bridge 已连通”和“Boss 页面可执行”
- 评估是否将这些信息并入 `boss_helper_agent_context`，避免外部 Agent 需要自行拼接多次调用
- 为新状态增加稳定 schema，避免字段名频繁变化

交付标准：

- 外部 Agent 仅靠 MCP 返回值，就能判断下一步应执行 `navigate`、等待用户登录、刷新页面、停止执行或继续分析职位
- `agent_context` 或新增 tool 中的 readiness 字段足以区分常见阻塞原因

建议涉及文件：

- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `src/entrypoints/background.ts`
- `src/message/agent/`
- `scripts/mcp/`

## Phase 2: Structured Error Model

目标：让外部 Agent 能做自我修复，而不是只看到自然语言报错。

任务：

- 盘点现有错误码，整理成统一错误模型
- 为常见失败补充结构化字段：`code`、`message`、`retryable`、`suggestedAction`
- 优先覆盖这些场景：relay 未连接、页面未初始化、页面不受支持、Boss 页不存在、登录失效、风控阻断、详情加载失败、配置校验失败、聊天通道不可用
- 为 `jobs.detail`、`navigate`、`resume.get` 等可能受页面状态影响的命令补充更细粒度失败原因

交付标准：

- 外部 Agent 不需要依赖中文错误文案做分支判断
- 至少关键命令具备稳定恢复信号

建议涉及文件：

- `src/message/agent/`
- `scripts/agent-bridge.mjs`
- `scripts/mcp/`
- `docs/llm-agent-mcp.md`

## Phase 3: Dry-Run And Planning

目标：让 Agent 在不投递的情况下做完整决策预演。

任务：

- 增加 dry-run 或 plan 类能力，输入当前页面、当前配置、可选目标 jobIds，输出“哪些岗位会被处理以及原因”
- 输出应区分：可投递、应跳过、缺少信息、需要人工确认、需要外部 AI 审核
- 尽量复用现有 pipeline 或筛选逻辑，不要复制一份新的判断代码
- 为外部 Agent 提供简洁 summary 和逐岗位 explain 字段

交付标准：

- 可以在不调用 `start` 的前提下，拿到与实际执行足够接近的决策预览
- 外部 Agent 能基于 plan 结果决定是否继续调用 `start`

建议涉及文件：

- `src/composables/useApplying/`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `scripts/mcp/`

## Phase 4: Run Session And Checkpoint

目标：让 Agent 中断后可以恢复，而不是重新从第一页分析。

任务：

- 设计 run/session id
- 持久化关键运行态：目标岗位、已分析岗位、已处理岗位、最近决策、最后错误、当前页码、当前 jobId
- 允许 MCP 查询当前或最近一次 run 的摘要
- 为恢复逻辑定义边界：哪些状态可恢复，哪些必须重新读取页面

交付标准：

- Agent 进程重启后仍能知道上次运行停在哪里
- 运行摘要能支持人工排障和自动恢复

建议涉及文件：

- `src/stores/`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `scripts/mcp/`

## Phase 5: Cold Start Bootstrap

目标：降低“必须人工先把环境搭好”的前置要求。

任务：

- 定义哪些自举动作应该由 MCP 支持，哪些仍必须人工完成
- 至少补齐诊断链路：bridge 是否已运行、relay 是否在线、扩展 ID 是否已配置、Boss 页面是否存在
- 评估是否提供只读 bootstrap guide tool，返回当前缺失步骤和精确下一步，而不是盲目失败
- 如果实现启动类能力，必须严格限制在 localhost 范围内，不扩大暴露面

交付标准：

- 外部 Agent 能明确知道“还缺哪一步”，而不是只能收到超时
- 自举能力不引入新的默认安全风险

建议涉及文件：

- `scripts/agent-bridge.mjs`
- `scripts/mcp/`
- `docs/bridge-mcp-deployment.md`

## Phase 6: Fine-Grained Control Primitives

目标：提升自动恢复能力，减少只能 `start/stop` 的粗粒度控制。

任务：

- 评估并补充这些原语是否有必要进入 MCP：翻页、刷新列表、读取当前选中岗位、重试详情加载、单岗位跳过、单岗位执行
- 保持原语最小化，不要把页面所有按钮都暴露成 tool
- 对每个新原语说明它与现有 `navigate`、`jobs.list`、`jobs.detail`、`start` 的边界

交付标准：

- 外部 Agent 可以在不重启整批任务的情况下处理常见页面异常

## Phase 7: Safety Guardrails

目标：让无人值守运行默认更保守。

任务：

- 增加每日上限、每轮上限、异常次数上限、连续失败自动 stop 等安全规则
- 增加公司 / HR / 职位去重策略的可观测反馈
- 为高风险动作定义显式开关，避免默认放开
- 为外部 Agent 提供“本次运行风险摘要”

交付标准：

- 即使外部 Agent 判断失误，也不容易无限重试或无上限执行

## Phase 8: Observability And Audit

目标：让人能看懂 Agent 做了什么，为什么这样做。

任务：

- 增加结构化决策日志，记录关键决策输入、判断原因、结果和时间
- 区分系统错误、页面错误、配置错误、风险中断、业务跳过
- 提供 MCP 侧可读的运行摘要或 run report
- 对外部 AI 审核闭环保留足够审计信息

交付标准：

- 失败后能快速定位是环境问题、页面问题、配置问题还是策略问题

## Phase 9: Chat Safety Automation

目标：在不扩大风险的前提下支持更稳的聊天自动化。

任务：

- 明确当前聊天读取只覆盖“当前页面采集视图”，不要对外部 Agent 暗示全量历史可用
- 如果增强聊天自动化，优先补未回复会话过滤、发送前审计、发送结果校验
- 对消息模板、变量替换、发送节流增加约束

交付标准：

- 聊天能力不会被误当作“全量聊天数据库”
- 自动发送前有足够的约束和回执

## Phase 10: MCP-Native Workflow Layer

目标：把当前分散在 `agent-orchestrator` 里的成熟编排经验，逐步下沉为 MCP 原生高层能力。

任务：

- 盘点 `scripts/agent-orchestrator.mjs` 中已验证有效的流程片段
- 抽出可复用的高层判断，不要把 CLI 参数风格直接搬进 MCP
- 优先下沉这些能力：候选岗位筛选、事件观察、待审核闭环、恢复建议
- 谨慎决定是新增高层 tools、resources/prompts，还是增强 `agent_context`

交付标准：

- 外部 Agent 不需要复制一整套 orchestrator 逻辑才能稳定运行

## Documentation Sync Checklist

只要本轮实现涉及以下任一变化，就必须同步更新文档：

- 新增或修改 MCP tools
- 新增或修改 bridge 端点
- 新增或修改 agent 命令、payload、事件类型
- 新增运行态、错误模型、bootstrap 语义
- 新增安全护栏或默认行为变更

必须同步检查的文档：

- `README.md`
- `docs/bridge-mcp-deployment.md`
- `docs/llm-agent-mcp.md`

文档至少要说明：

- 新能力做什么
- 推荐调用顺序
- 关键参数与返回值
- 失败时怎么恢复
- 安全边界和默认行为

## Validation Checklist

最小验证集：

- `pnpm lint`
- `pnpm check`
- `pnpm test -- --run`

如果改动涉及 bridge / relay / MCP，还要补：

- `pnpm agent:doctor`
- `pnpm agent:cli status`
- 至少一条真实 MCP 工具调用验证

如果改动涉及页面自动化、诊断、职位读取，还要补：

- `boss_helper_health`
- `boss_helper_status`
- `boss_helper_agent_context`
- `boss_helper_jobs_list`
- `boss_helper_jobs_detail`

如果改动涉及协议或错误模型，还要补：

- 相应单元测试
- 相应集成测试
- 如有必要，补 E2E

## Suggested Implementation Order

建议按以下顺序推进，避免先做高风险执行能力：

1. Readiness And Diagnostics
2. Structured Error Model
3. Dry-Run And Planning
4. Run Session And Checkpoint
5. Safety Guardrails
6. Observability And Audit
7. Fine-Grained Control Primitives
8. Cold Start Bootstrap
9. Chat Safety Automation
10. MCP-Native Workflow Layer

## Definition Of Done

只有同时满足以下条件，才能认为“支持更完整的 MCP 自动化”已经真正落地：

- 外部 Agent 可以先观察上下文，再做决策，而不是只能盲调 `start`
- 常见失败具备结构化恢复信号
- 至少存在一个 dry-run 或 plan 路径，允许无副作用预演
- 运行过程有可查询的摘要、日志或 checkpoint
- 新能力文档已同步
- 最小验证集和相关链路验证已完成
