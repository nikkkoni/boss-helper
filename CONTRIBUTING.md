# Contributing to Boss Helper

感谢你对 Boss Helper 的改进兴趣。

这份指南聚焦 4 件事：开发环境、代码约束、验证要求、PR 流程。

## 开始之前

请先确认：

- 使用 Node.js 20.x 和 pnpm 9.x
- 本地可以加载 Chromium 扩展，便于验证 relay / agent 链路
- 不提交本地生成文件、token、证书或其他敏感信息

默认会生成但不应提交的文件包括：

- `.boss-helper-agent-token`
- `.boss-helper-agent-cert.json`
- `.boss-helper-agent-bridge.log`
- `.boss-helper-agent-bridge.pid`
- `.env*`

## 仓库结构约定

改代码前，建议先确认变更应该落在哪一层：

- `src/entrypoints/`：扩展入口，包含 background / content / main-world
- `src/pages/zhipin/`：站点页面逻辑、UI、agent 控制器、批处理 hooks
- `src/site-adapters/`：站点差异抽象层
- `src/composables/useApplying/`：投递管线、过滤、AI、招呼语、缓存编排
- `src/message/`：跨上下文消息协议和类型
- `scripts/`：bridge、CLI、MCP、orchestrator、本地运维脚本

优先沿用现有边界，不要为相同职责再新增平行实现。

## 代码规范

### 1. 保持改动小而集中

- 优先修改现有函数和模块，避免无必要的新抽象
- 新逻辑如果明显属于已有 adapter / hook / service，就放回原位置
- 不要为了“以后可能会用”而提前加兼容层

### 2. 站点相关逻辑不要散落

- DOM 选择器优先集中在 `src/utils/selectors.ts`
- 站点特有解析和翻页逻辑优先走 `SiteAdapter`
- 不要把新的 Zhipin 分支判断塞回通用消息层或 bridge 层

### 3. 协议改动要同步更新文档

如果修改了这些内容，必须同步更新对应文档：

- `src/message/agent.ts` 中的命令、payload 或事件类型
- `scripts/agent-bridge.mjs` 的接口行为
- `scripts/agent-mcp-server.mjs` 的 tool 定义
- `src/assets/chat.proto` 或聊天 protobuf runtime schema

相关文档入口：

- `README.md`
- `docs/architecture-analysis.md`
- `docs/bridge-mcp-deployment.md`
- `docs/llm-agent-mcp.md`

### 4. 复杂控制流需要可读性

以下类型的修改建议补充测试、JSDoc 或简短说明：

- 批量投递状态机
- Agent 命令桥接
- 外部 AI 审核闭环
- 投递 pipeline 编译和执行
- 聊天 protobuf 编解码

## 本地开发

安装依赖：

```bash
pnpm install
```

启动扩展开发模式：

```bash
pnpm dev
pnpm dev:edge
pnpm dev:firefox
```

构建本地加载包：

```bash
pnpm build:chrome
pnpm build:firefox
pnpm build:edge
```

## 验证要求

### 最小验证集

所有代码改动提交前，至少执行：

```bash
pnpm lint && pnpm check && pnpm test -- --run
```

### 按改动类型追加验证

| 改动类型 | 额外建议验证 |
| --- | --- |
| 选择器 / adapter / DOM 自动化 | `pnpm build:chrome`，并在 Boss 页面手工验证 |
| bridge / relay / MCP / CLI | `pnpm agent:doctor`、`pnpm agent:cli -- status` |
| 扩展生命周期 / 浏览器集成 | `pnpm test:e2e` |
| 覆盖率敏感重构 | `pnpm test:coverage` |
| 构建或发布链路 | `pnpm build` 或至少相关浏览器的 build 命令 |

### 手工验证建议

如果改动涉及真实页面交互，建议至少覆盖：

1. 打开 Boss 支持页面并确认插件挂载成功。
2. 检查日志面板是否有新增错误或警告。
3. 对受影响命令跑一次最短链路。
4. 如果改了 agent 相关逻辑，确认 relay 页面可以连上扩展。

## Pull Request 流程

1. 从最新 `main` 或 `master` 拉出独立分支。
2. 保持 PR 聚焦单一主题，不要把无关重构和文档混在一起。
3. 在 PR 描述中说明：变更目的、风险点、验证命令、手工验证结果。
4. 如果 UI、relay 页面或交互行为有变化，补充截图或日志片段。
5. 等 CI 通过后再请求 review。

## PR 自查清单

发起 PR 前，请自查：

- 变更是否放在正确层级
- 是否复用了现有 adapter / hook / service
- 是否补了必要测试或文档
- 是否运行了最小验证集
- 是否误提交了 token、证书、日志、构建产物
- 如果改了命令或事件协议，README / docs / MCP tool 是否同步

## 安全相关改动

如果你修改了以下内容，请在 PR 描述中单独写出安全影响：

- `externally_connectable`
- bridge token 校验
- localhost 证书 / relay 访问策略
- CSP
- 敏感信息存储位置

这类改动需要让 reviewer 明确知道：暴露面变大了还是变小了，默认配置是否仍然安全。
