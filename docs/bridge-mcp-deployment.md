# Boss Helper MCP / Bridge 部署说明

本文档聚焦本地 companion 链路的部署与运维：bridge、relay、CLI、MCP server、环境变量，以及聊天能力依赖的 protobuf schema。

如果你想看外部 LLM Agent 应该怎样调用这些工具，请继续阅读 [llm-agent-mcp.md](./llm-agent-mcp.md)。如果你想先理解整个系统分层，请先看 [architecture-analysis.md](./architecture-analysis.md)。

## 组件关系

本地自动化链路由 5 个部分组成：

1. 浏览器扩展：真正执行 Boss 页面内的投递、过滤、翻页、聊天发送。
2. `agent-bridge.mjs`：监听 localhost HTTP / HTTPS / SSE，对外暴露命令接口。
3. `agent-relay.html`：在浏览器普通页面里运行，把 bridge 命令转发给扩展，把扩展事件回传给 bridge，并通过 keepalive 维持 MV3 事件端口。
4. CLI / orchestrator：对 bridge HTTP 的命令行封装。
5. `agent-mcp-server.mjs`：把 bridge HTTP 封装为 stdio MCP tools。

注意：MCP server 不是替代 bridge 的新服务层，而是 bridge 的一个适配器。

## 本地要求

| 项目 | 说明 |
| --- | --- |
| Node.js | 建议 20.x，与 CI 保持一致 |
| pnpm | 建议 9.x |
| 浏览器 | Chromium 内核浏览器，relay 页面当前按 Chrome / Edge 行为设计 |
| 扩展状态 | 已安装或本地加载 Boss Helper 扩展 |
| 页面状态 | 至少打开一个 Boss 职位页，并完成插件初始化 |
| 端口 | 默认需要 `4317`（HTTP）和 `4318`（HTTPS relay）可用 |
| 本地证书 | 首次访问 `https://127.0.0.1:4318/` 或 `https://localhost:4318/` 时需要接受自签名证书 |

## 会生成的本地文件

这些文件都在仓库根目录，默认已被 `.gitignore` 忽略：

| 文件 | 作用 |
| --- | --- |
| `.boss-helper-agent-token` | bridge 共享 token；如果环境变量未显式指定，会自动生成并持久化 |
| `.boss-helper-agent-cert.json` | localhost 自签名证书和私钥 |
| `.boss-helper-agent-bridge.log` | `pnpm agent:start` 后台拉起 bridge 时的日志 |
| `.boss-helper-agent-bridge.pid` | 后台 bridge 进程 ID |

不要把这些文件提交到仓库。

## 最短启动路径

### 1. 本地加载扩展

```bash
pnpm install
pnpm build:chrome
```

然后在 Chromium 浏览器开发者模式中加载 `.output/chrome-mv3/`。

### 2. 打开 Boss 职位页

当前支持这些路径：

- `/web/geek/job`
- `/web/geek/job-recommend`
- `/web/geek/jobs`

### 3. 一键启动 bridge + relay 页面

```bash
pnpm agent:start -- --extension-id <你的扩展ID>
```

这个命令会：

- 检查 bridge 是否已在运行
- 自动后台拉起 `agent-bridge.mjs`
- 生成 relay URL
- 尝试用本机默认浏览器打开 relay 页面

首次打开 relay 页面时，请先接受本地自签名证书，然后保持页面常驻。

### 4. 运行诊断

```bash
pnpm agent:doctor
```

如果 `relayConnected` 为 `true`，说明 bridge 当前至少有一个 relay 页面连上了 `/events` SSE。它不等于“Boss 页面一定可控”，也不等于 relay 页的扩展事件端口一定健康。

### 5. 启动 MCP server

```bash
pnpm agent:mcp
```

之后就可以把它注册到支持 stdio 的 MCP 客户端中。

## 手动启动方式

### 只启动 bridge

```bash
pnpm agent:bridge
```

默认会监听：

- `http://127.0.0.1:4317`
- `https://127.0.0.1:4318`

其中：

- HTTP 端口主要供 CLI / MCP / 外部脚本发命令
- HTTPS 端口主要供 relay 页面访问，并满足扩展 `externally_connectable` 的 HTTPS 限制

### 手动打开 relay 页面

```text
https://127.0.0.1:4318/
```

或：

```text
https://localhost:4318/
```

