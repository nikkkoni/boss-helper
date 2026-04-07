# Boss Helper 面向 LLM Agent 的接近全自动投递改造建议

本文档基于当前仓库实现现状整理，目标是让 `boss-helper` 能更好地接入 `OpenCode` 等 LLM Agent，实现接近完全自动的投递、筛选、跟进与策略调整。

## 当前基础能力

当前项目已经具备较强的 Agent 化基础设施：

- 本地 bridge 服务：`scripts/agent-bridge.mjs`
- relay 页面：`scripts/agent-relay.html`
- 扩展侧对外命令：`start`、`pause`、`resume`、`stats`、`config.get`、`config.update`
- SSE 实时事件流：`/agent-events`
- 可运行时热更新配置：`config.update`、`start({ configPatch })`
- 内置 AI 筛选与 AI 招呼语

这意味着项目已经不是“从零开始接入 Agent”，而是已经具备一套初版 Agent API，只是距离“接近完全自动投递”还缺关键能力。

## 总体判断

如果想要通过 `OpenCode`、Claude、Cursor Agent 等外部 LLM Agent 实现接近完全自动投递，核心不是继续堆更多静态过滤规则，而是补齐以下三类能力：

1. 可观察：Agent 必须能看到职位列表、职位详情、历史日志、简历与聊天内容。
2. 可控制：Agent 必须能导航页面、选择职位、终止任务、发送消息、调整配置。
3. 可闭环：Agent 必须能在运行过程中接管筛选决策、根据事件反馈调整策略，并处理投递后的对话。

以下是完整改造建议，按 15 个方向展开。

---

## 1. 新增 `jobs.list` 命令，暴露当前页面职位列表

### 问题

当前 Agent 无法获取当前页面的职位列表，只能盲目调用 `start` 启动批量投递。外部 LLM 无法先浏览再决策。

相关位置：

- `src/message/agent.ts`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `src/stores/jobs.ts`

### 建议

新增 `jobs.list` 命令，返回当前页面的职位摘要列表，至少包含：

- `encryptJobId`
- `jobName`
- `brandName`
- `brandScaleName`
- `salaryDesc`
- `cityName`
- `areaDistrict`
- `skills`
- `jobLabels`
- `bossName`
- `bossTitle`
- `goldHunter`
- `contact`
- `welfareList`
- 当前 pipeline 状态：`status`、`statusMsg`
- `hasCard`，表示详情是否已加载

### 实现建议

在 `src/message/agent.ts` 中扩展：

- `bossHelperAgentCommands`
- `BossHelperAgentRequestPayloadMap`
- `BossHelperAgentResponseDataMap`
- 新增 `BossHelperAgentJobsListPayload`
- 新增 `BossHelperAgentJobSummary`
- 新增 `BossHelperAgentJobsListData`

在 `src/pages/zhipin/hooks/useDeliveryControl.ts` 中新增 `jobsList()`：

- 调用 `jobList._list.value`
- 根据可选 `statusFilter` 做过滤
- 将 `MyJobListData` 映射为对外稳定结构
- 通过 `createBossHelperAgentResponse()` 返回

### 价值

这是所有“智能决策”的前置条件。没有 `jobs.list`，外部 Agent 无法完成浏览、排序、选择性投递。

---

## 2. 新增 `jobs.detail` 命令，暴露 JD 全文与职位详情

### 问题

当前 Agent 无法读取单个职位的详细信息，只能依赖页面内部 pipeline 在执行时隐式获取 `card`。这导致外部 LLM 无法先阅读 JD 再决定是否投递。

相关位置：

- `src/stores/jobs.ts`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `src/message/agent.ts`

### 建议

新增 `jobs.detail` 命令，输入 `encryptJobId`，返回完整职位详情：

- `postDescription`
- `salaryDesc`
- `degreeName`
- `experienceName`
- `address`
- `jobLabels`
- `bossName`
- `bossTitle`
- `activeTimeDesc`
- `friendStatus`
- `brandName`
- `brandIndustry`
- `welfareList`
- `skills`
- 坐标信息 `gps`

### 实现建议

直接复用 `MyJobListData.getCard()`：

- 如果 `item.card` 已存在，直接返回
- 否则先调用 `await item.getCard()`
- 将 `card` 和 `job item` 上的字段拼成对外结构

