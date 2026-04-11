# BossHelper Refactoring Tasks

> Generated: 2026-04-11 | Companion: [architecture-analysis.md](./architecture-analysis.md)

本文档包含全部重构任务的详细说明。每个任务包含：目标、涉及文件、具体步骤、验收标准。
按优先级分为 4 个 Wave，建议按顺序执行。

---

## Wave 1: 结构拆分与职责明确

> 目标：拆分过大文件，明确模块边界，降低单文件认知负荷。

### Task 1.1: 拆分 `message/agent.ts` (协议定义文件)

**状态:** [x] 已完成（2026-04-11）

**现状:** ~600 行，混合了协议类型、命令定义、事件定义、payload 类型、type guard 函数、工厂函数、验证函数。

**涉及文件:**
- `src/message/agent.ts` → 拆分为多个文件

**步骤:**
1. 创建 `src/message/agent/` 目录
2. 拆分为：
   - `commands.ts` — 命令列表 (`bossHelperAgentCommands`)、请求/响应 payload 类型映射
   - `events.ts` — 事件类型列表 (`bossHelperAgentEventTypes`)、事件 payload 类型
   - `types.ts` — 基础类型 (`BossHelperAgentState`, `BossHelperAgentJobPipelineStatus`, job/chat/log 数据接口)
   - `guards.ts` — 所有 type guard 函数 (`isBossHelperAgentRequest`, `isBossHelperAgentBridgeRequest`, 等)
   - `validation.ts` — token 验证、URL 验证
   - `factory.ts` — `createBossHelperAgentResponse`
   - `controller.ts` — `BossHelperAgentController` 接口
   - `index.ts` — barrel re-export
3. 更新所有 import 路径（使用 `@/message/agent` 作为 barrel，不需要改 consumer 代码）
4. 运行 `pnpm test` 确保无回归

**验收标准:**
- 每个子文件不超过 150 行
- 所有现有测试通过
- 所有 consumer 的 import 仍然工作（barrel re-export）

---

### Task 1.2: 拆分 `filterSteps.ts`

**状态:** [x] 已完成（2026-04-11）

**现状:** ~500 行，13 个 filter factory 函数，每个有不同的依赖和逻辑。

**涉及文件:**
- `src/composables/useApplying/services/filterSteps.ts` → 拆分

**步骤:**
1. 创建 `src/composables/useApplying/services/filters/` 目录
2. 按逻辑分组拆分：
   - `dedup.ts` — `createCommunicatedStep`, `createDuplicateFilter` (含 `getCurrentApplyingUserId`)
   - `keyword.ts` — `createJobTitleStep`, `createCompanyStep`, `createJobContentStep`, `createHrPositionStep`, `createJobAddressStep`
   - `range.ts` — `createSalaryRangeStep`, `createCompanySizeRangeStep`
   - `status.ts` — `createJobFriendStatusStep`, `createActivityFilterStep`, `createGoldHunterFilterStep`
   - `amap.ts` — `createAmapStep`
   - `index.ts` — barrel re-export
3. `handles.ts` 的 import 路径不变（指向 barrel）
4. 运行测试

**验收标准:**
- 每个子文件 50-120 行
- `handles.ts` import 不变
- `tests/gold-hunter-filter.test.ts` 和相关测试通过

---

### Task 1.3: 拆分 `useDeliveryControl.ts` (解耦 god object)

**状态:** [x] 已完成（2026-04-11）

**现状:** God object，~300 行。混合了 controller 构造、command dispatch、window bridge 注册、event forwarding。

**涉及文件:**
- `src/pages/zhipin/hooks/useDeliveryControl.ts` → 拆分

**步骤:**
1. 提取 `agentController.ts`：
   - 将 `controller.handle()` 的 command dispatch 逻辑提取为独立的 `createAgentController(deps)` 工厂函数
   - 接收所有 query handlers 和 batch runner 作为参数（依赖注入）
2. 提取 `agentWindowBridge.ts`：
   - 将 `registerWindowAgentBridge()` 提取为独立函数
   - 接收 controller 和 event emitter 作为参数
