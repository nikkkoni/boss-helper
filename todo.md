# BossHelper 构建计划

> 基于 [review.md](review.md) 生成，按优先级和依赖关系分阶段执行。  
> 当前状态：Lint 0 errors / 23 tests passing / Coverage Stmts 68.75% Branches 50.64% Funcs 70.90% Lines 70.76% / v0.4.4

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

- [ ] **P3-1** 定义 `SiteAdapter` 接口：`parseJobList()`, `parseJobDetail()`, `applyToJob()`, `navigatePage()`, `getSelectors()`
- [ ] **P3-2** 将 `pages/zhipin/` 实现为 `ZhipinAdapter`，抽取纯逻辑到 adapter
- [ ] **P3-3** `elmGetter` + 选择器注册表适配：按 adapter 实例注入不同选择器集

### 3.2 管线 & AI 模块化

- [ ] **P3-4** 管线步骤拆为独立纯函数/服务，每步可独立测试、可替换
- [ ] **P3-5** AI 解析层重构：用 OpenAI structured outputs（function calling / JSON mode）替代正则/启发式 JSON 提取
- [ ] **P3-6** 抽取错误恢复策略为独立模块（`src/utils/retry.ts`），统一重试、退避、熔断逻辑

### 3.3 代码整理

- [ ] **P3-7** 合并重复的 job mapping utils（散落在 hooks/stores 中的映射函数）
- [ ] **P3-8** 拆分超长 hook 文件（>300 LOC）：按职责拆为更小的 composable
- [ ] **P3-9** Agent scripts（`scripts/*.mjs`）TypeScript 化或增加 JSDoc 类型注解

---

## Phase 4 — 性能优化（中优先级）

> 目标：降低资源占用，减少被平台检测的风险。

- [ ] **P4-1** AI 调用批处理：相似请求合并或使用更轻量模型做初筛
- [ ] **P4-2** `usePipelineCache` 增加 TTL 和 LRU 淘汰策略，防止内存膨胀
- [ ] **P4-3** 减少 deep clone/merge 频次：用 `structuredClone` 替代 lodash 深拷贝，热路径用 immutable update
- [ ] **P4-4** DOM 遍历节流：batch loop 中的 DOM 操作增加 requestAnimationFrame / idle callback 调度
- [ ] **P4-5** Token 用量统计：在 `useStatistics` 中追踪每次 AI 调用的 token 消耗，UI 展示累计费用
- [ ] **P4-6** Zhipin 请求频率控制：所有对 zhipin.com 的 API/页面请求增加最小间隔

---

## Phase 5 — 文档 & 开发者体验（低优先级）

- [ ] **P5-1** 创建 `ARCHITECTURE.md`：系统架构图（agent flow / pipeline / 消息通信层）
- [ ] **P5-2** 补充 MCP/bridge 部署文档：protobuf schema、本地服务器要求、环境变量清单
- [ ] **P5-3** 关键 hooks 和 composables 补充 JSDoc（仅限状态机 / 复杂控制流）
- [ ] **P5-4** README.md 更新：反映当前架构、命令清单、开发流程
- [ ] **P5-5** 贡献指南 `CONTRIBUTING.md`：代码规范、PR 流程、测试要求

---

## Phase 6 — 功能增强（按需）

- [ ] **P6-1** Multi-LLM fallback：主模型失败时自动降级到备选模型
- [ ] **P6-2** 模型选择 UI 改进：支持按场景（筛选/评审/打招呼）分别配模型
- [ ] **P6-3** 投递回滚/撤回能力：记录已投递状态，支持标记和导出
- [ ] **P6-4** 管线可视化调试器：UI 中展示每个 job 的管线执行路径和各步骤耗时/结果
- [ ] **P6-5** 多站点适配：基于 Phase 3 adapter 层，新增猎聘（Liepin）适配器作为 PoC
- [ ] **P6-6** MCP 深度集成：利用 MCP tools 实现更智能的自主 agent 能力

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

---

## 执行原则

1. **Phase 0 → 1 → 2 严格按序**，后续 Phase 可交叉并行
2. 每个任务完成后运行 `pnpm lint && pnpm check && pnpm test -- --run` 验证
3. 安全相关改动（P1-5 ~ P1-9）需单独 PR，附安全审计说明
4. 重构任务（Phase 3）采用"先加测试、再重构"模式，确保行为不变
5. 功能增强（Phase 6）根据用户反馈优先级动态排序
