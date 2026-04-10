# BossHelper 当前整治待办

> 基于 [review.md](review.md)（2026-04-10）重排，只保留当前未完成且需要继续跟进的事项。  
> 当前基线：Lint clean / 23+ tests passing / Coverage Stmts ~69% Branches ~51% Funcs ~71% Lines ~71% / Version 0.4.4  
> 范围：73 个确认 Bug（B1-B73）+ 18 个安全问题（S1-S18）+ review 中未编号的架构、性能、测试债务。

---

## 重排原则

1. 以 `review.md` 为唯一事实来源，`todo.md` 只保留执行顺序和落地动作。
2. 不再保留已完成的历史 Phase 0-6 作为主线待办；历史完成情况以 git 记录和 `review.md` 的“已解决问题”为准。
3. 先按修复波次推进，再按模块批量修复，避免按单个编号碎片化提交。
4. 所有任务都尽量保留 review 编号，便于提交、测试和回归时对照。
5. 功能增强项暂缓，先把 HIGH bug、安全问题、测试基础设施和 Store 架构债务清掉。

---

## Wave 1 — 立即修复

> 目标：先清空 review 明确标记的 HIGH bug 和 HIGH 安全问题。

### 1.1 核心运行正确性

- [x] 修复 `stores/jobs.ts` 的 map getter 和详情加载轮询，确保 jobs store 可正确读取、同步和等待数据。（B1, B58）
- [x] 修复 `utils/request.ts` timeout 单位错误，恢复真实超时语义。（B2）
- [x] 修复 `stores/conf/index.ts` 的 `confDelete`、`confRecommend`、migration 顺序问题，确保配置删除、推荐和版本迁移真正生效。（B3, B43, B52）
- [x] 修复 `composables/useApplying/utils.ts` 中 `sendPublishReq` 的无限递归风险。（B4）
- [x] 修复 `entrypoints/main-world.ts` 的 `axiosLoad` 默认值和并发串扰，改为 request-local loader。（B5, B6）
- [x] 修复 `composables/useModel/index.ts` 的排序变异和重复初始化问题，避免响应式副作用和 HMR 重复数据。（B7, B51）
- [x] 修复 `components/llms/Selectllm.vue` 的 loading 泄漏和无效 `ElForm v-model`。（B39, B54）
- [x] 修复 `useWebSocket/type.ts` 缺失 `originImage` 字段导致的 protobuf 编解码错误。（B10）

### 1.2 输入、安全与序列化

- [x] 修复 `filterSteps.ts` 用户输入直接进入 `RegExp` 的问题，统一做转义和预编译。（B9, B69, S4）
- [x] 修复 `utils/safeHtml.ts` 的 `<br>` 正则错误，并收紧 `style` 白名单策略。（B40, S8）
- [x] 修复 `utils/deepmerge.ts` 的数组克隆和 `constructor` 原型污染防护。（B11, B41）
- [x] 修复 `stores/signedKey.ts` 的环境 URL 选择，避免开发环境请求生产地址。（B42）

### 1.3 Bridge / MCP / 消息链路安全

- [x] 收敛 `message/background.ts` 的代理能力，增加 URL 白名单并处理 `tab.id` 空值场景。（S1, B47）
- [x] 为 `scripts/agent-bridge.mjs` 增加请求体大小限制，移除 relay HTML 和 stdout 中的明文 token，并废弃 query-param token。（S3, S13, S15）
- [x] 为 `scripts/agent-mcp-server.mjs` 增加 stdin 串行队列和 Content-Length 上限校验。（B8, S14）
- [ ] 修复 `scripts/agent-security.mjs` 的文件权限和证书 CA 标记。（S2, S10）

### 1.4 Wave 1 验收

- [ ] 运行 `pnpm lint`
- [ ] 运行 `pnpm check`
- [ ] 运行 `pnpm test -- --run`
- [ ] 为 Wave 1 改动补最小必要单测，优先覆盖 timeout、配置迁移、message 安全和 bridge body 限制。

---

## Wave 2 — 中优先级缺陷与中等级安全

> 目标：清理 MEDIUM bug，补齐消息边界、异步竞态和易错 UI。

### 2.1 用户、模型和并发状态

