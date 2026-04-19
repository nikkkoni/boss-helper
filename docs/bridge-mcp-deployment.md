# Boss Helper Bridge / Relay / MCP 部署说明

本文档说明当前仓库的本地 companion 链路如何启动、验证和排障：

- bridge
- relay 页面
- CLI
- MCP server
- 认证与本地证书

如果你想了解外部 Agent 应该怎样调用这些工具，请看 [`./llm-agent-mcp.md`](./llm-agent-mcp.md)。

## 组件关系

```text
CLI / MCP / 外部脚本
  -> agent-bridge.mjs
  -> agent-relay.html
  -> extension background
  -> content script
  -> main-world
  -> Boss 页面控制器
```

各组件职责：

| 组件 | 作用 |
| --- | --- |
| 浏览器扩展 | 真正执行页面内的读取、投递和状态汇总 |
| `agent-bridge.mjs` | 监听 localhost HTTP / HTTPS / SSE，对外暴露命令与事件接口 |
| `agent-relay.html` | 在普通浏览器页面中连接 bridge 和扩展 |
| `agent-cli.mjs` | bridge 的命令行封装 |
| `agent-mcp-server.mjs` | 把 bridge 封装成 stdio MCP tools |

## 前置条件

- Node.js `20.19.0`
- pnpm `9.x`
- 系统已安装的 `Google Chrome`
- 已构建 Boss Helper 扩展，并在受管 profile 中手动安装 `.output/chrome-mv3/`
- 至少打开一个支持的 Boss 职位页
- 默认端口 `4317` 和 `4318` 可用

支持页面：

- `/web/geek/job`
- `/web/geek/job-recommend`
- `/web/geek/jobs`

## 最短启动路径

### 1. 一键自举本地链路

```bash
pnpm install
pnpm agent:start
```

这个命令会：

- 检查 bridge 是否已健康运行，必要时后台拉起 `agent-bridge.mjs`
- 在 token 变化或首次使用时自动执行 `pnpm build:chrome`
- 有头模式下打开一个受管的系统 `Google Chrome` persistent profile
- 自动打开 relay 页面并预填当前扩展的默认 extension ID
- 默认打开 `https://www.zhipin.com/web/geek/jobs`

说明：当前 bootstrap 只负责拉起真实浏览器、relay 和 Boss 页面，不会直接通过 Playwright 页面对象操控 Boss，也不会用命令行强制注入扩展。请先在该 Chrome profile 里手动安装 `.output/chrome-mv3/`，后续所有 Boss 操作都应通过 MCP -> bridge -> extension -> page 的间接链路完成。`--headless` 仅用于无头命令行场景。

### 2. 首次 profile 登录 Boss

首次使用某个 profile 时，仍需要你在自动打开的真实 Chrome 中完成 Boss 登录。之后同一 `profileDir` 可直接复用登录态。

默认 profile 目录：

- `.boss-helper-agent-profile/`

如需自定义：

```bash
pnpm agent:start -- --profile-dir ./local/boss-profile --headed
```

### 3. 运行诊断

```bash
pnpm agent:doctor
pnpm agent:cli status
```

### 4. 如需 MCP

```bash
pnpm agent:mcp
```

`agent:mcp` 现在默认也会后台触发同一套 bootstrap，但它不会阻塞 MCP initialize 握手；而是在首个 tool/resource 调用前等待 bootstrap 完成。

如果你已经手工准备好 bridge / relay / 浏览器链路，或在测试环境里不希望自动拉起浏览器，可显式关闭：

```bash
pnpm agent:mcp -- --no-bootstrap
```

## 受管自举参数

`pnpm agent:start` 与 `pnpm agent:bootstrap` 共享这些常用参数：

- `--profile-dir <path>`: 指定真实 Chrome persistent profile 目录
- `--target-url <url>`: 自定义启动后打开的 Boss 页面
- `--headless`: 对已有登录态 profile 做无头启动
- `--headed`: 强制有头启动
- `--force-build`: 无论是否已有产物都重建 Chrome 扩展
- `--no-build`: 跳过自动构建；要求 `.output/chrome-mv3` 已存在
- `--no-browser`: 只确保 bridge 和扩展构建，不拉起真实浏览器

其中：

- `agent:start` 会持有受管浏览器进程，适合作为常驻入口
- `agent:bootstrap` 只做一次自举并输出结构化结果，适合被其他脚本复用；默认也不会直接操控 Boss 页面