### 风险与注意点

`getCard()` 内部通过点击职位卡片等待 Boss 页面完成详情注入，超时时间可达 60 秒，因此必须同步处理 Agent 请求超时问题，见建议 7。

### 价值

外部 LLM 只有拿到 JD 全文后，才能真正替代静态关键词过滤，进行更接近人类求职者的判断。

---

## 3. 新增 `navigate` 命令，允许 Agent 控制搜索页与翻页

### 问题

当前 Agent 无法控制 Boss 页面导航、搜索条件和翻页逻辑。必须依赖用户手动进入正确页面，这使“完全自动”在流程上断裂。

相关位置：

- `src/message/agent.ts`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `src/message/agent.ts` 中的 `bossHelperSupportedJobPaths`

### 建议

新增 `navigate` 命令，支持：

- `url`：直接跳转到指定搜索地址
- `query`：搜索关键词
- `city`
- `position`
- `page`

### 实现建议

在页面侧实现时，优先采用两种模式：

1. 简单模式：构建 Boss 搜索 URL，使用 `window.location.href` 导航。
2. 增强模式：如果 Boss 页面内部有稳定 router，可直接调其导航能力。

建议返回响应后用短延迟再跳转，避免页面立即销毁导致 `postMessage` 响应丢失。

### 价值

有了 `navigate`，外部 Agent 才能：

- 自动切换搜索关键词
- 自动切换城市或职位分类
- 自动翻页
- 在低质量结果页和高质量结果页之间切换策略

---

## 4. 新增聊天命令：`chat.list`、`chat.history`、`chat.send`

### 问题

当前项目虽然已具备 WebSocket 发送消息能力，但 Agent API 没有暴露聊天相关接口。投递之后的沟通仍然完全无法自动化。

相关位置：

- `src/composables/useApplying/handles.ts`
- `src/composables/useWebSocket/`
- `src/message/agent.ts`

### 建议

新增三类命令：

- `chat.list`：获取最近对话列表
- `chat.history`：获取某个 HR 的聊天记录
- `chat.send`：发送指定消息

### 实现建议

#### `chat.send`

先实现最容易落地的 `chat.send`：

- 复用已有 `Message` 类
- 复用当前招呼语发送逻辑中的参数结构：`form_uid`、`to_uid`、`to_name`、`content`
- 由 Agent 决定发什么内容、何时发

#### `chat.list` / `chat.history`

这两个能力需要进一步逆向 Boss 的聊天数据来源，可采用两条路径：

1. 调用 Boss chat API
2. hook 页面上的聊天 Vue 数据

### 价值

如果没有聊天读写能力，“自动投递”最多只能做到自动海投，而无法完成真正的“自动求职流程”。

---

## 5. 增加 Agent 编排模式，而非只依赖配置驱动 pipeline

### 问题

当前整体投递流程仍然是“用户预设配置，系统按规则机械执行”。虽然已经有 Agent API，但 API 粒度还不足以支持外部 LLM 完整编排。

相关位置：

