# Security Remediation Progress

## Goal

修复仓库审查中发现的高风险页面桥接漏洞、敏感日志泄漏点和历史流式逻辑残留，确保：

1. 页面脚本不能直接调用扩展内部控制器或 RPC 通道。
2. 敏感配置、Cookie、请求头不会被常规调试日志直接打印。
3. AI 流式请求相关逻辑已删除，不保留伪功能或失效配置。
4. 相关测试与文档能反映当前真实状态。

## Findings Being Addressed

1. 公开 `window.postMessage` bridge 可被同页脚本滥用。
2. `comctx` 通道同样暴露给同页脚本。
3. 若桥接被滥用，`config.get` / storage / cookie / background request 风险被放大。
4. 背景请求、账号切换、模型配置测试存在敏感日志输出。
5. AI `stream` 分支之前没有真正消费 SSE，且与后台代理能力不一致。

## Current Status

### Done

1. 新增私有 bridge 基础设施：`src/message/window.ts`
2. 主世界 / content script 通信从公开 `window message` 切换到私有 bridge 事件总线。
3. `agentWindowBridge` 已改为通过私有 bridge 收发请求与事件。
4. `comctx` 的注入侧 / 提供侧适配器已迁移到私有 bridge。
5. `content` 入口会创建私有 bridge，并把 `main-world.js` 注入到 closed shadow root 中。
6. `main-world` 启动时会主动绑定当前私有 bridge。
7. 已移除一批直接输出敏感对象的日志：cookie 切换、后台请求参数、模型配置明文。
8. 已移除 AI 流式请求与后台代理相关代码，不再暴露流式配置或伪流式分支。

### In Progress

1. 评估是否需要对 `config.get` 做额外脱敏，而不是只依赖私有 bridge 隔离。

### Pending

1. 如有必要，补充 README / bridge 文档中的实现说明。

## Implementation Notes

1. 当前策略不是继续给公开 `window.postMessage` 打补丁，而是直接移除公开信道。
2. 私有 bridge 依赖 content script 创建的 closed shadow root；主世界脚本在该 root 内执行，并通过桥接节点派发自定义事件。
3. 这样页面脚本无法查询节点、无法注册监听器、也无法注入同一信道消息。
4. 对测试环境，使用显式 test harness 注入 bridge target，避免单测依赖真实浏览器注入链。

## Risks / Follow-up

1. `config.get` 当前行为未变，主要依赖私有 bridge 做隔离；如果后续要进一步降低外部接口泄露面，可以追加只读脱敏层。
2. `injectScript` 方案依赖 WXT 现有的 `modifyScript` 先于 append 执行；本轮已按当前实现落地，但仍建议通过集成测试持续覆盖。
3. 旧测试大量默认假设 `window.postMessage`，本轮需要统一迁移到私有 bridge harness。

## Verification Log

1. `pnpm check`
   - 已通过。
2. 其余验证
   - `pnpm test -- --run` 已通过，82 个文件 / 376 个测试全部通过。
   - `pnpm build:chrome` 已通过。
   - `pnpm lint` 仍为通过状态，但保留仓库既有 4 个 warning，未新增 lint error。
