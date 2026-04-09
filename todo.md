# BossHelper 构建计划

> 基于 [review.md](review.md) 生成，按优先级和依赖关系分阶段执行。  
> 当前状态：Lint 0 errors / 23 tests passing / Coverage Stmts ~69% Branches ~51% Funcs ~71% Lines ~71% / v0.4.4
> 总计 Bug: 73 个（B1-B73） | 安全漏洞: 18 个（S1-S18） | 已覆盖 Phase 0-5（完成） + Phase 6-9（进行中）

---

## Phase 0 — 环境治理 & 基线建立

> 目标：清理技术债，统一工具链，确保基线可度量。

- [x] **P0-1** 删除 `bun.lock`，统一到 pnpm 单一包管理器
- [x] **P0-2** 检查 `.github/workflows/main.yml`，移除不存在的 `build:noTsc` 引用，与 `ci.yml` 合并或废弃
- [x] **P0-3** 删除 `src/composables/useWebSocket/bak.ts` 等残留文件
- [x] **P0-4** 配置 Vitest coverage（`v8`），生成基线覆盖率报告，记录当前值（2026-04-08：Stmts 74.07% / Branches 50.72% / Funcs 79.41% / Lines 76.69%）
- [x] **P0-5** 在 package.json 中补充 `pnpm test` 脚本说明（README / copilot-instructions 同步更新）

---

## Phase 1 — 稳定性 & 安全性（高优先级）

> 目标：解决 review 指出的最高风险：DOM 脆弱性、安全漏洞、缺少限流。

### 1.1 DOM 层加固

- [x] **P1-1** `elmGetter.ts` 增强：重试机制 + 可配置超时 + MutationObserver 包装器改进
- [x] **P1-2** 关键选择器注册表：将散落的 CSS 选择器统一收敛到 `src/utils/selectors.ts`，便于站点变更时集中更新
- [x] **P1-3** `useVue` 挂载竞态处理：添加 DOM ready 等待守卫 + 挂载失败重试
- [x] **P1-4** 在 `content.ts` / `main-world.ts` 中增加选择器健康检查，页面结构不匹配时输出明确警告日志

### 1.2 安全加固

- [x] **P1-5** 收窄 `externally_connectable`：限定为 `https://localhost:*` 和 `https://127.0.0.1:*`，拒绝 HTTP（实际使用 Chrome 合法 match pattern：`https://localhost/*` / `https://127.0.0.1/*`）
- [x] **P1-6** Agent bridge 通信签名：在 `scripts/agent-bridge.mjs` 和扩展端加入共享密钥验证（HMAC 或 token）
- [x] **P1-7** AI 响应渲染 XSS 防护：审计所有 `v-html` / `innerHTML` 使用，改用 DOMPurify 或纯文本渲染
- [x] **P1-8** 敏感数据存储审计：API key 迁移到 `session:` 或使用 `chrome.storage.session`，减少持久化存储风险
- [x] **P1-9** WXT manifest 添加 `content_security_policy`，限制 script-src / connect-src

### 1.3 限流 & 容错

- [x] **P1-10** 引入 `p-limit` 或自定义并发控制器，用于 AI 调用和 DOM 批量操作
- [x] **P1-11** AI 调用增加指数退避重试（OpenAI 429 / 5xx / 网络错误）
- [x] **P1-12** `agentBatchLoop.ts` 增加最大循环次数 / 超时硬上限，防止无限循环
- [x] **P1-13** 管线错误处理改进：捕获后记录完整上下文（job ID + 管线步骤 + 原始错误），替代现有的宽泛 catch

---

## Phase 2 — 测试体系（中高优先级）

> 目标：覆盖率从 <50% 提升到 80%+，关键路径 E2E 覆盖。

### 2.1 单元测试扩展

- [x] **P2-1** `useApplying/` 管线测试：每个 handle 的正常/异常/边界路径
- [x] **P2-2** `usePipelineCache.ts` 测试：缓存命中/失效/用户切换场景
- [x] **P2-3** `useModel/` 测试：OpenAI 调用 mock、签名密钥逻辑、错误恢复
- [x] **P2-4** `useWebSocket/` 测试：protobuf 编解码、连接断开重连、消息乱序
- [x] **P2-5** `elmGetter.ts` 测试：jsdom 环境模拟 MutationObserver + 选择器匹配
- [x] **P2-6** `utils/` 工具函数测试：`parse.ts`、`amap.ts`、`deepmerge.ts`、`request.ts`
- [x] **P2-7** `stores/conf/validation.ts` 边界测试：无效 patch、类型不匹配、嵌套合并