- `scripts/agent-bridge.mjs`
- `scripts/agent-cli.mjs`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`

### 建议

新增一个外部 orchestrator 脚本或 MCP Server，将整个流程改造成：

1. `jobs.list`
2. 对候选职位调用 `jobs.detail`
3. LLM 评估是否投递
4. LLM 生成打招呼内容
5. `start({ jobIds, configPatch })`
6. 监听 `/agent-events`
7. 根据结果决定是否继续、翻页、换搜索条件

### 实现建议

新增：

- `scripts/agent-orchestrator.mjs`
或
- `scripts/agent-mcp-server.mjs`

其中 MCP Server 更适合与 `OpenCode` 等工具集成，让仓库直接以 tool 的形式暴露“查看职位、看详情、投递、发消息”等能力。

### 价值

这是把“扩展 API”升级成“可被外部智能体持续控制的执行系统”的关键步骤。

---

## 6. 新增 `resume.get` 命令，暴露用户简历数据

### 问题

当前 LLM 要想基于简历精准判断岗位匹配度，通常只能依赖用户把简历粘进 prompt。仓库里虽然已有 `bossZpResumeData` 类型，但 Agent API 没有对外暴露简历内容。

相关位置：

- `src/types/boosData.d.ts`
- `src/message/agent.ts`
- 模型相关逻辑中已有简历检查痕迹

### 建议

新增 `resume.get` 命令，返回 Boss 平台上当前账号对应的简历结构化数据。

### 实现建议

可通过以下方式之一实现：

1. 调用 Boss 简历接口
2. 复用当前已有的简历读取能力
3. 在页面内 hook 已加载的简历数据

### 价值

没有简历，LLM 很难判断“适不适合我”；有了简历，外部 Agent 才能基于真实背景做高质量筛选和打招呼生成。

---

## 7. 去掉 content script 中 5 秒固定超时，改为命令级超时

### 问题

当前 `forwardAgentRequestToPage()` 在 `src/message/contentScript.ts` 中写死了 5 秒超时。对于 `jobs.detail` 这类需要等待页面加载详情的命令，这个超时太短，会直接导致能力不可用。

相关位置：

- `src/message/contentScript.ts`
- `scripts/agent-bridge.mjs`

### 建议

实现“按命令动态超时”的机制，例如：

- `jobs.list`: 10 秒
- `jobs.detail`: 65 秒
- `navigate`: 10 秒
- `chat.send`: 10 秒
- 默认仍然 5 秒

### 实现建议

在 `contentScript.ts` 中新增 `getCommandTimeout(command)`，替换硬编码的 `5000`。

同时在 bridge 层允许请求端覆盖超时时间，避免 page 层与 bridge 层的超时互相打架。

### 价值

这是支撑新增命令的基础设施改造，不做这一步，很多后续能力虽能设计出来，但实际上跑不通。

---

## 8. 支持批量命令或事务调用

### 问题

当前每个 Agent 操作都需要单独请求 `/command`，外部 orchestrator 会有很多 HTTP 往返，复杂流程也缺少组合能力。

相关位置：

- `scripts/agent-bridge.mjs`

### 建议

新增 `POST /batch` 接口，支持按顺序执行多个命令：

- 每条命令可以带 `payload`
- 每条命令可以带 `timeoutMs`
- 支持 `stopOnError`

### 实现建议

在 bridge 层对一组命令顺序调用 `queueCommand()`，收集结果后统一返回。

### 价值

不是最核心能力，但会显著降低 orchestrator 复杂度，也便于后续接 MCP 时封装更高级别 tool。

---

## 9. 支持事件订阅过滤，降低噪音

### 问题

当前 `/agent-events` 会推送全部事件。随着命令和事件增多，外部 Agent 会收到大量与当前任务无关的噪音。

相关位置：

- `scripts/agent-bridge.mjs`
- `src/message/agent.ts`

### 建议

在 SSE 订阅上支持 query 参数过滤，例如：

- `/agent-events?types=job-succeeded,job-filtered`

### 实现建议

在 bridge 层为每个 event client 保存订阅条件：

- `typeFilter: Set<string> | null`
- 广播前先判断是否命中
- 初始历史记录也按过滤条件裁剪

### 价值

这会显著提升 Agent 的事件处理质量，尤其是在高频投递和多任务场景下。

---

## 10. 对 `config.update` 增加 schema 校验与字段级报错

### 问题

当前 `config.update` 基本是“拿到 patch 就 merge”，没有做严谨校验。如果外部 LLM 传了错误类型或不合理参数，系统可能默默接受，然后在运行时出错。

相关位置：

- `src/stores/conf/index.ts`
- `src/types/formData.ts`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`

### 建议

增加配置 patch 校验，至少覆盖：

- `deliveryLimit.value` 范围
- `delay.*` 不能为负数
- 范围输入上下限顺序
- `aiFiltering.score` 类型
- `salaryRange`、`companySizeRange` 的结构正确性

### 实现建议

新增 `src/stores/conf/validation.ts`：

- 导出 `validateConfigPatch(patch)`
- 返回字段级错误数组

在 `updateConfig()` 中：

- 校验失败时返回 `validation-failed`
- 将详细错误一并返回给 Agent

### 价值

LLM Agent 非常依赖明确错误反馈才能“自我纠错”。如果没有配置校验，它会在大量模糊失败中浪费很多轮尝试。

---

## 11. 在事件中暴露 AI Filtering 的评分细节