进入页面后：

1. 填写扩展 ID。
2. 点击“保存并重连”。
3. 保持页面常驻。

### 验证 bridge 和 relay

```bash
pnpm agent:cli -- health
pnpm agent:cli -- status
pnpm agent:doctor
```

### 状态语义

- `relayConnected`：bridge 当前至少有一个 relay 页面连上 `GET /events`。这代表 bridge -> relay 页在线，但不代表目标 Boss 标签页已经可控。
- relay 页 `events: connected`：relay 已通过 `chrome.runtime.connect(...)` 连上扩展 background 的外部事件端口。这是 relay -> extension 的单独链路。
- `eventSubscribers`：bridge 当前有多少客户端订阅了 `GET /agent-events`。这通常是 orchestrator、MCP watcher 或外部脚本，不是 relay 页本身。
- relay 页现在会每 20 秒往扩展事件端口发送 keepalive，减少 Chrome MV3 service worker 空闲回收造成的周期性断线。

## 脚本清单

| 命令 | 作用 |
| --- | --- |
| `pnpm agent:start` | 一键拉起 bridge 并打开 relay 页面；若 bridge 已健康运行则直接复用 |
| `pnpm agent:bridge` | 只启动 bridge；如果端口已被占用会直接报 `EADDRINUSE` |
| `pnpm agent:cli -- <command>` | 通过 CLI 调 bridge |
| `pnpm agent:doctor` | 检查 bridge、relay 和扩展连接状态 |
| `pnpm agent:mcp` | 暴露 stdio MCP tools |
| `pnpm agent:orchestrate` | 内置的最小自动编排示例 |

## 环境变量

bridge / CLI / MCP 目前使用这些环境变量：

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `BOSS_HELPER_AGENT_HOST` | `127.0.0.1` | bridge 监听 host，也是 CLI / MCP 的目标 host |
| `BOSS_HELPER_AGENT_PORT` | `4317` | bridge HTTP 端口 |
| `BOSS_HELPER_AGENT_HTTPS_PORT` | `BOSS_HELPER_AGENT_PORT + 1` | relay HTTPS 页面端口 |
| `BOSS_HELPER_AGENT_BRIDGE_TOKEN` | 自动生成 | bridge 共享 token；未设置时会写入 `.boss-helper-agent-token` |
| `BOSS_HELPER_AGENT_TIMEOUT` | `30000` | bridge 的默认命令超时；部分命令会按类型覆盖 |

### 环境变量示例

```bash
export BOSS_HELPER_AGENT_HOST=127.0.0.1
export BOSS_HELPER_AGENT_PORT=4317
export BOSS_HELPER_AGENT_HTTPS_PORT=4318
export BOSS_HELPER_AGENT_BRIDGE_TOKEN=replace-with-your-own-token
export BOSS_HELPER_AGENT_TIMEOUT=45000
```

如果你修改了 host 或端口，需要同步更新：

- relay 页面访问地址
- CLI / orchestrator / MCP 客户端配置
- 本地自动化脚本中的 bridge base URL

## 认证机制

bridge 使用 token 进行 API 认证，所有客户端必须携带正确的 token 才能访问受保护的接口。

### Token 来源

Token 存储在 `.boss-helper-agent-token` 文件中（位于仓库根目录），生成逻辑如下：

1. 优先读取环境变量 `BOSS_HELPER_AGENT_BRIDGE_TOKEN`
2. 若未设置，则读取 `.boss-helper-agent-token` 文件内容
3. 若文件也不存在，则自动生成随机 token 并写入文件

### 认证 Header

HTTP 请求必须携带以下 header：

```
x-boss-helper-agent-token: <你的token>
```

### 接口认证范围

| 接口 | 是否需要 token |
| --- | --- |
| `GET /` (relay 页面) | 否（依赖 session cookie） |
| `GET /health` | 否 |
| `GET /status` | 是 |
| `GET /events` | 是（依赖 session cookie） |
| `GET /agent-events` | 是 |
| `POST /command` | 是 |
| `POST /batch` | 是 |
| `POST /responses` | 是（依赖 session cookie） |
| `POST /relay/announce` | 是（依赖 session cookie） |
| `GET /relay/bootstrap` | 是（依赖 session cookie） |

### Token 排障

如果遇到 `unauthorized-bridge-token` 错误：