### 2.2 组件 & 集成测试

- [x] **P2-8** Vue 组件测试：`Ui.vue`、`Jobcard.vue`、`ConfigLLM.vue` 关键交互路径（vitest + @vue/test-utils）
- [x] **P2-9** 消息层集成测试：模拟 background ↔ content ↔ agent 消息流

### 2.3 E2E 测试

- [x] **P2-10** Playwright E2E 框架搭建：配置 WXT 测试模式 + 测试用 fixture 页面
- [x] **P2-11** 核心 E2E 用例：扩展加载 → 页面注入 → 职位列表解析 → 单个投递流程模拟
- [x] **P2-12** Agent bridge E2E：CLI 命令 → relay → 扩展 → 页面控制器全链路

### 2.4 CI 集成

- [x] **P2-13** 统一 `.github/workflows/ci.yml`：lint → type-check → test → build（所有浏览器）→ coverage 上传
- [x] **P2-14** PR 卡控：coverage 低于阈值或测试失败则 block merge

---

## Phase 3 — 架构重构（中优先级）

> 目标：降低耦合度，为多站点扩展铺路，提升可维护性。

### 3.1 Site Adapter 抽象

- [x] **P3-1** 定义 `SiteAdapter` 接口：`parseJobList()`, `parseJobDetail()`, `applyToJob()`, `navigatePage()`, `getSelectors()`
- [x] **P3-2** 将 `pages/zhipin/` 实现为 `ZhipinAdapter`，抽取纯逻辑到 adapter
- [x] **P3-3** `elmGetter` + 选择器注册表适配：按 adapter 实例注入不同选择器集

### 3.2 管线 & AI 模块化

- [x] **P3-4** 管线步骤拆为独立纯函数/服务，每步可独立测试、可替换
- [x] **P3-5** AI 解析层重构：用 OpenAI structured outputs（function calling / JSON mode）替代正则/启发式 JSON 提取
- [x] **P3-6** 抽取错误恢复策略为独立模块（`src/utils/retry.ts`），统一重试、退避、熔断逻辑

### 3.3 代码整理

- [x] **P3-7** 合并重复的 job mapping utils（散落在 hooks/stores 中的映射函数）
- [x] **P3-8** 拆分超长 hook 文件（>300 LOC）：按职责拆为更小的 composable
- [x] **P3-9** Agent scripts（`scripts/*.mjs`）TypeScript 化或增加 JSDoc 类型注解

---

## Phase 4 — 性能优化（中优先级）

> 目标：降低资源占用，减少被平台检测的风险。

- [x] **P4-1** AI 调用批处理：相似请求合并或使用更轻量模型做初筛
- [x] **P4-2** `usePipelineCache` 增加 TTL 和 LRU 淘汰策略，防止内存膨胀
- [x] **P4-3** 减少 deep clone/merge 频次：用 `structuredClone` 替代 lodash 深拷贝，热路径用 immutable update
- [x] **P4-4** DOM 遍历节流：batch loop 中的 DOM 操作增加 requestAnimationFrame / idle callback 调度
- [x] **P4-5** Token 用量统计：在 `useStatistics` 中追踪每次 AI 调用的 token 消耗，UI 展示累计费用
- [x] **P4-6** Zhipin 请求频率控制：所有对 zhipin.com 的 API/页面请求增加最小间隔

---

## Phase 5 — 文档 & 开发者体验（低优先级）

- [x] **P5-1** 创建 `ARCHITECTURE.md`：系统架构图（agent flow / pipeline / 消息通信层）
- [x] **P5-2** 补充 MCP/bridge 部署文档：protobuf schema、本地服务器要求、环境变量清单
- [x] **P5-3** 关键 hooks 和 composables 补充 JSDoc（仅限状态机 / 复杂控制流）
- [x] **P5-4** README.md 更新：反映当前架构、命令清单、开发流程
- [x] **P5-5** 贡献指南 `CONTRIBUTING.md`：代码规范、PR 流程、测试要求