- [ ] 修复 `stores/user.ts` 的模板渲染、gender 默认值、Cookie 可选链、简历拉取异常处理问题。（B12, B13, B44, B45）
- [ ] 修复 `aiFiltering.ts`、`openai.ts`、`signedKey.ts` 的可选链、null content、`.pop()` 变异、stream 死代码和 `undefined` 拼接问题。（B14, B15, B18, B19, B20）
- [ ] 修复 `useStatistics.ts`、`usePipelineCache.ts`、`utils/concurrency.ts` 的竞态、初始化等待和 falsy 缓存命中问题。（B16, B17, B21, B50）
- [ ] 修复 `deliverExecution.ts`、`agentEvents.ts`、`amapStep.ts`、`rangeMatch` 注释/实现不一致等流程错误。（B22, B23, B48, B49）
- [ ] 解除 `stores/user.ts ↔ stores/conf/index.ts` 循环依赖，并把 `initUser` 轮询改为 watch 驱动。（B57, B59）

### 2.2 组件与交互缺陷

- [ ] 修复 `components/SalaryRange.vue` 的 props 变异和 `@Click` 事件名错误。（B24, B25）
- [ ] 修复 `pages/zhipin/components/Ui.vue` 的版本比较和 `data-help` 属性拼写问题。（B26, B46）
- [ ] 修复 `pages/zhipin/components/Ai.vue`、`components/App.vue`、`components/CreateLLM.vue`、`pages/zhipin/components/Card.vue` 等明显 UI 缺陷。（B27, B28, B29, B56）
- [ ] 修复 `utils/logger.ts` iframe 清理和 console 方法绑定问题。（B30, B65）
- [ ] 修复 `utils/elmGetter.ts` timeout=0 泄漏和 `components/form/FormSelect.vue` 的 `defineModel` 误用。（B53, B55）
- [ ] 修复 `stores/log.tsx` 查询时全量复制反转造成的性能问题。（B60）

### 2.3 中等级安全

- [ ] 统一 `postMessage` / `onMessage` 的 `origin` 校验，移除 `'*'` 广播。（S5, S6, S16）
- [ ] 收紧 bridge/background 的 localhost 协议与 CORS 规则，修复 trusted relay 配置矛盾。（S7, S18）
- [ ] 为跳转和地图请求增加协议、参数校验，并限制 WebSocket monkey patch 的作用范围。（S9, S11, S12）
- [ ] 将 `window.__bossHelperAgent` 以及其它调试型全局暴露收敛为 dev-only。（S17）

### 2.4 Wave 2 验收

- [ ] 补齐对应模块单测：`safeHtml`、`concurrency`、`useStatistics`、`openai`、`stores/user`
- [ ] 增加消息链路与 bridge 安全回归测试

---

## Wave 3 — 架构、组件和性能债务

> 目标：处理 review 中未编号但已明确点名的架构、组件、类型和性能问题。

### 3.1 Store 架构统一

- [ ] 统一 store 模式：将 `stores/jobs.ts`、`stores/user.ts`、`stores/log.tsx` 收敛到 Pinia，并消除非原子更新和模块级共享状态。（Store 设计问题 1, 4, 6）
- [ ] 为 `stores/signedKey.ts` 的 fire-and-forget Promise 增加错误处理，避免静默失败。（Store 设计问题 3）
- [ ] 为全局 `window.__q_*` 调试入口增加 `import.meta.env.DEV` 门控。（Store 设计问题 2）
- [ ] 统一 `_list`、`_map` 等公开性约定，补齐 jobs store 的可见性和状态边界。（Store 设计问题 5）

### 3.2 组件、类型与可维护性

- [ ] 拆分 `Service.vue`、`Selectllm.vue`、`Config.vue` 三个超大组件，按职责拆出表单、测试对话框、服务配置等子组件。（组件质量问题 1）
- [ ] 为 `Selectllm.vue`、`LLMFormItem.vue`、`Logs.vue`、`Ai.vue` 增加 scoped 样式隔离，避免全局样式泄漏。（组件质量问题 2）
- [ ] 清理 `Chat.vue`、`CreateLLM.vue` 等死代码和未使用变量，补齐 `Jobcard.vue` 可访问性与暗色模式问题。（组件质量问题 4, 5, 6）
- [ ] 修复 `boosData.d.ts`、`openapi.d.ts`、`deliverError.ts`、`useModel/type.ts` 的命名和类型债务，并减少 `any` / `as any`。（类型系统问题 1, 2, 3, 4, 5）

### 3.3 性能热点

