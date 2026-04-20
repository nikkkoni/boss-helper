> [!CAUTION]
> 本项目仅供学习交流，禁止用于商业用途。
>
> 自动投递、外部 Agent / MCP 调用都可能触发平台风控，包括但不限于限流、降权、异常提醒或封禁。请自行评估风险。
>
> 当前仓库基于早期项目 fork 后持续演进，文档、链接、安装方式和支持边界均以本仓库为准，不沿用上游 README 中的商店地址、问卷或反馈入口。

# Boss Helper

Boss Helper 是一个面向 Boss 直聘网页端的浏览器扩展和本地自动化工具链，用来减少职位筛选和简历投递中的重复操作。

当前仓库不是只有一个插件面板，而是一条完整执行链路：

```text
CLI / MCP / 外部脚本
  -> agent bridge (HTTP / HTTPS / SSE)
  -> relay page
  -> extension background
  -> content script
  -> main-world
  -> delivery controller
  -> SiteAdapter / applying pipeline
  -> Boss 页面 DOM 与投递接口
```

## 仓库定位

- 浏览器扩展负责页面内职位读取、筛选、投递与状态展示
- `SiteAdapter` 与 `src/utils/selectors.ts` 收敛 Boss 页面 DOM 和路由耦合
- applying pipeline 负责规则过滤、高德通勤与 AI 筛选等执行步骤
- `scripts/` 提供本地 bridge、bootstrap、CLI、MCP server 和 orchestrator
- 支持 Chrome / Edge / Firefox 构建，本地调试优先推荐 Chrome

## 当前能力

- 批量投递、定向投递和批次控制
- 岗位名、公司、薪资、公司规模、HR、已沟通等规则过滤
- 高德地图距离 / 时长过滤
- AI 筛选、外部 AI 审核闭环
- 运行统计、结构化日志、风险摘要和 run checkpoint
- CLI、bridge、MCP、外部 Agent 自动化接入

## 支持页面

- `/web/geek/job`
- `/web/geek/job-recommend`
- `/web/geek/jobs`

## 快速开始

### 环境要求

- Node.js `20.19.0`
- pnpm `9.x`
- Chromium 系浏览器；建议直接使用你日常登录 Boss 的真实浏览器
- 已登录的 Boss 直聘网页账号

### 本地加载扩展

```bash
git clone https://github.com/nikkkoni/boss-helper.git
cd boss-helper
pnpm install
pnpm build:chrome
```

构建输出目录：

- Chrome: `.output/chrome-mv3/`
- Edge: `.output/edge-mv3/`
- Firefox: `.output/firefox-mv2/`

在浏览器开发者模式中加载对应目录即可。

### 常用开发命令

```bash
pnpm dev
pnpm dev:edge
pnpm dev:firefox
pnpm lint
pnpm check
pnpm test -- --run
pnpm build:chrome
pnpm test:e2e
```

最小验证集：

```bash
pnpm lint && pnpm check && pnpm test -- --run
```

## Agent / CLI / MCP

`pnpm agent:start` 现在只负责准备本地 bridge、扩展构建，并在你的真实浏览器里打开 relay 页面和默认 Boss 职位页；它不再启动、持有或接管任何受管浏览器实例。

`pnpm agent:mcp` 默认不再自动自举浏览器链路。推荐先手动运行 `pnpm agent:start` 或至少 `pnpm agent:bridge`，再在真实浏览器里打开 relay / Boss 页面；如果你明确希望 MCP 在后台补齐 bridge、扩展构建并尝试打开这两个普通页面，可显式传 `--bootstrap`。

最短启动路径：

1. 运行：

```bash
pnpm agent:start
```

2. 首次使用时命令会自动构建 Chrome 扩展，并尝试在系统默认真实浏览器里打开 relay 页面与 `https://www.zhipin.com/web/geek/jobs`。
3. 在你实际使用的真实浏览器中手动安装仓库内的扩展目录：`.output/chrome-mv3/`。
4. 如果当前浏览器还没有 Boss 登录态，请在该浏览器里手动登录并处理证书、验证码或风控。
5. 启动脚本不会创建受管 profile、不会无头启动浏览器，也不会直接驱动 Boss 页面；后续所有操作都应走 `MCP -> bridge -> extension -> page` 的间接链路。
6. 运行：