---

## Phase 6 — 功能增强（按需）

- [ ] **P6-1** Multi-LLM fallback：主模型失败时自动降级到备选模型
- [ ] **P6-2** 模型选择 UI 改进：支持按场景（筛选/评审/打招呼）分别配模型
- [ ] **P6-3** 投递回滚/撤回能力：记录已投递状态，支持标记和导出
- [ ] **P6-4** 管线可视化调试器：UI 中展示每个 job 的管线执行路径和各步骤耗时/结果
- [ ] **P6-5** 多站点适配：基于 Phase 3 adapter 层，新增猎聘（Liepin）适配器作为 PoC
- [x] **P6-6** MCP 深度集成：利用 MCP tools 实现更智能的自主 agent 能力

---

## Phase 7 — Bug 修复（高优先级，本轮审查新增）

> 目标：修复本轮深度审查发现的确认 Bug（review.md 中 B1-B73）。

### 7.1 HIGH 级别 Bug（必须立即修复）

- [ ] **P7-1** `stores/jobs.ts:136` — `this._map.value` 改为 `this._map`（reactive 对象无 `.value`）
- [ ] **P7-2** `utils/request.ts:178` — 修复 timeout 单位：移除多余的 `* 1000`
- [ ] **P7-3** `stores/conf/index.ts:276` — `confDelete` 改用 `{ clone: false }` 或 `Object.assign`
- [ ] **P7-4** `composables/useApplying/utils.ts:147` — `sendPublishReq` 递归需递减 retries 或改用循环
- [ ] **P7-5** `entrypoints/main-world.ts:73-84` — `axiosLoad` 初始化为 no-op `() => {}`
- [ ] **P7-6** `entrypoints/main-world.ts:73` — `axiosLoad` 改为 per-request 模式（Map 或 config 绑定）
- [ ] **P7-7** `composables/useModel/index.ts:47` — computed sort 改为 `[...arr].sort()` 避免原地变异
- [ ] **P7-8** `scripts/agent-mcp-server.mjs:1181` — stdin handler 添加消息队列防止并发交错
- [ ] **P7-9** `composables/useApplying/services/filterSteps.ts:253` — RegExp 前转义用户输入
- [ ] **P7-10** `useWebSocket/type.ts:82` — protobuf 定义补充 `originImage` 字段 (field 3)
- [ ] **P7-39** `components/llms/Selectllm.vue:163-168` — testJobLoading 提前 return 时未重置为 false，UI 永久 loading
- [ ] **P7-40** `utils/safeHtml.ts:96` — htmlToText 正则补上闭合 `>`（`/<br\s*\/?>/gi`）
- [ ] **P7-41** `utils/deepmerge.ts:46` — 增加 `constructor` key 的原型污染防护
- [ ] **P7-42** `stores/signedKey.ts:89-93` — 恢复环境判断逻辑，dev 不应打向生产 URL
- [ ] **P7-43** `stores/conf/index.ts:60-67` — 修复版本迁移循环方向（从低到高遍历）

### 7.2 MEDIUM 级别 Bug