1. 确认 `.boss-helper-agent-token` 文件内容与 bridge 启动时使用的 token 一致
2. 如果文件包含测试 token（如 `vitest-bridge-token-*`），可能需要重启 bridge 以生成新 token
3. 检查 CLI / MCP 是否正确读取了 token 文件
4. 确认没有连接到错误的 bridge 端口

重启 bridge 并刷新 token：

```bash
# 停止现有 bridge（如果有 PID 文件）
kill $(cat .boss-helper-agent-bridge.pid 2>/dev/null) 2>/dev/null
# 重新启动
pnpm agent:bridge
```

## 认证机制

bridge 使用 token 进行 API 认证，所有客户端必须携带正确的 token 才能访问受保护的接口。

### Token 来源

Token 存储在 `.boss-helper-agent-token` 文件中（位于仓库根目录），生成逻辑如下：

1. 优先读取环境变量 `BOSS_HELPER_AGENT_BRIDGE_TOKEN`
2. 若未设置，则读取 `.boss-helper-agent-token` 文件内容
3. 若文件也不存在，则自动生成随机 token 并写入文件

### 认证 Header

HTTP 请求必须携带以下 header：

```
x-boss-helper-agent-token: <你的token>
```

### 接口认证范围

| 接口 | 是否需要 token |
| --- | --- |
| `GET /` (relay 页面) | 否（依赖 session cookie） |
| `GET /health` | 否 |
| `GET /status` | 是 |
| `GET /events` | 是（依赖 session cookie） |
| `GET /agent-events` | 是 |
| `POST /command` | 是 |
| `POST /batch` | 是 |
| `POST /responses` | 是（依赖 session cookie） |
| `POST /relay/announce` | 是（依赖 session cookie） |
| `GET /relay/bootstrap` | 是（依赖 session cookie） |

### Token 排障

如果遇到 `unauthorized-bridge-token` 错误：

1. 确认 `.boss-helper-agent-token` 文件内容与 bridge 启动时使用的 token 一致
2. 如果文件包含测试 token（如 `vitest-bridge-token-*`），可能需要重启 bridge 以生成新 token
3. 检查 CLI / MCP 是否正确读取了 token 文件
4. 确认没有连接到错误的 bridge 端口

重启 bridge 并刷新 token：

```bash
# 停止现有 bridge（如果有 PID 文件）
kill $(cat .boss-helper-agent-bridge.pid 2>/dev/null) 2>/dev/null
# 重新启动
pnpm agent:bridge
```

## HTTP / SSE 接口

bridge 当前对外暴露这些接口：

- `GET /`
- `GET /health`
- `GET /status`
- `GET /events`
- `GET /agent-events`
- `POST /command`
- `POST /batch`
- `POST /responses`
- `POST /relay/announce`
- `GET /relay/bootstrap`

常用接口含义：

| 接口 | 作用 |
| --- | --- |
| `GET /` | relay 页面，建立 session cookie |
| `GET /health` | 检查 bridge 是否存活 |
| `GET /status` | 检查 relay、队列和 `agent-events` 订阅状态 |
| `POST /command` | 发送单条命令 |
| `POST /batch` | 顺序执行一组命令 |
| `GET /agent-events` | 订阅实时投递事件 |

其中需要特别区分：

- `relayConnected` 反映的是 relay 页到 `/events` 的 SSE 连接。
- `eventSubscribers` 反映的是谁在订阅 `GET /agent-events`。
- relay 页自己的 `events` 徽标反映的是 relay 到扩展 background 的外部事件端口。

除 `/` 和 `/health` 外，其余接口都需要认证：

- CLI / MCP / 脚本客户端：携带 `x-boss-helper-agent-token` 请求头。
- relay 页面：先通过 `GET /` 建立同源 HTTPS session cookie，再访问 `/events`、`/relay/bootstrap`、`/responses`、`/relay/announce` 等接口。

## MCP 部署说明

`agent-mcp-server.mjs` 本身不管理 relay，也不会启动 bridge。它只做两件事：

1. 读取 bridge 运行时配置和 token。
2. 把 bridge 的 HTTP / SSE 能力包装成 MCP tools。

最小注册示例：

```json
{
  "mcpServers": {
    "boss-helper": {
      "command": "pnpm",
      "args": ["agent:mcp"],
      "cwd": "/Users/wang/Documents/boss/boss-helper"
    }
  }
}
```

