> [!CAUTION]
> 本项目仅供学习交流，禁止用于商业用途。
>
> 使用自动投递脚本存在账号风险，包括但不限于限流、降权、异常提醒、封禁等。请自行评估风险，本项目不承担任何责任。

# Boss Helper

Boss 直聘助手，用来减少筛选职位、投递简历和管理投递过程中的重复劳动。

项目基于 WXT + Vue 3 + Element Plus，当前同时支持：

- 浏览器插件内手动配置并批量投递
- 按岗位条件、公司条件、距离、AI 规则进行筛选
- 多模型配置、自动招呼、统计与日志查看
- 通过本地 HTTP companion 服务接入 agent / CLI / MCP 自动化控制

| Chrome                                                                                                                                                                                             | Crx 搜搜                                                                                                                                          | Edge                                                                                                                                                                                                                                                                                                                           | Firefox                                                                                                                                   | GitHub                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ogkmgjbagackkdlcibcailacnncgonbn?label=Chrome插件商店)](https://chrome.google.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Crx 搜搜](https://img.shields.io/badge/Crx搜索-v%3F.%3F.%3F-EF7C3D)](https://www.crxsoso.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn) | [![Edge Web Store](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fjcllnbjfeamhihjpfjlclhdnjmggbgal&query=version&prefix=v&label=Edge插件商店&color=EF7C3D)](https://microsoftedge.microsoft.com/addons/detail/jcllnbjfeamhihjpfjlclhdnjmggbgal) | [![Firefox](https://img.shields.io/amo/v/boss-helper?label=Mozilla插件商店)](https://addons.mozilla.org/zh-TW/firefox/addon/boss-helper/) | [![GitHub Release](https://img.shields.io/github/v/release/Ocyss/boos-helper)](https://github.com/Ocyss/boos-helper/releases/latest/) |

> 国内如果无法访问 Chrome 插件商店，可以优先使用 Crx 搜搜 或 Edge 插件商店。

## 目录

- [项目定位](#项目定位)
- [功能概览](#功能概览)
- [快速开始](#快速开始)
- [安装方式](#安装方式)
- [插件使用教程](#插件使用教程)
- [Agent 自动化教程](#agent-自动化教程)
- [常见问题](#常见问题)
- [开发与构建](#开发与构建)
- [项目预览](#项目预览)
- [相关链接](#相关链接)
- [参与贡献](#参与贡献)
- [鸣谢](#鸣谢)

## 项目定位

这个项目不是一个独立桌面程序，而是一个浏览器扩展。核心逻辑运行在 Boss 直聘页面中，所以你需要：

1. 在浏览器中安装扩展。
2. 打开 Boss 直聘职位页面。
3. 登录自己的 Boss 账号。
4. 在页面中打开插件 UI 并完成配置。

如果你只是想开箱即用地辅助投递，直接按照商店安装和插件使用教程操作即可。

如果你想让本机 agent、CLI 或脚本去控制插件，再继续阅读 Agent 自动化教程。

## 功能概览

当前仓库已经支持这些能力：

- 批量投递简历
- 按薪资、公司名、职位名、人数等规则过滤职位
- 基于高德能力做通勤距离、通勤时间过滤
- AI 辅助筛选职位
- 自动打招呼
- 多模型管理
- 多账号管理
- 投递统计和日志记录
- 通过本地 companion 服务开放 127.0.0.1:4317 给 agent 调用

Agent 能力目前开放的命令有：

- start
- pause
- resume
- resume.get
- stop
- stats
- navigate
- chat.list
- chat.history
- chat.send
- logs.query
- jobs.list
- jobs.detail
- jobs.review
- config.get
- config.update

对照 [future.md](future.md) 中提出的 15 项 Agent 化建议，当前仓库已经全部实现，不需要再额外补业务能力才能接入外部 LLM Agent。

目前已经落地的能力包括：

- 职位观察：`jobs.list`、`jobs.detail`、`resume.get`、`logs.query`
- 任务控制：`start`、`pause`、`resume`、`stop`、`navigate`
- 聊天能力：`chat.list`、`chat.history`、`chat.send`
- 外部审核闭环：`job-pending-review` 事件与 `jobs.review`
- 工程基础设施：命令级超时、`config.update` 字段级校验、`/batch`、`/agent-events` 过滤、relay 断线排队恢复
- 外部调用入口：CLI、orchestrator，以及仓库内置 MCP server

## 快速开始

如果你只想尽快跑起来，按下面路径选一种即可。

### 路径一：普通用户

1. 从插件商店安装扩展。
2. 打开 Boss 直聘职位页。
3. 登录账号并打开插件面板。
4. 配置筛选规则、投递上限、招呼语。
5. 点击开始执行批量投递。

### 路径二：本地源码安装

1. 克隆仓库。
2. 安装依赖。
3. 构建 Chrome 扩展。
4. 在浏览器开发者模式中加载构建产物。
5. 回到 Boss 页面使用插件。

### 路径三：接入 agent / CLI / MCP

1. 完成本地源码安装或保证浏览器中已有插件。
2. 启动本地 companion 服务。
3. 打开 relay 页面并填写扩展 ID。
4. 通过 CLI、HTTP 或 MCP 调用 start、pause、stats、jobs.list、jobs.detail 等命令。
5. 如果要接 LLM Agent，优先使用 `pnpm agent:mcp` 暴露标准 MCP tools。

## 安装方式

## 商店安装

适合绝大多数用户。

### Chrome

直接通过 Chrome 插件商店安装：

<https://chrome.google.com/webstore/detail/ogkmgjbagackkdlcibcailacnncgonbn>

### Edge

直接通过 Edge 插件商店安装：

<https://microsoftedge.microsoft.com/addons/detail/jcllnbjfeamhihjpfjlclhdnjmggbgal>

### Firefox

直接通过 Firefox 插件商店安装：

<https://addons.mozilla.org/zh-TW/firefox/addon/boss-helper/>

## 本地源码安装

如果你要自己修改代码、调试功能、接入 agent，建议使用源码安装。

### 1. 克隆仓库

```bash
git clone https://github.com/Ocyss/boos-helper.git
cd boos-helper
```

### 2. 安装依赖

仓库使用 pnpm。

```bash
pnpm install
```

### 3. 构建浏览器扩展

构建 Chrome 版本：

```bash
pnpm build:chrome
```

构建完成后，默认产物目录是：

```text
chrome-mv3/
```

如果你要构建其他浏览器：

```bash
pnpm build:edge
pnpm build:firefox
```

### 4. 在浏览器中加载扩展

#### Chrome / Edge

1. 打开扩展管理页。
2. 开启开发者模式。
3. 选择加载已解压的扩展程序。
4. 选择仓库里的 chrome-mv3 目录。

#### Firefox

Firefox 开发加载方式和 Chromium 不同，通常用于本地调试。若只是使用，建议优先安装商店版本。

### 5. 获取扩展 ID

如果你后续需要接入 agent，请先记下扩展 ID。

Chrome / Edge 获取方式通常是：

1. 打开扩展管理页。
2. 进入这个扩展的详情页。
3. 复制显示的扩展 ID。

## 插件使用教程

## 基本前提

开始使用前，确认这些条件已经满足：

- 浏览器里已经安装插件
- 已登录 Boss 直聘账号
- 当前页面是 Boss 职位页，而不是普通介绍页
- 页面已经正常加载职位列表

支持的职位页路径包括：

- /web/geek/job
- /web/geek/job-recommend
- /web/geek/jobs

## 首次使用建议流程

第一次建议按这个顺序配置，避免一上来就全自动：

1. 先只配置基础筛选条件。
2. 把投递上限设置小一点，比如 5 到 20。
3. 先不打开过多 AI 或高德筛选项。
4. 先在一页职位里做小规模测试。
5. 确认日志和统计正常后，再扩大范围。

## 常用配置项说明

具体字段会随着版本演进，但使用思路基本一致。

### 1. 投递上限

建议先设置一个保守值，例如：

- 每轮投递 10 到 20 个岗位
- 观察账号状态后再逐步增加

### 2. 延迟参数

插件支持配置不同阶段的延迟，例如：

- 开始一轮投递前的延迟
- 岗位之间的投递间隔
- 翻页后的等待时间
- 发送招呼语前的等待时间

不要把这些值压得太低。过快操作更容易触发 Boss 限制。

### 3. 过滤规则

你可以组合这些能力做过滤：

- 薪资范围
- 公司名包含或排除
- 职位名包含或排除
- 简单文本关键词
- AI 过滤
- 通勤距离和通勤时间

建议先从简单文本规则开始，再逐步叠加 AI 和地图能力。

### 4. 自动招呼

如果你启用了自动招呼，建议先写一套简洁、稳定的模板，不要过度冗长。

### 5. 多模型配置

项目支持多模型管理。只有在你明确需要 AI 参与筛选或生成文本时，才需要配置对应模型。

## 开始投递

配置完成后，回到 Boss 页面插件面板：

1. 点击开始。
2. 观察页面统计、日志和当前岗位状态。
3. 如果需要中断，点击暂停。
4. 如果任务进入 paused 状态，可以点击继续。

运行过程中，建议你同时关注：

- 当前页职位数是否正常
- 是否出现频率限制相关提示
- 日志里是否有大量 error 或 warn
- Boss 页面本身是否出现异常弹窗或验证码

## 统计与日志怎么看

插件内已经提供统计和日志面板，通常建议这样看：

- 统计面板：看今天投递数量、历史记录、当前进度
- 日志面板：看每个岗位为什么被过滤、为什么投递失败、是否触发限频

如果你发现没投递但也没报错，优先去日志面板看过滤原因。

## 使用建议

- 不要一开始就大批量投递
- 不要把延迟参数设得极低
- 不要在账号状态异常、网络波动明显时持续运行
- 不要完全依赖 AI 过滤结果，先抽样复核
- 先在小样本下验证配置，再扩大范围

## Agent 自动化教程

## 推荐接入方式

如果你要把这个仓库接到 Claude、OpenCode、Cursor 或其他支持 MCP 的 LLM Agent，推荐优先使用 MCP，而不是直接自己拼 HTTP 请求。

- MCP 入口：`pnpm agent:mcp`
- 详细教程：[docs/llm-agent-mcp.md](docs/llm-agent-mcp.md)
- 前提不变：bridge、relay、扩展和 Boss 职位页链路都必须在线

## 整体架构

项目已经支持通过本地 companion 服务开放端口给 agent 控制，但扩展本身并不会直接监听一个本地 TCP 或 HTTP 端口。

实际链路是：

1. 本地 companion 服务监听 127.0.0.1:4317。
2. 浏览器打开 relay 页面。
3. relay 页面通过 chrome.runtime.sendMessage 把命令转发给扩展。
4. relay 页面通过 chrome.runtime.connect 订阅扩展实时事件。
5. 扩展把命令转发到当前 Boss 页面中的控制器，并把投递事件经 relay 回传给 companion SSE。

也就是说，真正对外暴露的是 companion 服务，不是扩展本体。

## 使用前提

Agent 接入前必须满足这些条件：

- 浏览器中已经安装并启用扩展
- 至少打开了一个 Boss 职位页
- 插件在该页面中已经完成初始化
- relay 页面已经连接到扩展

如果缺少任何一个环节，start 或 stats 等命令都可能失败。

## 一键启动方式

最简单的方式是使用一键启动脚本。

```bash
pnpm agent:start
```

这个命令会做几件事：

- 检查 127.0.0.1:4317 是否已经有 bridge 在运行
- 如果没有，则自动后台拉起 bridge
- 生成 relay 页面地址
- 默认尝试打开浏览器

### 常用参数

预填扩展 ID：

```bash
pnpm agent:start -- --extension-id <你的扩展ID>
```

指定浏览器：

```bash
pnpm agent:start -- --browser "Google Chrome" --extension-id <你的扩展ID>
```

只启动 bridge，不自动打开浏览器：

```bash
pnpm agent:start -- --no-open
```

首次启动后，bridge 日志默认写到：

```text
.boss-helper-agent-bridge.log
```

bridge 被后台拉起时，还会写入：

```text
.boss-helper-agent-bridge.pid
```

## 手动启动方式

如果你不想使用一键启动，也可以手动拆开执行。

### 1. 启动 bridge

```bash
pnpm agent:bridge
```

或者：

```bash
node ./scripts/agent-bridge.mjs
```

默认监听地址：

```text
http://127.0.0.1:4317
```

### 2. 打开 relay 页面

在 Chromium 浏览器中打开：

```text
http://127.0.0.1:4317/
```

### 3. 填写扩展 ID

打开 relay 页面后：

1. 在输入框中粘贴扩展 ID。
2. 点击保存并重连。
3. 保持这个 relay 页面一直打开。

如果 relay 页面被关掉，bridge 仍然在，但命令不会被转发到扩展。

## 诊断命令

建议在发真正的 start 命令之前先跑一次诊断。

### 查看 bridge 是否存活

```bash
pnpm agent:cli -- health
```

### 查看 relay 是否已连接

```bash
pnpm agent:cli -- status
```

### 查看整体状态

```bash
pnpm agent:doctor
```

doctor 会聚合 bridge、relay 和扩展 ID 状态，并给出下一步建议。

## MCP 使用方法

如果你不是自己写脚本，而是要让外部 LLM Agent 直接调用这些能力，建议在 bridge 和 relay 准备完成后启动 MCP server：

```bash
pnpm agent:mcp
```

这个命令不会代替 `pnpm agent:start` 或 `pnpm agent:bridge`。它只是把已经存在的 HTTP bridge 封装成 stdio MCP tools，所以仍然依赖下面这条链路已经在线：

1. bridge 已启动
2. relay 页面已连接扩展
3. Boss 职位页已打开
4. 页面里的插件控制器已初始化完成

完整接入说明、工具列表和推荐调用顺序见 [docs/llm-agent-mcp.md](docs/llm-agent-mcp.md)。

## CLI 使用方法

CLI 是对 companion HTTP 接口的一层简单封装。

### 基本格式

```bash
pnpm agent:cli -- <command>
```

例如：

```bash
pnpm agent:cli -- stats
pnpm agent:cli -- pause
pnpm agent:cli -- resume
pnpm agent:cli -- resume.get
pnpm agent:cli -- chat.list
pnpm agent:cli -- chat.history --payload '{"conversationId":"某个会话名"}'
pnpm agent:cli -- jobs.list
pnpm agent:cli -- jobs.detail --payload '{"encryptJobId":"encryptJobId-1"}'
pnpm agent:cli -- config.get
```

也可以直接调用脚本：

```bash
node ./scripts/agent-cli.mjs stats
```

### start 示例

```bash
node ./scripts/agent-cli.mjs start --payload '{"jobIds":["encryptJobId-1"],"resetFiltered":true}'
```

### config.update 示例

```bash
node ./scripts/agent-cli.mjs config.update --payload '{"configPatch":{"deliveryLimit":{"value":20}},"persist":true}'
```

### batch 示例

```bash
node ./scripts/agent-cli.mjs batch --payload '[{"command":"stats"},{"command":"jobs.list"}]'
```

### orchestrator 示例

```bash
pnpm agent:orchestrate -- --query 前端 --include vue,react --start --watch
```

### chat.history 示例

```bash
node ./scripts/agent-cli.mjs chat.history --payload '{"conversationId":"某个会话名","limit":20}'
```

### stats 示例

```bash
node ./scripts/agent-cli.mjs stats
```

## HTTP 接口说明

bridge 暴露的主要 HTTP 接口有：

- GET /health
- GET /status
- GET /agent-events
- POST /command
- POST /batch
- POST /agent-events
- POST /responses
- GET /events
- POST /relay/announce

通常外部 agent 只需要关心这几个：

- GET /health：检查服务是否活着
- GET /status：检查 relay 是否已经连接
- POST /command：真正下发命令
- POST /batch：顺序下发多条命令
- GET /agent-events：订阅实时投递事件

### /agent-events 实时事件流

外部 agent 可以直接订阅 SSE：

```bash
curl -N http://127.0.0.1:4317/agent-events
```

按事件类型过滤：

```bash
curl -N 'http://127.0.0.1:4317/agent-events?types=job-pending-review,job-filtered'
```

连接建立后会先收到一条 `history` 事件，包含最近缓存的事件列表；后续每条实时投递事件都会以 `agent-event` 推送。

事件内容包含这些关键信息：

- `type`：事件类型，例如 `batch-started`、`job-started`、`job-succeeded`、`job-filtered`、`job-failed`
- `message`：可直接展示的文本消息
- `state`：当前投递状态
- `job`：当前岗位快照
- `progress`：当前进度快照

常见事件类型包括：

- `batch-started`
- `batch-resumed`
- `batch-pausing`
- `batch-paused`
- `batch-completed`
- `batch-error`
- `job-started`
- `job-pending-review`
- `chat-sent`
- `job-succeeded`
- `job-filtered`
- `job-failed`
- `rate-limited`
- `limit-reached`

### /command 请求示例

```json
{
  "command": "stats",
  "payload": null,
  "timeoutMs": 30000
}
```

### curl 示例

```bash
curl -X POST http://127.0.0.1:4317/command \
  -H 'Content-Type: application/json' \
  -d '{"command":"stats","payload":null,"timeoutMs":30000}'
```

## 直接调用扩展外部消息接口

如果你不需要 companion 服务，也可以在本地网页里直接调用扩展外部消息接口。

限制条件：

- 页面来源必须是 localhost 或 127.0.0.1
- 浏览器必须能访问 chrome.runtime.sendMessage 或 browser.runtime.sendMessage

### 请求格式

```ts
type BossHelperAgentRequest = {
  channel: '__boss_helper_agent__'
  command:
    | 'start'
    | 'pause'
    | 'resume'
    | 'resume.get'
    | 'stop'
    | 'stats'
    | 'navigate'
    | 'chat.list'
    | 'chat.history'
    | 'chat.send'
    | 'logs.query'
    | 'jobs.list'
    | 'jobs.detail'
    | 'jobs.review'
    | 'config.get'
    | 'config.update'
  payload?: unknown
  requestId?: string
  version?: number
}
```

### 响应格式

```ts
type BossHelperAgentResponse = {
  ok: boolean
  code: string
  message: string
  data?: unknown
}
```

### 读取 stats 示例

```js
const extensionId = '你的扩展 ID'

chrome.runtime.sendMessage(
  extensionId,
  {
    channel: '__boss_helper_agent__',
    command: 'stats',
    version: 1,
  },
  (response) => {
    console.log(response)
  },
)
```

### 启动投递示例

```js
const extensionId = '你的扩展 ID'

await chrome.runtime.sendMessage(extensionId, {
  channel: '__boss_helper_agent__',
  command: 'start',
  version: 1,
  payload: {
    jobIds: ['目标岗位 encryptJobId 1', '目标岗位 encryptJobId 2'],
    resetFiltered: true,
    persistConfig: false,
    configPatch: {
      deliveryLimit: { value: 20 },
      delay: {
        deliveryStarts: 3,
        deliveryInterval: 4,
        deliveryPageNext: 10,
        messageSending: 5,
      },
    },
  },
})
```

### 运行时改配置示例

```js
const extensionId = '你的扩展 ID'

await chrome.runtime.sendMessage(extensionId, {
  channel: '__boss_helper_agent__',
  command: 'config.update',
  version: 1,
  payload: {
    persist: true,
    configPatch: {
      company: {
        enable: true,
        include: false,
        value: ['外包'],
        options: ['外包'],
      },
    },
  },
})
```

## 命令语义说明

### start

启动新的投递任务。

支持的 payload 字段：

- jobIds：只定向投递这些 encryptJobId
- configPatch：运行时补丁配置
- persistConfig：是否把 start 里的 configPatch 持久化
- resetFiltered：是否把目标岗位重置为等待状态后重新处理

### pause

发出暂停请求。不会立即硬中断，而是尽量等待当前岗位处理结束后停下。

### resume

在任务已经 paused 时继续执行。

### resume.get

返回当前账号的结构化简历数据和文本版简历摘要。

### stop

停止当前任务并清理目标岗位状态。

### navigate

导航到指定 Boss 搜索页，支持直接给 url，或者传 query、city、position、page 进行拼装。

### chat.list

返回当前页面已采集到的聊天会话摘要。这一版是内存视图，不保证覆盖 Boss 全量历史。

### chat.history

返回指定 conversationId 对应的当前页面内存聊天消息列表。这一版是内存视图，不保证覆盖 Boss 全量历史。

### chat.send

直接通过页面当前可用的 Boss WebSocket 通道发送消息。

### logs.query

按 limit、offset、status、时间范围查询结构化日志。

### jobs.list

返回当前搜索页的职位摘要列表。

### jobs.detail

返回指定 encryptJobId 的职位详情，必要时会等待页面加载卡片详情。

### jobs.review

提交外部 AI 审核结果，用于处理 `job-pending-review` 事件。

### stats

返回当前进度、当前岗位、今日统计、历史统计。

### config.get

返回当前运行时配置快照。

### config.update

直接在运行中修改配置，可选择是否持久化到扩展存储。

## 定向投递说明

定向投递是 agent 侧最有用的能力之一。

注意点：

- jobIds 必须是 Boss 页面里的 encryptJobId
- 控制器会沿着当前搜索结果继续翻页查找目标岗位
- 直到全部命中、用户暂停、或无法继续翻页才停止

这意味着：

- 你不需要保证所有目标岗位都在当前第一页
- 但你必须先让页面处在正确的搜索结果链路中

## 常见问题

## 1. stats 或 start 返回 relay-not-connected

说明 bridge 已启动，但 relay 页面没有连接。

处理方式：

1. 打开 http://127.0.0.1:4317/
2. 用 Chromium 浏览器访问
3. 填写扩展 ID
4. 保持页面常驻

## 2. 返回 target-tab-not-found

说明扩展没找到可用的 Boss 职位页面。

处理方式：

1. 打开 Boss 职位页
2. 确认路径是 /web/geek/job、/web/geek/job-recommend 或 /web/geek/jobs
3. 确认插件已在该页面初始化完成

## 3. 命令发出去了，但没有实际投递

优先检查：

- 插件日志里是否全被过滤掉
- 当前职位页是否为空
- 当前配置是否限制过严
- 是否触发 Boss 频率限制

## 4. agent:start 只启动了 bridge，没有自动打开页面

通常是浏览器打开命令在本机不可用，或者你用了 --no-open。

可直接手动打开：

```text
http://127.0.0.1:4317/
```

## 5. 为什么 companion 服务已经开启，但 start 还是失败

因为完整链路依赖四段：

1. bridge 在线
2. relay 页面在线
3. relay 已连接扩展
4. Boss 页面已打开并初始化

只满足第 1 段还不够。

## 6. 为什么不直接让扩展监听本地 HTTP 端口

浏览器扩展本身不适合直接作为本地端口服务来暴露，所以当前采用的是：

- 本地 companion 服务提供 HTTP
- relay 页面转发到扩展
- 扩展转发到页面控制器

这是当前架构下更稳妥的实现方式。

## 开发与构建

## 本地开发

```bash
pnpm install
pnpm dev
```

其他浏览器：

```bash
pnpm dev:edge
pnpm dev:firefox
```

## 类型检查

```bash
pnpm check
```

## 构建

```bash
pnpm build:chrome
pnpm build:edge
pnpm build:firefox
```

一次性全部构建：

```bash
pnpm build
```

## 打包

```bash
pnpm zip
```

## 代码格式化和静态检查

```bash
pnpm fmt
pnpm fmt:check
pnpm lint
pnpm lint:fix
```

## 项目预览

[![卡片状态](docs/img/shot_2024-04-14_23-08-03.png)](docs/img/shot_2024-04-14_23-08-03.png)
[![账户配置](docs/img/shot_2024-04-14_23-09-05.png)](docs/img/shot_2024-04-14_23-09-05.png)
[![统计界面](docs/img/shot_2024-04-02_22-25-25.png)](docs/img/shot_2024-04-02_22-25-25.png)
[![配置界面](docs/img/shot_2024-04-02_22-26-54.png)](docs/img/shot_2024-04-02_22-26-54.png)
[![日志界面](docs/img/shot_2024-04-02_22-32-25.png)](docs/img/shot_2024-04-02_22-32-25.png)

## 相关链接

Github 开源地址：<https://github.com/ocyss/boos-helper>

飞书反馈问卷：<https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g>

飞书问卷结果：<https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc>

GreasyFork 地址（0.2 旧版本）：<https://greasyfork.org/zh-CN/scripts/491340>

## 参与贡献

1. Fork 本仓库并克隆到本地。
2. 新建分支并提交修改。
3. 运行必要的构建和检查命令。
4. 提交 Pull Request。

## 鸣谢

- <https://github.com/yangfeng20/boss_batch_push>
- <https://github.com/lisonge/vite-plugin-monkey>
- <https://github.com/chatanywhere/GPT_API_free>
- <https://uiverse.io/>
- <https://www.runoob.com/manual/mqtt/protocol/MQTT-3.1.1-CN.pdf>

## 类似项目

- <https://github.com/Frrrrrrrrank/auto_job__find__chatgpt__rpa>
- <https://github.com/noBaldAaa/find-job>

## Star 趋势

<a href="https://star-history.com/#ocyss/boos-helper&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ocyss/boos-helper&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ocyss/boos-helper&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ocyss/boos-helper&type=Date" />
 </picture>
</a>