- [ ] **P7-11** `utils/deepmerge.ts:22` — `deepClone` 增加数组处理 `Array.isArray(source) ? source.map(deepClone) : ...`
- [ ] **P7-12** `stores/user.ts:309` — 移除 `replaceAll('undefined', '')`，修复模板渲染根本原因
- [ ] **P7-13** `stores/user.ts:133` — gender 增加 unknown/未设置处理
- [ ] **P7-14** `composables/useApplying/services/aiFiltering.ts:91-96` — 可选链补全 `straight?.distance`
- [ ] **P7-15** `composables/useApplying/services/aiFiltering.ts:113` — AI null content 应拒绝或警告
- [ ] **P7-16** `composables/useStatistics.ts:82` — 修复 fire-and-forget async 竞态
- [ ] **P7-17** `composables/usePipelineCache.ts:44` — 添加 `initialized` promise 等待
- [ ] **P7-18** `composables/useModel/openai.ts:163,189` — `.pop()` 改为 `.at(-1)` 并处理 undefined
- [ ] **P7-19** `composables/useModel/openai.ts:200-202` — 移除死代码 stream 分支
- [ ] **P7-20** `composables/useModel/signedKey.ts:97` — `data.amap ?? ''` 修复 undefined 拼接
- [ ] **P7-21** `utils/concurrency.ts:75` — 使用 `has()` 检查缓存而非依赖值 truthiness
- [ ] **P7-22** `pages/zhipin/services/deliverExecution.ts:205` — 限流间隔增加上限（如 max +15s）
- [ ] **P7-23** `pages/zhipin/hooks/agentEvents.ts:27` — listener 包裹 try/catch 防止事件丢失
- [ ] **P7-24** `components/SalaryRange.vue` — 改用 `defineModel` 替代 props 直接修改
- [ ] **P7-25** `components/SalaryRange.vue:49` — `@Click` 改为 `@click`
- [ ] **P7-26** `pages/zhipin/components/Ui.vue:211` — 改用语义化版本比较或 numeric version
- [ ] **P7-27** `pages/zhipin/components/Ai.vue:88` — `v-key` 改为 `:key`
- [ ] **P7-28** `components/App.vue:70` — 合并重复 `style` 属性
- [ ] **P7-29** `components/CreateLLM.vue:31` — `color16()` 增加 `.padStart(2, '0')`
- [ ] **P7-30** `utils/logger.ts:11-16` — iframe 添加 null 检查 + 考虑移除或清理
- [ ] **P7-44** `stores/user.ts:319` — 可选链改为 `window.Cookie?.get('bst')`
- [ ] **P7-45** `stores/user.ts:320-327` — `getUserResumeData` fetch 添加 try/catch
- [ ] **P7-46** `pages/zhipin/components/Ui.vue:266` — `Alertdata-help` 改为 `data-help`
- [ ] **P7-47** `message/background.ts:169` — `tab.id!` 改为 `tab.id ?? -1` 或提前过滤
- [ ] **P7-48** `composables/useApplying/services/amapStep.ts:35` — 补全 `card?.jobInfo?.address` 可选链
- [ ] **P7-49** `composables/useApplying/utils.ts:240-246` — rangeMatch 注释与代码逻辑对齐
- [ ] **P7-50** `composables/useStatistics.ts:48` — date 改为 getter 或每次 update 时重新获取
- [ ] **P7-51** `composables/useModel/index.ts:72` — init() 改 `push` 为赋值，防 HMR 重复
- [ ] **P7-52** `stores/conf/index.ts:251-273` — confRecommend 补充 `{ clone: false }`
- [ ] **P7-53** `utils/elmGetter.ts:135-184` — timeoutMs=0 时添加默认超时或文档说明
- [ ] **P7-54** `components/llms/Selectllm.vue:373` — 移除 ElForm 上的无效 v-model
- [ ] **P7-55** `components/form/FormSelect.vue:5` — defineModel 改为 defineProps
- [ ] **P7-56** `pages/zhipin/components/Card.vue:17` — 移除废弃 wheelDelta，统一用 deltaY
- [ ] **P7-57** `stores/user.ts ↔ stores/conf/index.ts` — 解除循环依赖（提取公共依赖或延迟导入）
- [ ] **P7-58** `stores/jobs.ts:61-68` — loadJobDetail 改用 Vue watch 替代 setInterval 轮询
- [ ] **P7-59** `stores/user.ts:87-101` — initUser 改用 Vue watch 替代 setInterval 轮询
- [ ] **P7-60** `stores/log.tsx:230` — query() 优化为倒序索引或缓存结果

### 7.3 LOW 级别 Bug

