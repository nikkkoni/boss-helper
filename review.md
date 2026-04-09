# BossHelper Browser Extension Codebase Review

**Review Date:** 2026-04-10 (deep static analysis, full codebase; updated with second-pass findings)
**Status Summary:** Lint clean (0 errors/warnings). 23+ Vitest tests passing. Coverage: Stmts ~69% / Branches ~51% / Funcs ~71% / Lines ~71%. Version 0.4.4.

---

## Project Overview

- **Purpose**: Chrome/Firefox MV3 browser extension for zhipin.com (Boss Zhipin). Automates job filtering, AI-powered resume delivery, batch application, real-time chat, and integrates with local AI agents via bridge/MCP.
- **Architecture**: Multi-layered — External callers (CLI/MCP/LLM Agent) → Bridge server (HTTP/HTTPS:4317/4318) → Relay page (SSE) → Extension background → Content script → Main-world (Vue UI + SiteAdapter + Pipeline).
- **Tech Stack**: WXT, Vue 3/JSX, Pinia, TypeScript, Element Plus, protobuf/MQTT, OpenAI SDK, Vitest/Playwright/oxlint.

---

## Strengths

1. **优秀的模块化架构** — `useDeliveryControl` 编排小型 runner/queries，SiteAdapter 抽象已实现，pipeline steps 可独立测试。
2. **完善的 Agent 系统** — Bridge/Relay/MCP 全链路完成，类型安全的消息层，SSE 事件推送，token 认证。
3. **扎实的管线设计** — before/after 队列编译，19 步流程包含规则过滤、AI 过滤、高德距离、自动打招呼。
4. **类型系统较强** — 全链路 TypeScript，OpenAPI 类型生成，typed messages/stores/validation。
5. **测试基础已建立** — 23+ 单元测试覆盖关键路径，Playwright E2E 框架就绪，CI 流程完整。
6. **安全基础已打** — Bridge token 认证、DOMPurify XSS 防护、CSP 已配置、`externally_connectable` 已收窄。
7. **完善的文档** — ARCHITECTURE.md、CONTRIBUTING.md、MCP 部署文档齐全。

---

## 已解决的历史问题（对比上次 review）

以下是上次 review 指出但现已解决的问题：
- ~~Zhipin 耦合 / 无 adapter 层~~ → `SiteAdapter` 接口 + `ZhipinAdapter` 实现已完成
- ~~无 CSP~~ → WXT manifest 已添加 `content_security_policy`
- ~~Bridge 无认证~~ → Token 签名验证已实现
- ~~无 XSS 防护~~ → DOMPurify + `SafeHtml.vue` 组件
- ~~双锁文件 bun.lock~~ → 已删除，统一 pnpm
- ~~bak.ts 残留~~ → 已清理
- ~~无限循环风险~~ → `agentBatchLoop` 已有 `maxIterations` + `maxRuntimeMs`
- ~~无重试/退避~~ → `retry.ts` 已实现重试、退避、熔断
- ~~覆盖率 <50%~~ → 现已 ~70%
- ~~无并发控制~~ → `concurrency.ts` 已实现

---

## 当前问题：确认的 Bug（按严重级别）

### HIGH — 需立即修复

| # | 文件 | 行 | 描述 |
|---|------|-----|------|
| B1 | `stores/jobs.ts` | 136 | `this._map.value` — reactive 对象无 `.value` 属性，getter 始终返回 `undefined` |
| B2 | `utils/request.ts` | 178 | `AbortSignal.timeout(timeout * 1000)` — timeout 默认 18000 (ms) 再乘 1000 变 5 小时 |
| B3 | `stores/conf/index.ts` | 276 | `confDelete` 调用 `deepmerge` 默认 `clone: true`，不会真正重置 `formData` |
| B4 | `composables/useApplying/utils.ts` | 147 | `sendPublishReq` 递归未递减 retries，120-BOSS 对话框场景无限递归 |
| B5 | `entrypoints/main-world.ts` | 73-84 | `axiosLoad` 未初始化为 no-op，`config.timeout` 为 null 时 error interceptor 抛 TypeError |
| B6 | `entrypoints/main-world.ts` | 73 | `axiosLoad` 单变量共享，并发请求互相覆盖 loader |
| B7 | `composables/useModel/index.ts` | 47 | computed getter 中 `.sort()` 原地排序会变异底层数组，可触发无限响应式循环 |
| B8 | `scripts/agent-mcp-server.mjs` | 1181 | async stdin handler 无队列，并发消息导致 stdout 交错 |
| B9 | `composables/useApplying/services/filterSteps.ts` | 253 | `new RegExp(x)` 用户输入未转义 — ReDoS 漏洞 |
| B10 | `useWebSocket/type.ts` | 82 | protobuf 定义缺少 `originImage` 字段(field 3)，序列化/反序列化失败 |