如果 MCP 客户端支持环境变量覆盖，也可以显式传入上面的 bridge 环境变量。

## Protobuf schema

bridge 的命令协议是 JSON，但页面内聊天能力依赖 Boss WebSocket 的 protobuf 协议。

相关文件：

- 完整 schema：`src/assets/chat.proto`
- 运行时最小 schema：`src/composables/useWebSocket/type.ts`
- 发送封装：`src/composables/useWebSocket/protobuf.ts`
- 捕获 / 解码：`src/pages/zhipin/services/chatStreamHooks.ts`
- 消息落库：`src/pages/zhipin/services/chatStreamMessages.ts`

当前最关键的消息结构是：

```proto
message TechwolfChatProtocol {
  required int32 type = 1;
  repeated TechwolfMessage messages = 3;
}

message TechwolfMessage {
  required TechwolfUser from = 1;
  required TechwolfUser to = 2;
  optional int64 mid = 4;
  optional int64 time = 5;
  required TechwolfMessageBody body = 6;
}

message TechwolfMessageBody {
  required int32 type = 1;
  required int32 templateId = 2;
  optional string text = 3;
}
```

这部分协议主要影响：

- `chat.send`
- `chat.list`
- `chat.history`
- 页面内聊天消息采集

如果你修改了聊天协议相关实现，至少要同时检查：

1. `chat.proto` 的字段定义
2. `type.ts` 里的 runtime schema
3. `protobuf.ts` 的发送编码
4. `chatStreamMessages.ts` 的解码和消息映射

## 安全约束

当前 bridge / relay 机制默认依赖这些约束：

1. 扩展 `externally_connectable` 只允许 `https://localhost/*` 和 `https://127.0.0.1/*`。
2. `background.ts` 只接受来自 `localhost` / `127.0.0.1` 的 HTTPS relay 页面。
3. bridge 请求必须附带共享 token。
4. 事件订阅端口名带 token，防止普通页面误连。
5. relay 页会通过 keepalive 保持外部事件端口活跃，降低 MV3 background 空闲超时引发的周期性断连。

这套方案只适合本机使用，不应该直接暴露到公网。

## 常见问题

### `relay-not-connected`

bridge 在线，但 relay 页面没有连接扩展。

处理方式：

1. 打开 `https://127.0.0.1:4318/`
2. 接受本地证书
3. 填写扩展 ID
4. 保持页面常驻

### `target-tab-not-found`

扩展没有找到可用的 Boss 职位页。

处理方式：

1. 打开支持的 Boss 职位页
2. 确认插件已经完成初始化
3. 再重试 `stats` 或 `start`

### `bridge-timeout`

relay 没有在超时时间内返回响应。常见原因：

- relay 页面被关闭
- Boss 页面未初始化完成
- `jobs.detail` 正在等待职位详情卡片加载

### relay 页持续出现“扩展事件连接断开”

如果 relay 页日志里反复出现“扩展事件连接断开，3s 后重连”，通常说明 relay -> extension 这条事件端口没有稳定保持。

处理方式：

1. 如果刚修改过 `background.ts` 或 relay 相关代码，先执行 `pnpm build:chrome`，然后在浏览器扩展管理页重新加载本地扩展。
2. 刷新 relay 页面，必要时重新填写扩展 ID 后点击“保存并重连”。
3. 确认 relay 页状态最终停在 `bridge: connected` 和 `events: connected`。
4. 如果 `relayConnected=true` 但 relay 页 `events` 仍在反复重连，命令链路可能还能工作，但 `/agent-events` 驱动的观察和审核闭环会不稳定。

### `unauthorized-bridge-token`

bridge token 不匹配。请检查：

- `.boss-helper-agent-token`
- 进程环境变量里的 `BOSS_HELPER_AGENT_BRIDGE_TOKEN`
- MCP / CLI 是否连接到了错误的 bridge 端口

## 变更这条链路时的最小验证

如果你改了 bridge、relay、MCP 或 protobuf 相关代码，建议至少跑完：

```bash
pnpm lint && pnpm check && pnpm test -- --run
pnpm agent:doctor
pnpm agent:cli -- status
```

如果修改了扩展生命周期或跨端消息行为，再补充：

```bash
pnpm build:chrome
pnpm test:e2e
```