- [ ] **P7-31** `chatPrompt.ts:10` — 消息 ID 改用 `crypto.randomUUID()` 或计数器
- [ ] **P7-32** `useApplying/index.ts:10` — `cacheManagers` 添加 LRU/WeakRef 淘汰策略
- [ ] **P7-33** `useAgentBatchRunner.ts:161` — `startBatch` 在 async 前设置同步锁防 TOCTOU
- [ ] **P7-34** `agentReview.ts:16` — `pendingReviews` 添加最大数量限制
- [ ] **P7-35** `usePager.ts:62` — `initPager` 添加并发调用保护
- [ ] **P7-36** `protobuf.ts:22` — 消息 ID 增加计数器避免同毫秒重复
- [ ] **P7-37** `handler.ts:136` — 验证 `protobuf.load()` vs `protobuf.parse()` 用法
- [ ] **P7-38** `agent-orchestrator.mjs:89` — `-h` 改为映射 `--help`
- [ ] **P7-61** `utils/selectors.ts:49` — `boss-helper-job-warp` 改为 `boss-helper-job-wrap`
- [ ] **P7-62** `components/llms/ConfigLLM.vue:39,63,67` — timestamp key 改用 `crypto.randomUUID()`
- [ ] **P7-63** `utils/index.ts:50` — delayLoadId 改为 per-call 隔离或文档标注共享行为
- [ ] **P7-64** `utils/parse.ts:25-27` — 移除 `window.__q_parseGptJson` 全局挂载或加 dev 门控
- [ ] **P7-65** `utils/logger.ts:87-88` — group/groupEnd 添加 `.bind(cleanConsole)`
- [ ] **P7-66** `components/conf/Log.vue + Store.vue` — 补充实际功能或标记为 WIP，统一按钮语言
- [ ] **P7-67** `useWebSocket/protobuf.ts:54-56` — 移除未使用的 `toArrayBuffer()` 死代码
- [ ] **P7-68** `useWebSocket/protobuf.ts:22` — 魔法数字 `68256432452609` 添加注释说明
- [ ] **P7-69** `useApplying/services/filterSteps.ts:253` — RegExp 预编译移到步骤创建时
- [ ] **P7-70** `scripts/agent-cli.mjs:66` — JSON.parse 添加 try/catch + 友好错误提示
- [ ] **P7-71** `scripts/agent-orchestrator.mjs:300,499` — 添加 null 检查
- [ ] **P7-72** `scripts/agent-launch.mjs:100` — child.pid undefined 时报错而非写入文件
- [ ] **P7-73** `scripts/agent-launch.mjs:87` — 父进程关闭 logFd 文件描述符

---

## Phase 8 — 安全加固（高优先级，本轮审查新增）

> 目标：修复本轮审查发现的安全漏洞（review.md 中 S1-S18）。

### 8.1 HIGH 级别安全

- [ ] **P8-1** `message/background.ts:110-137` — `request` 方法添加 URL 白名单，禁止任意 URL 代理
- [ ] **P8-2** `scripts/agent-security.mjs:67` — Token/证书文件写入权限改为 `0o600`
- [ ] **P8-3** `scripts/agent-bridge.mjs:139` — 添加请求体大小限制（如 1MB）
- [ ] **P8-4** `filterSteps.ts:253` — RegExp 输入转义（同 P7-9）
- [ ] **P8-13** `scripts/agent-bridge.mjs:108-109,597-598` — Token 不嵌入 relay HTML，启动日志不打印明文 token
- [ ] **P8-14** `scripts/agent-mcp-server.mjs:1199` — Content-Length 添加上限校验（如 10MB），超限拒绝

### 8.2 MEDIUM 级别安全

- [ ] **P8-5** `message/contentScript.ts:124,180` + `message/index.ts:17` — `postMessage` 改用 `location.origin` 替代 `'*'`
- [ ] **P8-6** `message/index.ts:20-24` — `onMessage` 添加 `event.origin` 验证
- [ ] **P8-7** `scripts/agent-bridge.mjs:84` — CORS 限制为 `http://localhost:*` 和 `https://localhost:*`
- [ ] **P8-8** `utils/safeHtml.ts:76` — sanitizer 移除 `style` 属性或添加 CSS 白名单
- [ ] **P8-9** `useAgentMetaQueries.ts:83` — 导航前验证 `targetUrl` 协议（仅允许 http/https）
- [ ] **P8-10** `scripts/agent-security.mjs:116` — 自签名证书 `cA: true` 改为 `false`
- [ ] **P8-11** `utils/amap.ts:56,68` — 地址参数使用 `encodeURIComponent()`
- [ ] **P8-12** `chatStreamHooks.ts:54-68` — 按 URL 模式过滤 WebSocket 而非全局猴子补丁
- [ ] **P8-15** `scripts/agent-bridge.mjs:93-94` — 移除 query param token 支持，仅保留 header 认证
- [ ] **P8-16** `contentScript.ts:179` + `useDeliveryControl.ts:146` — message handler 添加 `event.origin` 验证
- [ ] **P8-17** `useDeliveryControl.ts:133` — `window.__bossHelperAgent` 改为 dev-only 或使用 Symbol key
- [ ] **P8-18** `background.ts:28` — trusted relay 协议匹配改为同时支持 http/https localhost