- [ ] 优化 `pages/zhipin/components/Ui.vue` 鼠标移动热路径，避免每帧执行 `elementFromPoint()` 和 `getBoundingClientRect()`。（架构/性能问题 1）
- [ ] 优化 `utils/amap.ts` 请求策略，只请求启用的距离类型，并复用已修复的参数编码逻辑。（架构/性能问题 2）
- [ ] 去重 `stores/signedKey.ts` 重复请求 `/v1/llm/model_list` 的问题。（架构/性能问题 3）
- [ ] 优化 `mqtt.ts` 拼包、`agent-bridge.mjs` relay 广播策略和 `agent-relay.html` 日志 DOM 增长问题。（架构/性能问题 4, 5, 6）
- [ ] 替换 `useVue.ts` 中废弃的 `__lookupSetter__` / `__lookupGetter__` API。（架构/性能问题 7）

---

## Wave 4 — 测试体系补齐

> 目标：让 review 中点名的关键模块都有独立测试，覆盖异常路径和并发场景。

- [ ] 在 `vitest.config.ts` 中开启 `restoreMocks: true`，并把 coverage include 改为目录规则而不是手工白名单。（测试覆盖缺口 7, 8）
- [ ] 补充 review 点名缺测模块的独立单测：`useCommon.ts`、`useChat.ts`、`useStatistics.ts`、`useVue.ts`、`conf/index.ts`、`jobs.ts`、`user.ts`、`signedKey.ts`、`content.ts`、`main-world.ts`、`concurrency.ts`、`retry.ts`、`safeHtml.ts`、`useDeliveryControl.ts`、`useAgentBatchRunner.ts`。（测试覆盖缺口 9）
- [ ] 拆分 `agent-mcp-server.test.ts` 巨型测试，按功能拆为多个小用例。（测试覆盖缺口 10）
- [ ] 扩展 E2E 到异常场景：网络错误、限流响应、并发投递、导航中断、端口冲突、预构建产物缺失。（测试覆盖缺口 11, 12, 13）
- [ ] 修复 `chat-stream.test.ts` 的 `WebSocket.prototype.send` 并行测试污染问题。（测试覆盖缺口 14）
- [ ] 补齐 `goldHunterFilter`、`shouldStop: () => true`、组件交互边界、缓存并发写、batch 双启动、mock 保真度、DOMRect 补丁等基础测试缺口。（测试覆盖缺口 1, 2, 3, 4, 5, 6）

---

## Wave 5 — 低优先级收尾

> 目标：合并处理 LOW bug 和脚本健壮性问题，避免主线修复期间被噪音打断。

- [ ] 处理 ID 生成、锁和容量上限类问题：`chatPrompt.ts`、`useApplying/index.ts`、`useAgentBatchRunner.ts`、`agentReview.ts`、`usePager.ts`、`useWebSocket/protobuf.ts`。（B31, B32, B33, B34, B35, B36）
- [ ] 校正协议/CLI/脚本健壮性问题：`handler.ts`、`agent-orchestrator.mjs`、`agent-cli.mjs`、`agent-launch.mjs`。（B37, B38, B70, B71, B72, B73）
- [ ] 清理命名、key 生成、共享状态和调试暴露问题：`selectors.ts`、`ConfigLLM.vue`、`utils/index.ts`、`utils/parse.ts`、`components/conf/Log.vue`、`components/conf/Store.vue`。（B61, B62, B63, B64, B66）
- [ ] 清理 `useWebSocket/protobuf.ts` 的死代码与魔法数字说明。（B67, B68）

---

## 暂缓项

- [ ] 在 Wave 1-4 基本完成前，不重新排期功能增强：Multi-LLM fallback、场景化模型配置、投递回滚、管线可视化、多站点适配。

---

## 里程碑

1. M1：Wave 1 完成，HIGH bug 和 HIGH 安全问题清零。
2. M2：Wave 2 完成，消息链路、用户态、组件交互不再存在已知中级风险。
3. M3：Wave 3 完成，Store 模式统一，超大组件拆分，主要性能热点收敛。
4. M4：Wave 4 完成，核心模块具备独立单测和异常场景 E2E。
5. M5：Wave 5 完成，LOW bug 和脚本收尾问题全部关闭。

---

## 执行约束

1. 每个提交只覆盖一个波次内的一个模块簇，避免跨层大杂烩。
2. 先补回归测试再动重构；安全修复优先于样式、命名和功能增强。
3. 每个模块修复时同步关闭重复项，例如 `RegExp`、`safeHtml`、`postMessage`、Store 轮询问题不要拆成多个零碎提交。
4. 任何一项完成后，都要在提交说明里标注对应 review 编号。