```bash
pnpm agent:doctor
pnpm agent:cli status
```

7. 使用结束后如需关闭本地 bridge：

```bash
pnpm agent:stop
```

8. 如需 MCP：

```bash
pnpm agent:mcp
```

常用附加参数：

```bash
pnpm agent:bootstrap -- --target-url 'https://www.zhipin.com/web/geek/jobs?query=运维'
pnpm agent:bootstrap -- --no-open --no-build
pnpm agent:stop
pnpm agent:mcp -- --bootstrap
```

常用脚本：

| 命令 | 作用 |
| --- | --- |
| `pnpm agent:start` | 准备 bridge / 扩展，并尝试在真实浏览器打开 relay 和默认 Boss 页 |
| `pnpm agent:bootstrap` | 执行一次轻量自举并输出结构化结果；不会持有浏览器进程，也不直接操控 Boss 页面 |
| `pnpm agent:bridge` | 只启动本地 bridge |
| `pnpm agent:stop` | 按 pid 文件安全停止本地 bridge |
| `pnpm agent:cli <command>` | 通过 CLI 调用 bridge |
| `pnpm agent:doctor` | 诊断 bridge / relay / extension 状态 |
| `pnpm agent:mcp` | 启动 stdio MCP server；默认不自动拉起浏览器链路 |
| `pnpm agent:orchestrate` | 运行仓库内置的自动化编排示例 |

`navigate` / 搜索定位补充：

- MCP / CLI 的 `navigate.city` 支持常见地级市中文名，也支持 Boss 城市编码
- 目标是县区时，应优先使用 `city + multiBusinessDistrict` 组合；例如安吉县可使用 `city="湖州"` 与 `multiBusinessDistrict="330523"`

## 文档导航

- `docs/architecture-analysis.md`: 当前系统分层、运行链路和模块边界
- `docs/bridge-mcp-deployment.md`: bridge / relay / CLI / MCP 的部署、环境变量和排障
- `docs/llm-agent-mcp.md`: MCP 工具、推荐调用顺序和高风险动作约束
- `CONTRIBUTING.md`: 开发、验证与提交流程
- `PRIVACY.md`: 当前仓库的数据处理与隐私边界
- `ARCHITECTURE.md`: 架构文档入口重定向

## 目录速览

| 目录 | 说明 |
| --- | --- |
| `src/entrypoints/` | background / content / main-world 入口 |
| `src/pages/zhipin/` | 页面逻辑、组件、批处理控制、查询 hooks |
| `src/site-adapters/` | 站点适配层 |
| `src/composables/useApplying/` | 投递 pipeline、过滤与 AI |
| `src/message/` | 跨上下文消息协议与 Agent 命令模型 |
| `src/stores/` | 配置、统计、职位、日志、用户、agent 运行态 |
| `scripts/` | bridge、CLI、MCP、orchestrator 和本地运维脚本 |
| `tests/` | 单元测试与 Playwright E2E |

## 外部依赖边界

当前仓库的基础能力主要在本地运行，但某些可选功能会访问外部服务：

- Boss 直聘网页接口
- 高德地图 REST API：仅在启用通勤过滤并配置 key 后使用
- OpenAI 兼容接口：仅在你配置自己的模型与 API Key 后使用

如果你不使用这些可选能力，文档和开发流程仍然成立。

## 风险与边界

- 页面 DOM 或站内路由变化会直接影响选择器和自动化稳定性
- bridge 默认只允许本机 `localhost / 127.0.0.1` 使用，不应暴露到公网
- `start` 与 `resume` 属于显式高风险动作
- 当前仓库不把上游浏览器商店链接视为有效安装入口；默认以源码构建和本仓库内容为准

## 相关链接

- 仓库: <https://github.com/nikkkoni/boss-helper>
- Issues: <https://github.com/nikkkoni/boss-helper/issues>
- Pull Requests: <https://github.com/nikkkoni/boss-helper/pulls>
- License: [MIT](./LICENSE)