### MEDIUM — 应尽快修复

| # | 文件 | 行 | 描述 |
|---|------|-----|------|
| B11 | `utils/deepmerge.ts` | 22 | `deepClone` 不处理数组，数组按引用返回，修改克隆对象影响原始 |
| B12 | `stores/user.ts` | 309 | `template.replaceAll('undefined', '')` 会破坏含"undefined"文本的合法内容 |
| B13 | `stores/user.ts` | 133 | gender 为 `undefined` 时默认返回 `'woman'`，应有 unknown 处理 |
| B14 | `composables/useApplying/services/aiFiltering.ts` | 91-96 | `amap?.distance?.straight.distance` 缺少对 `straight` 的可选链 |
| B15 | `composables/useApplying/services/aiFiltering.ts` | 113 | AI 返回 null content 静默通过过滤，应当拒绝或报错 |
| B16 | `composables/useStatistics.ts` | 82 | fire-and-forget async 导致 `statisticsData` 竞态 |
| B17 | `composables/usePipelineCache.ts` | 44 | 构造函数 `void initCache()` 不等待，方法可在空缓存上运行 |
| B18 | `composables/useModel/openai.ts` | 163,189 | `.pop()` 变异 response.choices 数组，undefined 时抛异常 |
| B19 | `composables/useModel/openai.ts` | 200-202 | stream 分支总是返回空字符串 — 死代码 |
| B20 | `composables/useModel/signedKey.ts` | 97 | `this.user_request + data.amap` — amap 为 undefined 时拼接出 "...undefined" |
| B21 | `utils/concurrency.ts` | 75 | falsy 缓存值 (0, false, "") 被当作缓存未命中 |
| B22 | `pages/zhipin/services/deliverExecution.ts` | 205 | 限流时 `deliveryInterval += 3` 无上限累加，永久变慢 |
| B23 | `pages/zhipin/hooks/agentEvents.ts` | 27 | listener 抛异常导致后续 listener 不执行（事件丢失） |
| B24 | `components/SalaryRange.vue` | 31,39 | `v-model="props.value[0]"` 直接修改 props（Vue 反模式） |
| B25 | `components/SalaryRange.vue` | 49 | `@Click` 大写 C — Vue 事件名大小写敏感，不会触发 |
| B26 | `pages/zhipin/components/Ui.vue` | 211 | 字符串版本比较 `>` 是词典序非语义化，`'9.0.0' > '10.0.0'` 为 true |
| B27 | `pages/zhipin/components/Ai.vue` | 88 | `v-key` 非 Vue 内置指令，应为 `:key` |
| B28 | `components/App.vue` | 70 | 重复 `style` 属性，第二个 `object-fit: cover` 丢失 |
| B29 | `components/CreateLLM.vue` | 31 | `color16()` 生成无效十六进制（单位数值未 padStart） |
| B30 | `utils/logger.ts` | 11-16 | 隐藏 iframe 永不移除 + `contentWindow` 无 null 检查 |

### HIGH — 需立即修复（第二轮审查新增）

| # | 文件 | 行 | 描述 |
|---|------|-----|------|
| B39 | `components/llms/Selectllm.vue` | 163-168 | `testJobLoading.value = true` 后验证失败提前 return 未重置，UI 永久 loading 状态 |
| B40 | `utils/safeHtml.ts` | 96 | `htmlToText` 正则 `/<br\s*\/?/gi` 缺少闭合 `>`，`<br />` 变成 `\n/>` |
| B41 | `utils/deepmerge.ts` | 46 | 仅防护 `__proto__`，未防护 `constructor` 原型污染 |
| B42 | `stores/signedKey.ts` | 89-93 | `baseUrl` 硬编码生产 URL，注释掉的环境判断导致 dev 也打向生产 |
| B43 | `stores/conf/index.ts` | 60-67 | 版本迁移循环从后向前遍历，新增迁移可能被跳过 |