3. `useDeliveryControl.ts` 简化为组装层：
   - 调用 `createAgentController()`
   - 调用 `registerWindowAgentBridge()`
   - 返回 public API
4. 运行测试

**验收标准:**
- `useDeliveryControl.ts` 简化到 80 行以内（纯组装）
- `agentController.ts` 可独立测试
- `agentWindowBridge.ts` 可独立测试

---

### Task 1.4: 拆分 `useApplying/utils.ts`

**状态:** [x] 已完成（2026-04-11）

**现状:** 混合了 zhipin API 调用、范围匹配算法、错误处理、auth token 提取。

**涉及文件:**
- `src/composables/useApplying/utils.ts` → 拆分

**步骤:**
1. 提取 `zhipinApi.ts`：`requestCard()`, `requestDetail()`, `sendPublishReq()`, `requestBossData()`, `getBossToken()`
2. 提取 `rangeMatch.ts`：`rangeMatch()`, `rangeMatchFormat()`
3. `utils.ts` 保留：`parseFiltering()`, `errorHandle()`, storage key 常量 (`sameCompanyKey`, `sameHrKey`)
4. 更新 import（消费者主要在 `handles.ts`, `filterSteps.ts`, `greeting.ts`）
5. 运行测试

**验收标准:**
- 每个文件职责单一
- 相关测试通过

---

## Wave 2: 命名统一与接口清理

> 目标：消除命名歧义，统一 store/composable 模式，清理过时代码。

### Task 2.1: 统一 Pinia Store 命名

**状态:** [x] 已完成（2026-04-11）

**现状:** 部分 Pinia store 使用 `use*` composable 命名 (`useCommon`, `useStatistics`, `useDeliver`, `usePager`)，与真正的 composable (`useChat`, `useVue`) 混淆。

**涉及文件:**
- `src/composables/useCommon.ts`
- `src/composables/useStatistics.ts`
- `src/pages/zhipin/hooks/useDeliver.ts`
- `src/pages/zhipin/hooks/usePager.ts`
- 所有 consumer 文件

**步骤:**
1. 以下文件迁移到 `src/stores/` 目录：
   - `useCommon.ts` → `src/stores/common.ts` (store ID 保持 `'common'`)
   - `useStatistics.ts` → `src/stores/statistics.ts` (store ID 保持 `'statistics'`)
2. 以下文件保留在 `hooks/` 但添加明确注释标注为 Pinia store：
   - `useDeliver.ts` — 页面级 store，保留原位
   - `usePager.ts` — 页面级 store，保留原位
3. 更新所有 import 路径
4. 运行测试

**验收标准:**
- 全局 store 在 `src/stores/`，页面级 store 在各自 `hooks/`
- 注释清晰标注 Pinia store vs composable

---

### Task 2.2: 统一导出模式

**状态:** [x] 已完成（2026-04-11）

**现状:** 混合使用 default export 和 named export。部分 store 同时导出 composable 函数和 singleton accessor（`useJobs()` + `jobList`）。

**涉及文件:**
- `src/stores/jobs.ts` (dual export)
- `src/stores/log.tsx` (dual export)
- `src/composables/useWebSocket/handler.ts` (default export)
- `src/utils/elmGetter.ts` (default export object)

**步骤:**
1. 统一为 named export：
   - `handler.ts`：`export class ChatProtobufHandler` 替代 `export default`
   - `elmGetter.ts`：`export const elmGetter = { get, each, rm, validateSelectors }` 替代 default export
2. 对于 dual export pattern（`useJobs()` + `jobList`），保留但添加 JSDoc 注释说明使用场景：
   - `useJobs()` — 在 Vue 组件中使用（有 Pinia 生命周期）
   - `jobList` — 在命令式代码中使用（跨 reactive boundary）
3. 更新 consumer import

**验收标准:**
- 除 Vue 组件外无 default export
- Dual export 有清晰文档

---

### Task 2.3: 清理废弃代码

**状态:** [x] 已完成（2026-04-11）

**涉及文件及操作:**