### 问题

当前 AI 过滤在失败时只会通过 `errorMessage` 暴露结论，外部 Agent 无法看到 `positive`、`negative`、`rating` 等评分细节，因此没法做分析与自适应调参。

相关位置：

- `src/composables/useApplying/handles.ts`
- `src/pages/zhipin/hooks/useDeliver.ts`

### 建议

在 `job-filtered` 事件里，如果原因是 AI 过滤，额外带上：

- `positive`
- `negative`
- `rating`
- `threshold`

### 实现建议

在 `aiFiltering()` 中：

- `parseFiltering(content)` 之后把结果挂到上下文或错误对象上
- 抛出 `AIFilteringError` 时附带评分信息

在 `useDeliver.ts` 的 `handleFailure()` 中：

- 如果错误对象里有 `aiScore`
- 则把 `aiScore` 合并进 SSE event 的 `detail`

### 价值

有了评分细节，外部 Agent 才能：

- 动态调整过滤阈值
- 分析当前 prompt 是否偏严或偏松
- 识别哪些岗位特征经常导致拒绝

---

## 12. 支持“外部 AI 替代内置 AI”的审核模式

### 问题

当前 AI 筛选和 AI 招呼语都封装在内部 pipeline 中，模型由插件内部配置驱动。即使有 Agent API，外部 Agent 也只能旁观和发命令，无法真正接管“判断逻辑”。

这是目前距离“全自动 LLM Agent”最大的结构性缺口。

相关位置：

- `src/composables/useApplying/handles.ts`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `src/message/agent.ts`
- `src/types/formData.ts`

### 建议

增加一种外部审核模式：

1. pipeline 走到 AI 筛选步骤时，不立刻本地打分
2. 发出 `job-pending-review` 事件，把岗位详情发给外部 Agent
3. 外部 Agent 调用 `jobs.review`
4. 传回：接受 / 拒绝 / 原因 / 打招呼语 / 分数
5. pipeline 根据 review 结果继续执行或过滤

### 实现建议

#### 配置层

在 `FormData.aiFiltering` 中增加：

- `externalMode?: boolean`
- `externalTimeoutMs?: number`

#### 命令层

新增：

- `jobs.review`

#### 事件层

新增事件类型：

- `job-pending-review`

#### 控制层

在 `useDeliveryControl.ts` 中维护 `pendingReviews`：

- `Map<encryptJobId, { resolve, timeout }>`

在 `jobs.review` 命令里：

- 找到待审核项
- 清理超时
- 通过 `resolve()` 把结果送回 pipeline

在 `aiFiltering()` 中：

- 如果 `externalMode` 打开，则改为等待外部审核结果

### 价值

这是最值得投入的能力。做完之后，`OpenCode` 等外部 Agent 就不再是“改参数的人”，而是“真正做决策的人”。

---

## 13. 新增 `logs.query` 命令，暴露结构化历史日志

### 问题

当前仓库内部有 `useLog`，但 Agent API 没有办法读取投递日志、过滤原因、AI 结果、招呼语等历史记录。没有日志，Agent 无法做复盘、归因和反馈学习。

相关位置：

- `src/stores/log.ts`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `src/message/agent.ts`

### 建议

新增 `logs.query` 命令，支持：

- `limit`
- `offset`
- `status[]`
- 时间范围过滤

返回内容建议包括：

- `encryptJobId`
- `jobName`
- `brandName`
- `status`
- `message`
- `error`
- `greeting`
- `aiScore`
- `timestamp`

### 实现建议

直接从 `useLog().data` 中取数据，对字段做适配映射即可。

### 价值

日志查询是构建“Agent 自我学习闭环”的关键能力，没有它就很难做长期优化。

---

## 14. 强化 bridge 的断线恢复与排队能力

### 问题

当前只要 relay 页面断开，`/command` 会立即返回 `relay-not-connected`。这使外部 Agent 很脆弱，尤其在长时间运行时。

相关位置：

- `scripts/agent-bridge.mjs`
- `scripts/agent-relay.html`

### 建议

让 bridge 默认支持：

- relay 不在线时仍可排队命令
- relay 重连后自动 drain 队列
- 请求端可通过参数决定是否“等待 relay”或“立即失败”

### 实现建议

修改 `/command`：

