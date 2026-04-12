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
- `boss_helper_stats` 可用
- `boss_helper_config_get` 可用
- `boss_helper_jobs_list` 可用
- `boss_helper_jobs_detail` 可用
- `boss_helper_logs_query` 可用
- `boss_helper_events_recent` 可用

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
- `pnpm agent:cli -- status`
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