| 文件 | 操作 | 原因 |
|---|---|---|
| `src/composables/useWebSocket/mqtt.ts` | 评估是否删除 | 文件头标注 "currently unused" |
| `src/composables/useModel/type.ts` 底部小写别名 | 删除 | 向后兼容别名 (`llm`, `messageReps`, `prompt`) |
| `src/types/bossData.d.ts` 中 `bossZpCardData` | 标注 `@deprecated` | 已被 `bossZpDetailData` 替代 |
| `src/composables/useWebSocket/protobuf.ts` 中注释掉的 EventBus | 删除注释代码 | "broken since 2025-12-22" |

**步骤:**
1. 对每个项评估是否仍有消费者（grep 验证）
2. 无消费者则删除；有消费者则标注 `@deprecated` 并添加迁移指引
3. 运行测试

**验收标准:**
- 无 dead code 引用
- 所有 `@deprecated` 标注含迁移指引

---

### Task 2.4: 集中 Storage Key 迁移逻辑

**状态:** [x] 已完成（2026-04-11）

**现状:** `signedKey.ts`, `useModel/index.ts`, `confStore/index.ts` 各自包含 `sync:` → `session:` 迁移逻辑。

**涉及文件:**
- 上述 3 个文件

**步骤:**
1. 创建 `src/utils/storageMigration.ts`，提供 `migrateStorageKey(oldKey, newKey, storage)` 通用函数
2. 各处替换为调用该函数
3. 运行测试

**验收标准:**
- 迁移逻辑集中一处
- 新增迁移可通过声明式配置添加

---

## Wave 3: Protobuf 统一与类型安全增强

> 目标：合并重复的 protobuf schema，增强类型安全。

### Task 3.1: 合并 Protobuf Schema

**状态:** [x] 已完成（2026-04-11）

**现状:**
- `handler.ts`：运行时解析 `chat.proto` 文件 (`protobuf.parse`)
- `type.ts`：程序式构建 schema (`protobuf.Type` + `protobuf.Field`)
- 两者定义相同的 `TechwolfChatProtocol` 结构，独立维护，存在漂移风险

**涉及文件:**
- `src/composables/useWebSocket/handler.ts`
- `src/composables/useWebSocket/type.ts`
- `src/composables/useWebSocket/protobuf.ts`
- `src/assets/chat.proto`

**步骤:**
1. 选择一种 schema 来源：推荐保留 `.proto` 文件（`handler.ts` 方式），删除程序式 schema
2. 修改 `protobuf.ts` 中的 `Message` class 使用 `ChatProtobufHandler` 的实例获取类型
3. 确保 `Message.send()` 仍能正确编码消息
4. 删除 `type.ts` 中重复的 schema 定义（保留 TypeScript 接口）
5. 运行 E2E 测试（chat 功能需人工验证）

**验收标准:**
- 只有一份 protobuf schema 来源 (`.proto` 文件)
- TypeScript 接口仍可用于类型检查
- `Message` class 正常工作

---

### Task 3.2: 提取 Agent Protocol Constants

**状态:** [x] 已完成（2026-04-11）

**现状:** `agent.ts` 中的常量（命令列表、事件类型列表、版本号、支持的路径）散布在类型定义中间。

**涉及文件:**
- `src/message/agent/` (Task 1.1 拆分后)

**步骤:**
1. 在 `commands.ts` 中确保命令列表有 JSDoc 注释
2. 在 `events.ts` 中确保事件类型列表有 JSDoc 注释
3. 添加 `AGENT_PROTOCOL_VERSION` 常量到 `types.ts`
4. 确保 `scripts/agent-mcp-server.mjs` 使用相同的常量（目前可能硬编码）

**验收标准:**
- 协议常量有完整文档
- scripts 与 src 共享常量（如果 build 工具允许）

---

## Wave 4: 测试覆盖与文档

> 目标：提高关键路径测试覆盖，清理过时文档。

### Task 4.1: 为拆分后的模块补充测试

**状态:** [x] 已完成（2026-04-11）

**涉及文件:**
- Wave 1 中拆分出的每个新文件