- 去掉当前“无 relay 直接 503”的硬失败逻辑
- 默认将请求写入 `commandQueue`
- 等待 `dispatchQueuedCommands()` 在 relay 重连后继续执行

relay 页面侧则补充：

- 自动重连日志
- 更明确的连接状态可见性

### 价值

长时间自动运行时，这项能力会明显提升稳定性，减少人工盯盘。

---

## 15. 新增 `stop` 命令，支持完全停止并重置任务状态

### 问题

当前只有 `pause` 和 `resume`，没有真正意义上的“停止并清空中间状态”。这意味着外部 Agent 无法彻底终止一个错误策略，只能暂停后再想办法恢复或等待自然结束。

相关位置：

- `src/message/agent.ts`
- `src/pages/zhipin/hooks/useDeliveryControl.ts`

### 建议

新增 `stop` 命令，语义是：

- 如果任务运行中，则请求停止并等待当前岗位处理收尾
- 清空 `activeTargetJobIds`
- 清空 `remainingTargetJobIds`
- 清理 `batchPromise`
- 把状态切回 `idle`

### 实现建议

在 `useDeliveryControl.ts` 中新增 `stopBatch()`：

- 调用前先 `ensureStoresLoaded()`
- 如果在运行，则设置 `deliverStop = true`
- 等待当前任务释放 `deliverLock`
- 调用 `clearTargetJobState()`
- 重置 `deliverLock`、`deliverStop`、`batchPromise`
- 发出一个带 `source: 'stop-command'` 的状态事件

### 价值

这是 Agent 必须具备的“紧急制动”能力，尤其在外部策略失控、页面异常或风控信号增强时非常重要。

---

## 额外建议：不要把未来能力继续塞进单一的 `start/config.update` 模型

当前系统已经有明显趋势：

- 旧模式：用户改配置，系统批处理
- 新模式：外部 Agent 通过 API 观察系统并持续决策

随着能力扩大，建议把 Agent API 从“配置补丁接口”升级成“资源 + 行为接口”：

- 资源：`jobs.list`、`jobs.detail`、`resume.get`、`logs.query`、`chat.history`
- 行为：`start`、`pause`、`resume`、`stop`、`navigate`、`chat.send`、`jobs.review`

这样的接口组织更适合 MCP、LangChain Tool、OpenCode Tool 等 Agent 环境。

---

## 推荐实施优先级

### P0：必须优先做

1. `jobs.list`
2. `jobs.detail`
3. 命令级超时机制
4. `stop`

这些能力是“让外部 Agent 有最基本自主观察和控制能力”的底座。

### P1：高价值核心能力

1. 外部 AI 审核模式：`job-pending-review` + `jobs.review`
2. `navigate`
3. Agent orchestrator / MCP Server
4. `chat.send`

这些能力决定系统是否能真正从“自动化工具”升级为“可被智能体持续操控的执行器”。

### P2：提升稳定性和学习能力

1. `config.update` 校验
2. AI 评分细节回传
3. `resume.get`
4. `logs.query`
5. 事件过滤

### P3：工程增强项

1. `/batch` 批量命令
2. bridge 断线恢复增强

---

## 最终结论

当前仓库已经具备相当好的 Agent 化基础，但还停留在“外部可以遥控一个配置驱动的批处理器”阶段。

如果要实现通过 `OpenCode` 等 LLM Agent 达到接近完全自动投递，最关键的不是继续增加更多本地过滤开关，而是把系统升级为一个对外可观察、可控制、可闭环的执行平台。

最值得优先投入的几项改动是：

1. `jobs.list`
2. `jobs.detail`
3. 命令级超时机制
4. `stop`
5. 外部 AI 审核模式
6. `navigate`
7. `chat.send`

如果这些能力落地，外部 LLM Agent 就可以完成如下完整闭环：

1. 自动打开或切换搜索页
2. 读取职位列表
3. 拉取职位详情
4. 基于简历做判断
5. 生成定制化打招呼
6. 精准投递
7. 监听结果与风控信号
8. 动态调参
9. 自动跟进对话
10. 基于日志持续优化策略

到那时，`boss-helper` 就不再只是“Boss 自动投递插件”，而会变成一个可被 LLM Agent 驱动的求职执行引擎。