### MEDIUM — 应尽快修复（第二轮审查新增）

| # | 文件 | 行 | 描述 |
|---|------|-----|------|
| B44 | `stores/user.ts` | 319 | `window?.Cookie.get('bst')` 可选链位置错误，`Cookie` 未定义时崩溃（应为 `window.Cookie?.get`） |
| B45 | `stores/user.ts` | 320-327 | `getUserResumeData` 中 `fetch()` 无 try/catch，网络错误未处理 |
| B46 | `pages/zhipin/components/Ui.vue` | 266 | `Alertdata-help` 属性拼写错误，help tooltip 失效（应为 `data-help`） |
| B47 | `message/background.ts` | 169 | `tab.id!` 非空断言——devtools 等特殊标签 `id` 为 undefined，运行时崩溃 |
| B48 | `composables/useApplying/services/amapStep.ts` | 35 | `card?.jobInfo.address` 缺少可选链，`jobInfo` 为 undefined 时崩溃（应为 `card?.jobInfo?.address`） |
| B49 | `composables/useApplying/utils.ts` | 240-246 | `rangeMatch` 严格模式注释说"职位范围覆盖目标"，代码实际检查反向 |
| B50 | `composables/useStatistics.ts` | 48 | `date = getCurDay()` 仅在 store 创建时捕获，跨午夜后统计数据归档错误 |
| B51 | `composables/useModel/index.ts` | 72 | `init()` 使用 `.push()` 追加 modelData，HMR/重新挂载时数据重复 |
| B52 | `stores/conf/index.ts` | 251-273 | `confRecommend` 同样缺少 `{ clone: false }` 参数（与 B3 同类问题），推荐配置未真正应用 |
| B53 | `utils/elmGetter.ts` | 135-184 | `timeoutMs` 为 0 时 MutationObserver 和 retry interval 永不清理，内存泄漏 |
| B54 | `components/llms/Selectllm.vue` | 373 | `<ElForm v-model="message as string">` — ElForm 不支持 v-model |
| B55 | `components/form/FormSelect.vue` | 5 | `defineModel('options')` 应为 `defineProps` — options 只读数据源不需要双向绑定 |
| B56 | `pages/zhipin/components/Card.vue` | 17 | 使用已废弃的 `e.wheelDelta` 属性，Firefox 下 `-undefined` 为 NaN |
| B57 | `stores/user.ts ↔ stores/conf/index.ts` | - | 循环依赖——运行时因延迟消费可工作，但打包器变更可能致命 |
| B58 | `stores/jobs.ts` | 61-68 | `loadJobDetail` 用 100ms setInterval 轮询（最多 600 次），应改用 `watch()` |
| B59 | `stores/user.ts` | 87-101 | `initUser` 用 400ms setInterval 轮询 25 秒（最多 62 次），应改用 `watch()` |
| B60 | `stores/log.tsx` | 230 | `[...filtered].reverse()` 每次 `query()` 全量复制 + 反转，大日志量下性能差 |

### LOW — 可在后续迭代中修复（第二轮审查新增）

| # | 文件 | 描述 |
|---|------|------|
| B61 | `utils/selectors.ts:49` | `boss-helper-job-warp` 拼写错误（应为 wrap） |
| B62 | `components/llms/ConfigLLM.vue:39,63,67` | `new Date().getTime()` 作为 key，同毫秒碰撞——改用 `crypto.randomUUID()` |
| B63 | `utils/index.ts:50` | `delayLoadId` 模块级共享，并发 `delay()` 调用互相取消动画但 Promise 仍 resolve |
| B64 | `utils/parse.ts:25-27` | `window.__q_parseGptJson` 全局挂载——污染命名空间，暴露内部逻辑 |
| B65 | `utils/logger.ts:87-88` | `group`/`groupEnd` 未 `.bind()`，部分引擎调用时可能抛异常 |
| B66 | `components/conf/Log.vue + Store.vue` | 占位组件无实际功能，Cancel/Confirm 按钮英文与界面中文不一致 |
| B67 | `composables/useWebSocket/protobuf.ts:54-56` | `toArrayBuffer()` 方法从未被调用——死代码 |
| B68 | `composables/useWebSocket/protobuf.ts:22` | 魔法数字 `68256432452609` 无注释说明 |
| B69 | `composables/useApplying/services/filterSteps.ts:253` | RegExp 在热循环内每次构造（性能），应预编译 |
| B70 | `scripts/agent-cli.mjs:66` | `JSON.parse(next)` 无 try/catch，无效 JSON 直接崩溃 |
| B71 | `scripts/agent-orchestrator.mjs:300,499` | `jobsList.data.jobs`/`resume.data.resumeText` 无 null 检查 |
| B72 | `scripts/agent-launch.mjs:100` | `child.pid` 可能为 undefined，写入 pid 文件变成字符串 "undefined" |
| B73 | `scripts/agent-launch.mjs:87` | `openSync(logFile, 'a')` 返回的 fd 在父进程中未关闭 |

