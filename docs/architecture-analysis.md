# Boss Helper Architecture

本文档描述当前仓库的系统分层、关键模块和修改边界，默认以 `main` 分支代码为准。

## 项目概览

Boss Helper 是一个运行在 Boss 直聘网页端的浏览器扩展，并配套提供本地 companion 自动化链路。

能力分成两层：

- 页面内能力：职位读取、筛选、投递、统计、日志
- 页面外能力：bridge、relay、CLI、MCP、外部 Agent 编排

当前仓库只实现 `zhipin.com` 站点适配。

## 支持路由

- `/web/geek/job`
- `/web/geek/job-recommend`
- `/web/geek/jobs`

与路由和 DOM 结构强相关的判断，统一收敛在：

- `src/utils/selectors.ts`
- `src/site-adapters/zhipin/adapter.ts`

## 总体链路

```text
外部调用方
  -> agent bridge (HTTP / HTTPS / SSE)
  -> relay page
  -> extension background
  -> content script
  -> main-world
  -> page controller
  -> applying pipeline / SiteAdapter
  -> Boss 页面 DOM 与投递接口
```

## 关键入口

| 路径 | 作用 |
| --- | --- |
| `src/entrypoints/background.ts` | 校验 relay 来源与 token，查找目标 Boss tab，并转发外部命令 |
| `src/entrypoints/content.ts` | 注入 `main-world.js`，桥接 background 与页面上下文 |
| `src/entrypoints/main-world.ts` | 选择站点 adapter，挂载 Vue UI，初始化页面模块 |
| `src/pages/zhipin/hooks/useDeliveryControl.ts` | 页面侧控制器装配层，统一注册 agent command bridge |
| `src/pages/zhipin/hooks/agentController.ts` | 页面命令分发中心 |
| `src/site-adapters/zhipin/adapter.ts` | Zhipin 页面适配、搜索页导航和页面能力差异处理 |
| `src/composables/useApplying/services/pipelineFactory.ts` | 默认投递 pipeline 组装 |
| `scripts/agent-bootstrap.mjs` | `agent:start` / `agent:bootstrap` 的轻量自举入口，负责 bridge、扩展构建，并尝试打开 relay 与 Boss 页 |
| `scripts/agent-bridge.mjs` | 本地 bridge，暴露 HTTP / HTTPS / SSE 接口 |
| `scripts/agent-stop.mjs` | 按 pid 文件安全关闭本地 bridge |
| `scripts/agent-launch.mjs` | 更低层的 bridge + relay 拉起助手，供 bootstrap 复用 |
| `scripts/agent-relay.html` | relay 页面，负责命令转发与事件回传 |
| `scripts/agent-mcp-server.mjs` | MCP server 入口，实际启动 `scripts/mcp/server.mjs` |

## 浏览器扩展分层

### Background

`background.ts` 负责：

- 校验外部 relay 页面来源和 bridge token
- 查找支持的 Boss 标签页
- 接收 relay 的 `sendMessage` / `connect`
- 广播页面侧事件给 relay
- 提供部分浏览器能力代理，例如 cookies、notifications、storage

### Content Script

`content.ts` 运行在隔离世界，负责：

- 把 `main-world.js` 注入真实页面上下文
- 转发页面与 background 之间的 agent 消息
- 提供 `window.postMessage` 桥接
- 为页面提供统一的存储和 background 代理入口

### Main World

`main-world.ts` 运行在页面真实 JS 上下文，负责：

- 识别当前站点和路由
- 挂载扩展 UI
- 初始化页面模块和 hooks
- 接入宿主页面数据和路由

## 页面控制层

页面控制层主要位于 `src/pages/zhipin/hooks/`，分为三类职责：

- 批处理控制：`useAgentBatchRunner`、`agentBatchLoop.ts`、`useAgentBatchState.ts`
- 查询命令：`useAgentJobQueries.ts`、`useAgentMetaQueries.ts`
- 桥接和分发：`agentController.ts`、`agentWindowBridge.ts`、`useDeliveryControl.ts`

这层直接决定外部命令 `start`、`pause`、`resume`、`jobs.*`、`config.*`、`readiness.get`、`plan.preview` 等如何落到当前页面。

## SiteAdapter 与选择器边界

