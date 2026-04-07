# Boss Helper 的 LLM Agent / MCP 接入指南

本文档面向希望把 Boss Helper 接到外部 LLM Agent 的使用者。

先说结论：对照 [future.md](future.md) 中的 15 项 Agent 化建议，当前仓库已经全部实现。你现在不需要再为 `jobs.list`、`jobs.detail`、`stop`、`navigate`、`resume.get`、`logs.query`、`jobs.review`、事件过滤或批量命令去做二次开发，直接接入即可。

## 架构说明

Boss Helper 不是一个直接监听本地端口的浏览器扩展，它的对外调用链路是分层的：

1. 浏览器扩展运行在 Boss 页面里，真正执行投递、筛选、翻页、消息发送。
2. 本地 bridge 服务监听 `127.0.0.1:4317`，对外暴露 HTTP 和 SSE。
3. relay 页面把 bridge 收到的命令转发给扩展，并把扩展事件回传给 bridge。
4. 页面控制器处理 `start`、`jobs.list`、`jobs.detail`、`jobs.review` 等命令。
5. MCP server 再把现有 bridge HTTP 能力封装成一组标准 MCP tools，供外部 LLM Agent 通过 stdio 调用。

也就是说，MCP 不是旁路协议，它只是现有 bridge 的标准工具层。

## 启动前提

在任何 Agent、CLI 或 MCP 调用之前，先确认下面 4 个条件：

1. 浏览器里已经安装并启用扩展。
2. 至少打开了一个 Boss 职位页。
3. 插件已经在该页面完成初始化。
4. relay 页面已经连接到扩展。

如果缺少其中任何一段，`start`、`stats`、`jobs.list`、`jobs.detail` 等命令都可能失败。

## 最短启动路径

最短可用路径如下：

1. 安装或本地加载扩展。
2. 打开 Boss 职位页并完成登录。
3. 运行 `pnpm agent:start`，自动拉起 bridge 并打开 relay 页面。
4. 在 relay 页面填入扩展 ID，保持页面常驻。
5. 确认 `pnpm agent:doctor` 输出正常。
6. 运行 `pnpm agent:mcp`，把现有能力暴露给支持 stdio 的 MCP 客户端。

如果你只需要脚本或命令行，不一定要启动 MCP；但如果目标是让外部 LLM Agent 直接调工具，MCP 是推荐入口。

## 现有脚本分别做什么

### `pnpm agent:start`

一键启动辅助脚本。

- 检查 `127.0.0.1:4317` 是否已有 bridge
- 若没有则后台拉起 bridge
- 生成 relay 页面地址
- 默认尝试打开浏览器

适合第一次接入时快速把链路跑起来。

### `pnpm agent:bridge`

只启动本地 bridge HTTP 服务，不自动打开浏览器。

适合你想手动控制 relay 页面，或者在已有环境中单独维护 bridge 时使用。

### `pnpm agent:doctor`

做链路诊断，确认 bridge、relay、扩展 ID 是否在线。

建议在真正调用 `start`、`jobs.list` 或 MCP tools 之前先跑一次。

### `pnpm agent:cli`

CLI 是 bridge HTTP 的一层轻量封装。

适合：

- 手工排障
- 验证某个命令的 payload
- 在脚本外快速看命令返回值

### `pnpm agent:orchestrate`

这是仓库内置的最小外部编排示例。

它会演示一条接近实际自动化的流程：

1. 可选执行 `navigate`
2. 读取 `resume.get`
3. 调用 `jobs.list`
4. 对候选职位执行 `jobs.detail`
5. 做简单关键词分析
6. 可选调用 `start`
7. 可选订阅事件并自动处理 `jobs.review`

它不是 MCP server，但很适合作为“怎样编排这些命令”的参考实现。

### `pnpm agent:mcp`

这是仓库内置的 stdio MCP server。

它会把现有 bridge HTTP 能力封装成 MCP tools，供支持 MCP 的客户端直接调用。

注意：`pnpm agent:mcp` 不负责启动 bridge，也不会帮你连接 relay。它依赖现有 bridge/relay/Boss 页面链路已经在线。

## MCP 工具与现有命令映射

当前 MCP server 暴露这些 tools：

- `boss_helper_health` -> `GET /health`
- `boss_helper_status` -> `GET /status`
- `boss_helper_start` -> `start`
- `boss_helper_pause` -> `pause`
- `boss_helper_resume` -> `resume`
- `boss_helper_stop` -> `stop`
- `boss_helper_stats` -> `stats`
- `boss_helper_navigate` -> `navigate`
- `boss_helper_resume_get` -> `resume.get`
- `boss_helper_jobs_list` -> `jobs.list`
- `boss_helper_jobs_detail` -> `jobs.detail`
- `boss_helper_jobs_review` -> `jobs.review`
- `boss_helper_logs_query` -> `logs.query`
- `boss_helper_chat_list` -> `chat.list`
- `boss_helper_chat_history` -> `chat.history`
- `boss_helper_chat_send` -> `chat.send`
- `boss_helper_config_get` -> `config.get`
- `boss_helper_config_update` -> `config.update`
- `boss_helper_batch` -> `POST /batch`
- `boss_helper_events_recent` -> 读取 `/agent-events` 的 `history`
- `boss_helper_wait_for_event` -> 等待 `/agent-events` 的下一条匹配事件

## 推荐调用顺序