首次访问 relay HTTPS 页面时仍可能需要接受本地自签名证书；受管浏览器会忽略 HTTPS 错误，但手工浏览器不会。

## 手动启动方式

### 只启动 bridge

```bash
pnpm agent:bridge
```

默认地址：

- `http://127.0.0.1:4317`
- `https://127.0.0.1:4318`

### 手动打开 relay 页面

- `https://127.0.0.1:4318/`
- `https://localhost:4318/`

进入页面后填入扩展 ID，并保持页面常驻。`agent:start` 打开的 relay URL 会自动预填当前默认扩展 ID；如果当前 profile 实际安装的是别的扩展实例，应以 Chrome profile 中实际安装的扩展 ID 为准。如果扩展事件端口没有连上，bridge 会把该 relay 视为“未就绪”，不会向它派发命令。

### 常用 CLI 命令

```bash
pnpm agent:cli health
pnpm agent:cli status
pnpm agent:cli readiness.get
pnpm agent:cli stats
pnpm agent:cli jobs.current --payload '{"includeDetail":true}'
pnpm agent:cli plan.preview
pnpm agent:cli navigate --payload '{"city":"湖州","multiBusinessDistrict":"330523","query":"运维"}'
```

`navigate` 参数说明：

- `city` 支持 Boss 城市编码，也支持常见地级市中文名，例如 `杭州`、`湖州`
- `multiBusinessDistrict` 是 Boss 页面实际使用的区县 / 商圈级过滤参数，通常传 6 位代码；例如 `330523` 为安吉县
- 目标是县区时，优先使用“地级市 + multiBusinessDistrict”组合，而不是仅传县区名

高风险写命令示例：

```bash
pnpm agent:cli start --payload '{"jobIds":["encryptJobId-1"],"confirmHighRisk":true}'
pnpm agent:cli resume --payload '{"confirmHighRisk":true}'
```

## 状态语义

这几个状态很容易混淆：

- `relayConnected`: bridge 当前至少有一个 relay 页面连上 `/events` SSE
- relay 页 `events: connected`: relay 已通过 `chrome.runtime.connect(...)` 连上扩展 background 的事件端口
- `eventSubscribers`: 当前有多少客户端在订阅 bridge 的 `/agent-events`

`relayConnected=true` 只代表 bridge 和 relay 页面之间在线，不代表 Boss 页面一定可控。

如果你要判断页面是否已初始化、是否需要登录、是否存在验证码或阻断模态框，应调用：

- CLI: `pnpm agent:cli readiness.get`
- MCP: `boss_helper_bootstrap_guide` 或 `boss_helper_agent_context`

## 环境变量

### bridge / CLI / orchestrator

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `BOSS_HELPER_AGENT_HOST` | `127.0.0.1` | bridge 监听 host |
| `BOSS_HELPER_AGENT_PORT` | `4317` | bridge HTTP 端口 |
| `BOSS_HELPER_AGENT_HTTPS_PORT` | `port + 1` | relay HTTPS 页面端口 |
| `BOSS_HELPER_AGENT_BRIDGE_TOKEN` | 自动生成 | bridge 认证 token |
| `BOSS_HELPER_AGENT_TIMEOUT` | `30000` | bridge 默认命令超时 |
| `BOSS_HELPER_AGENT_MAX_BODY_BYTES` | `1048576` | bridge JSON 请求体大小限制 |
| `BOSS_HELPER_AGENT_TOKEN_FILE` | `.boss-helper-agent-token` | token 文件路径 |
| `BOSS_HELPER_AGENT_CERT_FILE` | `.boss-helper-agent-cert.json` | 本地证书文件路径 |
| `BOSS_HELPER_AGENT_PID_FILE` | `.boss-helper-agent-bridge.pid` | `agent:start` 记录的 bridge pid 文件 |
| `BOSS_HELPER_AGENT_LOG_FILE` | `.boss-helper-agent-bridge.log` | `agent:start` 记录的 bridge 日志文件 |

### MCP

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `BOSS_HELPER_AGENT_MCP_MAX_CONTENT_LENGTH` | `1048576` | MCP stdio 单帧最大长度 |

环境变量示例：