当前仓库只实现 `ZhipinAdapter`，但仍保留了站点抽象层。

### 适配层负责

- 路由识别与导航 URL 构造
- 列表页、推荐页、经典页的差异收敛
- 页面是否可操作、是否应装载某个 page module

### 选择器层负责

- 不同路由下的根容器、搜索栏、详情卡、分页器等 DOM 入口
- 受支持页面判断与 selector 健康检查

### 修改边界

当 Boss 页面 DOM 或路由变化时，优先修改：

- `src/utils/selectors.ts`
- `src/site-adapters/zhipin/adapter.ts`

不要把 Zhipin 特有逻辑塞进 `src/message/` 或 `scripts/`。

## Applying Pipeline

投递主流程在 `src/composables/useApplying/`。

默认 pipeline 大致分成两段：

1. 前置筛选
2. 投递后的附加动作

前置筛选会按“便宜判断优先、昂贵判断后置”的思路执行，例如：

- 已沟通、重复公司、重复 HR
- 岗位名、公司名、薪资、公司规模、猎头过滤
- 加载职位卡片详情
- 活跃度、工作内容、地址、好友状态
- 高德距离 / 通勤判断
- AI 筛选

其中高德、AI、职位详情等高成本步骤只会在前置过滤通过后再执行。

## 本地自动化链路

`scripts/` 目录负责页面外自动化能力：

- `agent-bootstrap.mjs`: package 暴露的轻量自举入口
- `agent-bridge.mjs`: localhost bridge
- `agent-stop.mjs`: localhost bridge 关闭脚本
- `agent-launch.mjs`: 更低层的 bridge + relay 启动助手
- `agent-cli.mjs`: 命令行封装
- `agent-mcp-server.mjs` + `scripts/mcp/*`: MCP tools、resources、prompts
- `agent-orchestrator.mjs`: 内置编排示例

这条链路的核心目标是让外部 Agent 不直接操作 Boss 页面，而是通过本地 bridge 和 relay 驱动扩展。

## 状态与持久化

主要状态存放在 `src/stores/`：

- `conf`: 运行配置和模板
- `jobs`: 当前页面岗位列表与缓存状态
- `statistics`: 今日统计与历史统计
- `log`: 投递结果与结构化日志
- `agent`: run checkpoint、恢复摘要和运行态
- `user`: 用户信息、Cookie 管理、多账号切换、简历读取

bridge 侧会在仓库根目录生成本地文件：

- `.boss-helper-agent-token`
- `.boss-helper-agent-cert.json`
- `.boss-helper-agent-bridge.log`
- `.boss-helper-agent-bridge.pid`
- `.boss-helper-agent-extension-build.json`

## 外部依赖

当前仓库会按功能访问以下外部系统：

- Boss 直聘网页与站点接口
- 高德地图 REST API
- 你自行配置的 OpenAI 兼容模型服务

具体数据边界见 [`../PRIVACY.md`](../PRIVACY.md)。

## 测试与构建

常用命令：

```bash
pnpm lint
pnpm check
pnpm test -- --run
pnpm test:coverage
pnpm build:chrome
pnpm build:firefox
pnpm build:edge
pnpm test:e2e
```

最小验证集：

```bash
pnpm lint && pnpm check && pnpm test -- --run
```

## 修改建议

### 改页面自动化

优先检查：

- `src/utils/selectors.ts`
- `src/site-adapters/zhipin/adapter.ts`
- `src/pages/zhipin/hooks/useDeliver.ts`

### 改批处理 / 命令控制

优先检查：

- `src/pages/zhipin/hooks/useDeliveryControl.ts`
- `src/pages/zhipin/hooks/agentController.ts`
- `src/pages/zhipin/hooks/useAgentBatchRunner.ts`

### 改 bridge / MCP / CLI

优先检查：

- `scripts/agent-bridge.mjs`
- `scripts/agent-bootstrap.mjs`
- `scripts/agent-cli.mjs`
- `scripts/mcp/`
- `docs/bridge-mcp-deployment.md`
- `docs/llm-agent-mcp.md`

### 改投递 pipeline

同时检查：

- `src/composables/useApplying/services/pipelineFactory.ts`
- `src/composables/useApplying/handles.ts`
- `src/pages/zhipin/hooks/useDeliver.ts`
