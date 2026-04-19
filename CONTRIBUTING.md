# Contributing to Boss Helper

本文档只针对当前仓库，不沿用上游仓库的 README、商店地址或提交流程。

## 开发环境

- Node.js `20.19.0`
- pnpm `9.x`
- Chromium 浏览器，用于本地验证 relay / agent / MCP 链路

默认不应提交的本地文件：

- `.boss-helper-agent-token`
- `.boss-helper-agent-cert.json`
- `.boss-helper-agent-bridge.log`
- `.boss-helper-agent-bridge.pid`
- `.env*`
- `.output/`

## 代码落点

改动前先确认职责边界，不要把站点逻辑、桥接逻辑和文档说明混在一起。

| 位置 | 职责 |
| --- | --- |
| `src/utils/selectors.ts` | Boss 页面路由识别和选择器注册表 |
| `src/site-adapters/zhipin/adapter.ts` | Zhipin 站点适配与路由构造 |
| `src/pages/zhipin/hooks/` | 批处理控制、页面查询、agent controller |
| `src/composables/useApplying/services/` | 投递 pipeline、过滤与 AI |
| `src/message/` | 跨上下文消息协议与命令模型 |
| `scripts/` | bridge、CLI、MCP、orchestrator、本地运维脚本 |
| `docs/` | 面向当前仓库的说明文档 |

## 本地开发

安装依赖：

```bash
pnpm install
```

开发模式：

```bash
pnpm dev
pnpm dev:edge
pnpm dev:firefox
```

构建：

```bash
pnpm build:chrome
pnpm build:firefox
pnpm build:edge
```

## 验证要求

### 纯文档改动

至少自查：

- 命令是否与 `package.json` 一致
- 文件路径是否真实存在
- 仓库链接、Issue 链接、安装方式是否指向当前仓库

### 代码改动最小验证集

```bash
pnpm lint && pnpm check && pnpm test -- --run
```

### 按改动类型追加验证

| 改动类型 | 追加验证 |
| --- | --- |
| 选择器 / DOM 自动化 / adapter | `pnpm build:chrome`，并在 Boss 页面手工验证 |
| bridge / relay / MCP / CLI | `pnpm agent:doctor`、`pnpm agent:cli status` |
| 扩展生命周期或跨上下文通信 | `pnpm test:e2e` |
| 覆盖率敏感重构 | `pnpm test:coverage` |
| 多浏览器构建链路 | `pnpm build` |

## 文档同步要求

如果修改了命令、payload、事件、bridge 端点、MCP tools 或数据处理边界，必须同步更新对应文档：

- `README.md`
- `docs/architecture-analysis.md`
- `docs/bridge-mcp-deployment.md`
- `docs/llm-agent-mcp.md`
- `PRIVACY.md`

## Pull Request 建议

1. 从最新 `main` 拉出独立分支。
2. 一个 PR 聚焦一个主题，不要把协议修改、重构和无关格式化混在一起。
3. PR 描述中说明变更目的、风险点、验证命令和手工验证结果。
4. 如果改了 UI、relay 页面或交互流程，附截图或日志片段。
5. 等 CI 通过后再请求 review。

## PR 自查清单

- 改动是否落在正确层级
- 是否复用了现有 adapter / hook / service
- 是否同步更新了 README 和相关 docs
- 是否运行了必要验证
- 是否误提交了 token、证书、日志、构建产物或 `.env`

## 安全相关修改

如果你改动了以下内容，请在 PR 描述中单独说明安全影响：

- `externally_connectable`
- bridge token 校验
- localhost 证书 / relay 访问策略
- CSP
- Cookie、密钥或其他敏感信息的本地存储方式