```bash
export BOSS_HELPER_AGENT_HOST=127.0.0.1
export BOSS_HELPER_AGENT_PORT=4317
export BOSS_HELPER_AGENT_HTTPS_PORT=4318
export BOSS_HELPER_AGENT_BRIDGE_TOKEN=replace-with-your-own-token
export BOSS_HELPER_AGENT_TIMEOUT=45000
```

## 本地生成文件

默认位于仓库根目录，且应被 `.gitignore` 忽略：

| 文件 | 作用 |
| --- | --- |
| `.boss-helper-agent-token` | bridge 共享 token |
| `.boss-helper-agent-cert.json` | localhost 自签名证书 |
| `.boss-helper-agent-bridge.log` | 后台 bridge 启动日志 |
| `.boss-helper-agent-bridge.pid` | 后台 bridge 进程 ID |

## HTTP / HTTPS / SSE 接口

bridge 当前提供这些接口：

| 接口 | 认证 | 作用 |
| --- | --- | --- |
| `GET /` | 否 | relay 页面入口，HTTPS 下会写 session cookie |
| `GET /health` | 否 | bridge 存活检测 |
| `GET /status` | 是 | relay、事件订阅、排队状态 |
| `GET /relay/bootstrap` | 是，且必须 HTTPS | relay 读取 event port 配置 |
| `GET /events` | 是 | bridge 向 relay 下发命令的 SSE |
| `GET /agent-events` | 是 | 对外事件订阅 SSE |
| `POST /command` | 是 | 发送单条命令 |
| `POST /batch` | 是 | 顺序执行一组命令 |
| `POST /responses` | 是 | relay 回传命令响应 |
| `POST /relay/announce` | 是 | relay 上报 extension ID 和浏览器信息 |

认证方式：

- 普通客户端：`x-boss-helper-agent-token`
- relay 页面：HTTPS session cookie + token 引导

## Token 与认证

token 读取顺序：

1. `BOSS_HELPER_AGENT_BRIDGE_TOKEN`
2. `.boss-helper-agent-token`
3. 若两者都没有，则自动生成并写入 token 文件

直接调用 HTTP 接口时，需要携带：

```text
x-boss-helper-agent-token: <token>
```

## MCP 部署

`pnpm agent:mcp` 默认会尝试自动补齐 bridge / 受管浏览器 / relay 链路，但仍然只是本地 stdio MCP server，不会绕过页面登录、验证码或风控。

最小注册示例：

```json
{
  "mcpServers": {
    "boss-helper": {
      "command": "pnpm",
      "args": ["agent:mcp"],
      "cwd": "/path/to/boss-helper"
    }
  }
}
```

当前 MCP server 同时兼容：

- `Content-Length` framed stdio
- newline-delimited JSON-RPC

## 常见错误

### `relay-not-connected`

含义：bridge 在线，但没有 relay 页面连上扩展。

处理：

1. 打开 `https://127.0.0.1:4318/`
2. 接受本地证书
3. 填入扩展 ID
4. 保持 relay 页面常驻

### `target-tab-not-found`

含义：扩展没有找到可用的 Boss 职位页。

处理：

1. 打开支持的职位页
2. 确认页面已登录
3. 确认扩展已在页面完成初始化

### `bridge-timeout`

含义：relay 没在超时窗口内返回结果。

常见原因：

- relay 页面关闭
- Boss 页面未初始化完成
- `jobs.detail` 或 `stop` 正在等待长耗时收尾

### `unauthorized-bridge-token`

含义：客户端携带的 token 与 bridge 当前运行 token 不一致。

优先检查：

- `.boss-helper-agent-token`
- `BOSS_HELPER_AGENT_BRIDGE_TOKEN`
- 是否连接到了错误端口

### `Operation timed out after 10000ms`

这通常是 MCP 客户端启动阶段的握手超时，而不是页面命令本身超时。

优先检查：

1. `pnpm agent:mcp` 是否能单独启动
2. 客户端是否从正确的仓库目录启动
3. bridge / relay 是否已经就绪
4. 客户端的 stdio 传输模式是否与 server 兼容

## 安全边界

- bridge 默认只监听本机 `127.0.0.1`
- 扩展 `externally_connectable` 仅允许 `https://localhost/*` 和 `https://127.0.0.1/*`
- background 只接受来自本机 HTTPS relay 的外部消息
- 写命令仍受页面侧高风险确认和运行护栏约束

这套链路只适合本机使用，不应直接暴露到公网。