### LOW — 可在后续迭代中修复

| # | 文件 | 描述 |
|---|------|------|
| B31 | `composables/useApplying/services/chatPrompt.ts:10` | 消息 ID 用 `Date.getTime()` 毫秒内可重复 |
| B32 | `composables/useApplying/index.ts:10` | `cacheManagers` Map 无限增长（用户登录/登出循环） |
| B33 | `pages/zhipin/hooks/useAgentBatchRunner.ts:161` | `startBatch` TOCTOU 竞态 — lock 在 async 内部设置 |
| B34 | `pages/zhipin/hooks/agentReview.ts:16` | `pendingReviews` Map 无最大数量限制 |
| B35 | `pages/zhipin/hooks/usePager.ts:62` | `initPager` 无并发调用保护 |
| B36 | `composables/useWebSocket/protobuf.ts:22` | 同毫秒消息 mid 重复 |
| B37 | `composables/useWebSocket/handler.ts:136` | `protobuf.load()` 传 raw string 可能需要 `protobuf.parse()` |
| B38 | `scripts/agent-orchestrator.mjs:89` | `-h` 映射到 `--host` 而非 `--help`，违反用户预期 |

---

## 当前问题：安全漏洞

### HIGH

| # | 文件 | 描述 |
|---|------|------|
| S1 | `message/background.ts:110-137` | `request` 方法可代理任意 URL + credentials:include — SSRF/开放代理 |
| S2 | `scripts/agent-security.mjs:67` | Token/证书文件写入默认权限 0o644（应为 0o600 仅所有者可读） |
| S3 | `scripts/agent-bridge.mjs:139` | 无请求体大小限制 — 可通过大 body 耗尽内存 |
| S4 | `composables/useApplying/services/filterSteps.ts:253` | 用户输入直接传入 `new RegExp()` — ReDoS |

### MEDIUM

| # | 文件 | 描述 |
|---|------|------|
| S5 | `message/contentScript.ts:124,180` + `message/index.ts:17` | `postMessage(_, '*')` 通配符源，任何 iframe 可截获/注入消息 |
| S6 | `message/index.ts:20-24` | `onMessage` 不验证 `event.origin`，任何页面可注入消息 |
| S7 | `scripts/agent-bridge.mjs:84` | CORS `Access-Control-Allow-Origin: *` 暴露 `/health` 端点 |
| S8 | `utils/safeHtml.ts:76` | sanitizer 允许 `style` 属性，可 CSS 探测数据泄露 |
| S9 | `pages/zhipin/hooks/useAgentMetaQueries.ts:83` | `window.location.href = targetUrl` 未验证协议（javascript: XSS） |
| S10 | `scripts/agent-security.mjs:116` | 自签名证书 `cA: true` 应为 `false`（叶子证书不应标记为 CA） |
| S11 | `utils/amap.ts:56,68` | 地址参数未 URL 编码，可注入查询参数 |
| S12 | `pages/zhipin/services/chatStreamHooks.ts:54-68` | 全局 WebSocket.prototype.send 猴子补丁影响所有 WS 连接 |

### HIGH（第二轮审查新增）

| # | 文件 | 描述 |
|---|------|------|
| S13 | `scripts/agent-bridge.mjs:108-109,597-598` | Bridge token 明文嵌入 relay HTML 响应 + 启动时打印到 stdout（日志泄漏） |
| S14 | `scripts/agent-mcp-server.mjs:1199` | Content-Length 无上限校验，恶意客户端可发巨型 body 耗尽内存（DoS） |