**步骤:**
1. `agentController.ts` — 单元测试 command dispatch
2. `agentWindowBridge.ts` — 单元测试 message forwarding
3. `filters/dedup.ts` — 单元测试 dedup 逻辑
4. `filters/keyword.ts` — 单元测试 keyword 匹配（含 negative lookahead）
5. `filters/range.ts` — 单元测试 range 匹配
6. `zhipinApi.ts` — mock fetch 测试 API 调用

**验收标准:**
- 新文件覆盖率 >= 85%
- 关键路径 (pipeline, controller) >= 90%

---

### Task 4.2: 清理根目录过时文档

**状态:** [x] 已完成（2026-04-11）

**涉及文件:**
- `ARCHITECTURE.md` — 已过时，用 `docs/architecture-analysis.md` 替代
- `CONTRIBUTING.md` — 检查是否过时
- `review.md` — 评审记录，评估是否还需要
- `todo.md` — 旧 todo，与新任务系统冲突

**步骤:**
1. `ARCHITECTURE.md`：添加重定向到 `docs/architecture-analysis.md`
2. `CONTRIBUTING.md`：更新构建命令、测试命令、lint 命令
3. `review.md`：如纯历史记录则移至 `docs/archive/`
4. `todo.md`：如纯历史记录则移至 `docs/archive/`

**验收标准:**
- 根目录无过时信息误导新人

---

### Task 4.3: scripts/ 目录结构化

**现状:** `agent-mcp-server.mjs` (39KB) 是单体文件，scripts 之间无共享模块。

**涉及文件:**
- `scripts/agent-mcp-server.mjs`
- `scripts/agent-bridge.mjs`
- `scripts/agent-orchestrator.mjs`

**步骤:**
1. 创建 `scripts/shared/` 目录
2. 提取公共逻辑：
   - `scripts/shared/protocol.mjs` — 协议常量（从 `src/message/agent.ts` 同步或直接 import）
   - `scripts/shared/logging.mjs` — 日志格式化
   - `scripts/shared/security.mjs` — token/cert 复用
3. 拆分 `agent-mcp-server.mjs`：
   - `scripts/mcp/server.mjs` — MCP server 主逻辑
   - `scripts/mcp/handlers.mjs` — 各 tool handler
   - `scripts/mcp/catalog.mjs` — tool catalog
4. 运行 `pnpm agent:mcp` 验证

**验收标准:**
- `agent-mcp-server.mjs` 拆分后每个文件 < 400 行
- 共享模块可被多个 script 使用

---

## Execution Checklist

| Wave | Task | Priority | Effort | Risk |
|---|---|---|---|---|
| 1 | 1.1 拆分 agent.ts | High | Medium | Low (barrel re-export) |
| 1 | 1.2 拆分 filterSteps.ts | High | Low | Low |
| 1 | 1.3 拆分 useDeliveryControl.ts | High | Medium | Medium (god object) |
| 1 | 1.4 拆分 utils.ts | High | Low | Low |
| 2 | 2.1 统一 store 命名 | Medium | Medium | Low (rename + move) |
| 2 | 2.2 统一导出模式 | Medium | Low | Low |
| 2 | 2.3 清理废弃代码 | Medium | Low | Low |
| 2 | 2.4 集中 storage 迁移 | Medium | Low | Low |
| 3 | 3.1 合并 protobuf schema | Medium | Medium | Medium (协议变更) |
| 3 | 3.2 提取协议常量 | Low | Low | Low |
| 4 | 4.1 补充测试 | Medium | High | Low |
| 4 | 4.2 清理文档 | Low | Low | Low |
| 4 | 4.3 scripts 结构化 | Low | Medium | Low |

---

## Constraints & Notes

1. **向后兼容**: 所有拆分使用 barrel re-export，确保现有 import 路径不变
2. **测试优先**: 每个 task 完成后运行 `pnpm test`，确认无回归
3. **不改行为**: 重构不改变任何运行时行为。功能变更应在独立 PR 中进行
4. **渐进式**: 每个 Task 可独立完成和合并，不依赖其他 Task（Wave 内例外：Task 3.2 依赖 Task 1.1）