---

## Phase 9 — 代码质量改进（中优先级，本轮审查新增）

> 目标：修复代码质量问题，提升可维护性。

### 9.1 组件质量

- [ ] **P9-1** 拆分超大组件：`Service.vue` (646行) → 支付/密钥/AI配置分离
- [ ] **P9-2** 拆分 `Selectllm.vue` (587行) → 测试对话框独立组件
- [ ] **P9-3** 拆分 `Config.vue` (635行) → 按配置类别拆分
- [ ] **P9-4** 修复全局样式泄漏：`Selectllm.vue`、`LLMFormItem.vue`、`Logs.vue`、`Ai.vue` 改用 scoped + `:deep()`
- [ ] **P9-5** 修复 `Chat.vue:87` 死代码 `v-if="false"`
- [ ] **P9-6** 修复 `CreateLLM.vue` 未使用的 `_` 前缀变量
- [ ] **P9-7** 修复 `Jobcard.vue` 可访问性：添加 `tabindex`、`role="button"`、键盘事件
- [ ] **P9-8** 修复 `App.vue:131` 暗色模式 disabled 按钮 + `About.vue:62` 亮色模式白色文字

### 9.2 类型系统

- [ ] **P9-9** 重命名 `boosData.d.ts` → `bossData.d.ts`，接口改为 PascalCase
- [ ] **P9-10** 减少 `boosData.d.ts` 中 `any` 使用（25+ 处），改用具体类型或 `unknown`
- [ ] **P9-11** 修复 `openapi.d.ts` 中 `Record<string, never>` 为具体类型
- [ ] **P9-12** 修复 `deliverError.ts` 类名 `BoosHelperError` → `BossHelperError`（全代码库）
- [ ] **P9-13** 修复 `deliverExecution.ts:97,165,213` 的 `as any` 强转，修正 `deliverState` 类型
- [ ] **P9-14** 修复 `useModel/type.ts:23` 类名 `llm` → `LLM`

### 9.3 架构/性能

- [ ] **P9-15** 优化 `Ui.vue:73-93` `boxStyles` computed：节流鼠标移动事件
- [ ] **P9-16** 优化 `utils/amap.ts:64`：按配置禁用类型跳过对应请求
- [ ] **P9-17** 修复 `stores/signedKey.ts:222,267` 重复请求 `/v1/llm/model_list`
- [ ] **P9-18** 优化 `mqtt.ts:63` Uint8Array 拼接：使用 `.set()` 替代 spread
- [ ] **P9-19** 修复 `agent-bridge.mjs:216` 多 relay 支持（轮询或最新连接）
- [ ] **P9-20** 限制 `agent-relay.html:189` 日志 DOM 最大行数
- [ ] **P9-21** 替换 `useVue.ts:188-190` 废弃 `__lookupSetter__` 为 `Object.getOwnPropertyDescriptor`

### 9.4 测试覆盖

- [ ] **P9-22** 补充 `goldHunterFilter` 测试
- [ ] **P9-23** 补充 `shouldStop: () => true` batch loop 终止路径测试
- [ ] **P9-24** 增强组件测试交互/边界场景
- [ ] **P9-25** 补充缓存并发写、batch 双启动竞态测试
- [ ] **P9-26** 增强 `wxt-imports.ts` mock 保真度（sender/sendResponse）
- [ ] **P9-27** 补充 `vitest.setup.ts` DOMRect `top`/`right`/`bottom`/`left` 属性

### 9.5 测试基础设施（第二轮审查新增）