### MEDIUM（第二轮审查新增）

| # | 文件 | 描述 |
|---|------|------|
| S15 | `scripts/agent-bridge.mjs:93-94` | Token 可通过 `?token=` query param 传递——URL 出现在代理日志/浏览器历史中 |
| S16 | `contentScript.ts:179` + `useDeliveryControl.ts:146` | `message` 事件 handler 仅检查 `event.source === window`，未验证 `event.origin` |
| S17 | `useDeliveryControl.ts:133` | `window.__bossHelperAgent = controller` 暴露完整 agent 控制器（start/stop/configUpdate），第三方脚本可调用 |
| S18 | `scripts/agent-bridge.mjs:84` + `background.ts:28` | CORS `*` 通配 + trusted relay 要求 HTTPS 但 localhost 通常使用 HTTP——配置矛盾 |

---

## 当前问题：代码质量 & 架构

### 组件质量问题

1. **超大组件未拆分** — `Service.vue` (646 行)、`Selectllm.vue` (587 行)、`Config.vue` (635 行) 应按职责拆分
2. **全局样式泄漏** — `Selectllm.vue`、`LLMFormItem.vue`、`Logs.vue`、`Ai.vue` 的 `<style>` 未 scoped
3. **Props 变异** — `SalaryRange.vue` 直接修改 props 数组元素
4. **死代码** — `Chat.vue:87` `v-if="false"`、`CreateLLM.vue` 多个 `_` 前缀未使用变量
5. **可访问性缺失** — `Jobcard.vue` 可点击区域无键盘支持/ARIA 标注；`user-select: none` 全局禁止复制
6. **暗色模式残缺** — `App.vue:131` 暗色按钮 disabled 但有 click handler（永不触发）；`About.vue:62` 白色文字在亮色模式下不可见

### 类型系统问题

1. **`boosData.d.ts`** — 文件名拼写错误（应为 bossData）；25+ 处 `any`；接口用 lowerCamelCase（应 PascalCase）
2. **`openapi.d.ts`** — 多处 `Record<string, never>` 应为具体类型；`unknown` 响应类型
3. **`deliverError.ts`** — 类名 `BoosHelperError` 拼写错误（应为 Boss）；13 个子类高度重复可用工厂函数
4. **管线多处 `as any` 强转** — `deliverExecution.ts:97,165,213` 表明 `deliverState` 类型定义有误
5. **`useModel/type.ts:23`** — 抽象类名 `llm` 用小写（应 `Llm` 或 `LLM`）

### 架构/性能问题

1. **`Ui.vue:73-93`** — `boxStyles` computed 在每次鼠标移动时调用 `document.elementFromPoint()` + `getBoundingClientRect()`（极其昂贵）
2. **`utils/amap.ts:64`** — 每次计算发 3 个并行请求，即使部分距离类型已禁用（浪费带宽）
3. **`stores/signedKey.ts:222,267`** — `/v1/llm/model_list` 同一请求被发送两次
4. **`mqtt.ts:63`** — `Uint8Array.from([...fixedHeader, ...variableHeader, ...payload])` 大 payload 时低效
5. **`scripts/agent-bridge.mjs:216`** — 只向第一个 relay 发命令，其余 relay 闲置
6. **`scripts/agent-relay.html:189`** — 日志 DOM 无限增长，长时间运行可耗尽内存
7. **`useVue.ts:188-190`** — 使用已废弃的 `__lookupSetter__`/`__lookupGetter__` API

### 测试覆盖缺口

1. **`goldHunterFilter`** — 导入但从未测试
2. **`shouldStop: () => true`** — batch loop 终止路径未测试
3. **组件级测试** — 现有组件测试较浅，缺少交互/边界测试
4. **并发竞态** — 缓存并发写、batch 双启动等竞态场景无测试
5. **Mock 保真度** — `wxt-imports.ts` mock 的 `onMessage` 缺少 sender/sendResponse 参数
6. **DOMRect 补丁** — vitest.setup.ts 缺少 `top`/`right`/`bottom`/`left` 计算属性

### 测试覆盖缺口（第二轮审查新增）