推荐外部 Agent 按下面顺序接入，而不是一上来就直接 `start`：

1. `boss_helper_health`
2. `boss_helper_status`
3. `boss_helper_navigate`
4. `boss_helper_jobs_list`
5. `boss_helper_jobs_detail`
6. `boss_helper_resume_get`
7. 基于职位详情和简历做判断
8. `boss_helper_start` 或 `boss_helper_stop`
9. 运行中通过 `boss_helper_events_recent` / `boss_helper_wait_for_event` 观察结果
10. 如果启用了外部 AI 审核模式，则处理 `job-pending-review` 并调用 `boss_helper_jobs_review`

这条顺序的核心是：先观察，再决策，再执行，而不是把外部智能体退化成“只会发 start 的遥控器”。

## 外部 AI 审核闭环

如果你打开了外部 AI 审核模式，运行中的职位会在 AI 筛选阶段发出 `job-pending-review` 事件。

典型闭环是：

1. Agent 通过 `boss_helper_wait_for_event` 等待 `job-pending-review`
2. 取出事件里的 `encryptJobId`
3. 必要时再调用 `boss_helper_jobs_detail`
4. 外部模型判断是否接受
5. 调用 `boss_helper_jobs_review`
6. 提交 `accepted`、`rating`、`reason`、`positive`、`negative`，可选附带 `greeting`

这时外部 Agent 才真正成为筛选决策者，而不是只改配置的人。

## 配置校验与长超时说明

### `config.update` 校验

`config.update` 不是简单 merge，当前已经接了字段级校验。外部 Agent 如果传错数据，会收到明确错误，而不是沉默失败。

已覆盖的重点校验包括：

- `deliveryLimit.value` 范围
- `delay.*` 不能为负数
- `salaryRange` 与 `companySizeRange` 的结构合法性
- `aiFiltering.score` 范围
- `aiFiltering.externalTimeoutMs` 下限

这对 LLM 来说很重要，因为它需要明确错误才能做自我纠错。

### 长超时命令

不是所有命令都应该按统一 5 秒处理。

当前仓库已经按命令区分超时，尤其要注意：

- `jobs.detail` 允许长超时，因为它可能需要等待页面加载职位卡片详情
- `stop` 允许长超时，因为它可能需要等待当前岗位处理收尾

MCP server 也沿用这个约定，所以外部 Agent 不要把这类命令误判成“系统卡死”。

## 聊天能力边界

当前聊天相关命令已经可用，但边界要说清楚：

- `chat.send`：可直接通过当前页面可用的 Boss 通道发消息
- `chat.list`：返回当前页面采集到的会话摘要
- `chat.history`：返回当前页面采集到的会话消息

这里的读取能力是“当前页面采集视图”，不是 Boss 平台的完整历史库，因此不保证覆盖全量历史聊天。

## 常见错误与排障

### `relay-not-connected`

含义：bridge 在线，但 relay 页面没有连接扩展。

处理：

1. 打开 `http://127.0.0.1:4317/`
2. 使用 Chromium 浏览器访问
3. 填写扩展 ID
4. 保持 relay 页面常驻

### `target-tab-not-found`

含义：扩展没有找到可用的 Boss 职位页。

处理：

1. 打开 Boss 职位页
2. 确认路径是 `/web/geek/job`、`/web/geek/job-recommend` 或 `/web/geek/jobs`
3. 确认插件已经在页面中初始化完成

### `bridge-timeout`

含义：relay 没有在指定超时内返回结果。

常见原因：

- relay 页面被关闭
- Boss 页面未完成初始化
- `jobs.detail` 正在等待卡片详情，但页面状态异常

### `validation-failed`

含义：`config.update` 的 patch 没通过字段级校验。

处理方式不是重试同一个错误 patch，而是读取错误字段并修正参数。

### `review-not-found`

含义：调用 `jobs.review` 时，没有匹配到当前待审核岗位。

通常说明事件已经超时、已被处理，或者你传错了 `encryptJobId`。

## MCP 注册示例

下面是一个通用的 stdio MCP 注册示例。不同客户端的配置文件格式可能不同，但核心字段通常就是 `command`、`args` 和 `cwd`：

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

如果你的客户端支持环境变量覆盖，也可以额外传：

- `BOSS_HELPER_AGENT_HOST`
- `BOSS_HELPER_AGENT_PORT`

默认情况下，MCP server 会连接到 `http://127.0.0.1:4317`。

## 推荐实践

如果你要把 Boss Helper 作为外部 LLM Agent 的执行器，建议采用下面这套最稳妥的工作流：

1. 用 `boss_helper_health` / `boss_helper_status` 先确认链路可用
2. 用 `boss_helper_navigate` 切换到正确搜索页
3. 用 `boss_helper_jobs_list` 和 `boss_helper_jobs_detail` 做候选职位分析
4. 用 `boss_helper_resume_get` 把判断建立在真实简历上
5. 只对明确选中的岗位执行 `boss_helper_start`
6. 对运行中的结果用事件工具观察，而不是频繁盲轮询
7. 如果启用外部审核模式，必须处理 `job-pending-review` -> `boss_helper_jobs_review` 闭环
8. 异常时优先 `boss_helper_stop`，不要只停在 `pause`

这样才能把这个仓库真正当作一个“可被 LLM Agent 驱动的求职执行引擎”，而不是一个只能远程点开始按钮的插件。