- [ ] **P9-28** vitest.config.ts 添加 `restoreMocks: true`，防止 spy 跨测试泄漏
- [ ] **P9-29** Coverage include 改为 `src/**/*.ts` + excludes，替代手动白名单
- [ ] **P9-30** 拆分 `agent-mcp-server.test.ts` 巨型测试为独立 test case
- [ ] **P9-31** `chat-stream.test.ts` WebSocket.prototype.send 改用 afterEach 恢复，防并行泄漏
- [ ] **P9-32** 补充核心模块独立单元测试：`useCommon.ts`、`useChat.ts`、`useStatistics.ts`、`conf/index.ts`、`jobs.ts`、`user.ts`、`signedKey.ts`、`concurrency.ts`、`safeHtml.ts`、`useDeliveryControl.ts`
- [ ] **P9-33** E2E 补充异常场景：网络错误、限流响应、导航中断
- [ ] **P9-34** E2E `pickAvailablePort` 改用随机端口或锁机制防冲突
- [ ] **P9-35** E2E 添加构建产物新鲜度检查或自动构建步骤

### 9.6 Store 架构统一（第二轮审查新增）

- [ ] **P9-36** `stores/jobs.ts` 从 Class 单例改为 Pinia `defineStore`
- [ ] **P9-37** `stores/user.ts` 从纯 composable 改为 Pinia `defineStore`
- [ ] **P9-38** `stores/log.tsx` 从模块级状态改为 Pinia `defineStore`，JSX 列定义分离
- [ ] **P9-39** 全局 `window.__q_*` 调试挂载添加 `import.meta.env.DEV` 门控
- [ ] **P9-40** `stores/signedKey.ts` fire-and-forget Promise 添加 `.catch()` 错误处理
- [ ] **P9-41** `stores/jobs.ts:85-92` `syncJobList` 改为原子操作（一次性替换而非先删后加）

---

## 里程碑

| 里程碑 | 包含 Phase | 核心交付物 | 验收标准 |
|--------|-----------|-----------|---------|
| **M0 - 基线就绪** | Phase 0 | 干净工具链 + 覆盖率基线 | 无冗余文件，CI 可运行，覆盖率已记录 |
| **M1 - 稳定可靠** | Phase 1 | DOM 加固 + 安全修复 + 限流 | 选择器集中管理，bridge 签名，无 XSS，batch 有硬上限 |
| **M2 - 质量保障** | Phase 2 | 测试覆盖 80%+ + CI 卡控 | 所有 composables 有测试，E2E 核心链路通过，PR 自动检查 |
| **M3 - 架构升级** | Phase 3 | Adapter 层 + 管线纯函数化 | Zhipin 完全通过 adapter 接口工作，管线步骤可独立测试 |
| **M4 - 性能达标** | Phase 4 | 资源优化 + 费用可视 | Token 消耗可追踪，内存无膨胀，请求有频率控制 |
| **M5 - 文档完善** | Phase 5 | 架构文档 + 开发者指南 | README 准确，新开发者可自助上手 |
| **M6 - 功能扩展** | Phase 6 | 多模型/多站点/可视化 | 至少一个备选模型可 fallback，管线可视化可用 |
| **M7 - Bug 清零** | Phase 7 | 73 个确认 Bug 全部修复 | 所有 HIGH/MEDIUM bug 修复，LOW bug 有跟踪 |
| **M8 - 安全加固** | Phase 8 | 18 个安全漏洞修复 | 无 HIGH 级别安全漏洞，postMessage/CORS/代理/token 受限 |
| **M9 - 质量提升** | Phase 9 | 代码质量 + Store 统一 + 测试基础设施 | Store 统一 Pinia，样式 scoped，覆盖率配置自动化，核心模块有独立测试 |

---

## 执行原则

1. **Phase 0 → 1 → 2 严格按序**，后续 Phase 可交叉并行
2. 每个任务完成后运行 `pnpm lint && pnpm check && pnpm test -- --run` 验证
3. 安全相关改动（P1-5 ~ P1-9, P8）需单独 PR，附安全审计说明
4. 重构任务（Phase 3, Phase 9）采用"先加测试、再重构"模式，确保行为不变
5. 功能增强（Phase 6）根据用户反馈优先级动态排序
6. **Phase 7 (Bug 修复) 优先于 Phase 8 (安全) 和 Phase 9 (质量)**，HIGH 级别 bug 应最先修复
7. Phase 7-9 为深度审查新增（含两轮审查），应尽快纳入开发计划
8. 第二轮审查新增项（P7-39~P7-73, P8-13~P8-18, P9-28~P9-41）与原有项保持同优先级处理