7. **Vitest 配置缺少 `restoreMocks: true`** — vi.spyOn 跨测试泄漏，需手动 restore
8. **Coverage include 用手动白名单** — 新文件默认不在覆盖范围，应改为 `src/**/*.ts` + excludes
9. **大量核心模块无测试** — `useCommon.ts`、`useChat.ts`、`useStatistics.ts`、`useVue.ts`、`conf/index.ts`、`jobs.ts`（非 mock）、`user.ts`、`signedKey.ts`、`content.ts`、`main-world.ts`、`concurrency.ts`、`retry.ts`、`safeHtml.ts`、`useDeliveryControl.ts`、`useAgentBatchRunner.ts` 均无独立单元测试
10. **`agent-mcp-server.test.ts` 是单个 134 行巨型测试** — 任何断言失败都无法定位具体功能，应拆分
11. **E2E 仅覆盖 happy path** — 无网络错误、限流响应、并发投递、导航中断等异常场景
12. **E2E 端口冲突风险** — `pickAvailablePort` 从 4517 顺序尝试，CI 并行时可能碰撞
13. **E2E 依赖预构建产物** — `.output/chrome-mv3` 过期或缺失时测试错误信息不明确
14. **`chat-stream.test.ts:10`** — 模块级 `WebSocket.prototype.send` 保存/恢复，并行测试时不安全

### Store 设计问题（第二轮审查新增）

1. **3 种不兼容的 Store 模式** — Pinia `defineStore`（agent/signedKey/conf）、纯 composable 模块级状态（user/log）、Class 单例（jobs）。应统一为 Pinia
2. **全局 `window.__q_*` 调试泄漏** — jobs/log/signedKey/user/conf 均挂载到 window，无 dev 环境门控
3. **`stores/signedKey.ts` 多处 fire-and-forget Promise** — `void counter.storageRm(...)` 等调用无 catch，错误静默丢失
4. **`stores/jobs.ts:85-92` 非原子操作** — `syncJobList` 先删所有 key 再添加新 key，中间状态可触发 watcher 看到空 map
5. **`stores/jobs.ts` 公开性修饰符不一致** — `_list`/`_map`/`_use_cache` 无 private 但有 `_` 前缀
6. **`stores/log.tsx` 混合关注点** — store/data 逻辑与 JSX 渲染列定义混在同一文件

---

## Overall Assessment

相比上次 review，项目取得了**显著进展**：SiteAdapter 架构落地、测试体系从 17 增至 23+、覆盖率从 <50% 提至 ~70%、安全基础设施（token/CSP/DOMPurify）到位、文档齐全。Phase 0-5 基本完成，架构清晰度大幅提升。

**第二轮审查新增发现**：在原有 38 bug + 12 安全问题基础上，新增 35 个 bug（B39-B73）和 6 个安全问题（S13-S18），主要集中在：
- Store 层设计不一致与状态管理缺陷（循环依赖、polling 替代 watch、非原子状态更新）
- 组件层 loading 状态泄漏、props 误用、死代码
- 脚本层缺少 null 检查和错误处理
- 测试基础设施配置不足（restoreMocks、coverage 白名单、E2E 仅 happy path）

**当前最大风险**：
1. **已确认的 HIGH 级别 bug（15 个）** — `jobs.ts` map getter 永远返回 undefined、`request.ts` 5 小时超时、`confDelete`/`confRecommend` 不生效、`Selectllm` loading 卡死、`safeHtml` 正则截断、`deepmerge` 原型污染、`signedKey` 硬编码生产 URL
2. **安全漏洞（18 个）** — `background.ts` 开放代理、`postMessage('*')` 通配符、RegExp 注入、token 明文泄漏、agent 控制器全局暴露
3. **Store 架构债务** — 3 种不兼容模式、循环依赖、polling 代替 watch
4. **测试体系** — 大量核心模块无独立测试，覆盖率配置为手动白名单

**Priority**: 先修 HIGH bugs (B1-B10, B39-B43) + 安全漏洞 (S1-S4, S13-S14)，再处理 MEDIUM bugs 和架构改进。

**Verification Commands**:
- `pnpm lint`: Clean
- `pnpm test -- --run`: 23 tests passing
- Coverage: Stmts ~69% / Branches ~51% / Funcs ~71% / Lines ~71%

(Generated via full static analysis of entire codebase, 2026-04-10; updated with second-pass deep review)
