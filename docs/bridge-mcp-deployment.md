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
| 浏览器扩展 | 真正执行页面内的读取、投递、聊天和状态汇总 |
| `agent-bridge.mjs` | 监听 localhost HTTP / HTTPS / SSE，对外暴露命令与事件接口 |
| `agent-relay.html` | 在普通浏览器页面中连接 bridge 和扩展 |
| `agent-cli.mjs` | bridge 的命令行封装 |
| `agent-mcp-server.mjs` | 把 bridge 封装成 stdio MCP tools |

## 前置条件

- Node.js `20.19.0`
- pnpm `9.x`
- Chromium 浏览器
- 已构建并加载 Boss Helper 扩展
- 至少打开一个支持的 Boss 职位页
- 默认端口 `4317` 和 `4318` 可用

支持页面：

- `/web/geek/job`
- `/web/geek/job-recommend`
- `/web/geek/jobs`

## 最短启动路径

### 1. 构建并加载扩展

```bash
pnpm install
pnpm build:chrome
```

然后在浏览器开发者模式中加载 `.output/chrome-mv3/`。

### 2. 打开 Boss 职位页并登录

确保当前页面已经是支持的职位搜索页，并且扩展已完成初始化。

### 3. 启动 bridge 并打开 relay 页面

```bash
pnpm agent:start -- --extension-id <你的扩展ID>
```

这个命令会：

- 检查 bridge 是否已健康运行
- 若没有则后台拉起 `agent-bridge.mjs`
- 生成 relay URL
- 默认打开浏览器中的 relay 页面

macOS 下默认浏览器名是 `Google Chrome`，也可通过 `--browser` 覆盖。

### 4. 信任证书并保持 relay 页面打开

首次访问时需要接受本地自签名证书。relay 页面保持常驻，否则外部命令不会被转发给扩展。

### 5. 运行诊断

```bash
pnpm agent:doctor
pnpm agent:cli status
```

### 6. 如需 MCP

```bash
pnpm agent:mcp
```

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

进入页面后填入扩展 ID，并保持页面常驻。

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
pnpm agent:cli chat.send --payload '{"to_uid":"123","to_name":"bossId","content":"你好","confirmHighRisk":true}'
pnpm agent:cli chat.send --payload '{"encryptJobId":"encryptJobId-1","content":"你好","confirmHighRisk":true}'
```

`chat.list` 返回的会话摘要会尽量携带 `to_uid` / `to_name`，方便直接复用到 `chat.send`。
`jobs.detail` 也会在可解析时附带 `chatTarget`，适合刚投递成功后立刻补发定制消息。

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

`pnpm agent:mcp` 不负责启动 bridge 或连接 relay，只负责把现有 bridge 能力包装成 MCP。

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

## 聊天 protobuf 相关文件

聊天功能依赖 Boss 的 protobuf 协议。关键文件：

- `src/assets/chat.proto`
- `src/composables/useWebSocket/type.ts`
- `src/composables/useWebSocket/protobuf.ts`
- `src/pages/zhipin/services/chatStreamHooks.ts`
- `src/pages/zhipin/services/chatStreamMessages.ts`

如果修改聊天协议，实现与文档需要一起更新。

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
