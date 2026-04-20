# Boss Helper LLM Agent / MCP 接入指南

本文档面向希望通过 MCP 驱动当前仓库的外部 Agent 或自动化脚本。

部署、证书、环境变量、bridge 端点见 [`./bridge-mcp-deployment.md`](./bridge-mcp-deployment.md)。

## 先理解一件事

`pnpm agent:mcp` 不是“浏览器扩展直接开放端口”。它仍然只是把现有 bridge 能力包装成 MCP tools。

当前 `pnpm agent:mcp` 默认不会自动拉起浏览器链路。推荐先由用户在真实浏览器中准备好 bridge、relay、扩展和 Boss 页面；如确有需要，可显式传 `--bootstrap` 让 MCP 后台补齐 bridge、扩展构建，并尝试打开 relay 与目标 Boss 页面这两个普通 URL。

真实链路是：

```text
MCP client
  -> boss_helper_* tools
  -> bridge
  -> relay
  -> extension
  -> Boss 页面控制器
```

因此在任何 MCP 调用前，都仍要确认：

- 扩展已经在当前真实浏览器环境中安装并加载
- relay 页面已连接扩展事件端口
- 至少存在一个支持的 Boss 职位页
- 页面已登录并完成初始化

如果你已经手工准备好了 bridge / relay / 浏览器链路，直接运行：

```bash
pnpm agent:mcp
```

如需让 MCP 显式触发轻量 bootstrap，可使用：

```bash
pnpm agent:mcp -- --bootstrap
```

## 推荐工作流

最稳妥的调用顺序如下：

1. `boss_helper_bootstrap_guide`
2. `boss_helper_health`
3. `boss_helper_status`
4. `boss_helper_agent_context`
5. 必要时 `boss_helper_navigate` 或 `boss_helper_jobs_refresh`
   - 地级市可直接传 `city='杭州'`、`city='湖州'`
   - 目标是区县时优先传 `city + multiBusinessDistrict`，例如安吉县用 `city='湖州'` 与 `multiBusinessDistrict='330523'`
6. `boss_helper_jobs_current` / `boss_helper_jobs_list` / `boss_helper_jobs_detail`
7. `boss_helper_resume_get`
8. `boss_helper_plan_preview`
9. `boss_helper_start`
10. `boss_helper_events_recent` 或 `boss_helper_wait_for_event`
11. 如有审核事件，执行 `boss_helper_jobs_review`
12. 出现异常或结束后，读取 `boss_helper_stats` / `boss_helper_run_report`

原则是：先观察，再决策，再执行。

## 工具分类

### 诊断与上下文

| Tool | 作用 |
| --- | --- |
| `boss_helper_health` | 检查 bridge 是否在线 |
| `boss_helper_status` | 检查 relay、队列、事件订阅状态 |
| `boss_helper_bootstrap_guide` | 只读判断冷启动还缺哪一步 |
| `boss_helper_agent_context` | 聚合 bridge、页面、事件、统计和推荐动作 |

### 页面与岗位

| Tool | 作用 |
| --- | --- |
| `boss_helper_navigate` | 导航到受支持的 Boss 搜索页；支持 `city` 与 `multiBusinessDistrict` 定位城市 / 区县 |
| `boss_helper_jobs_refresh` | 刷新当前受支持职位页，不改搜索条件 |
| `boss_helper_resume_get` | 读取当前账号的结构化简历与摘要 |
| `boss_helper_jobs_list` | 读取当前页岗位摘要列表 |
| `boss_helper_jobs_current` | 读取当前已选中岗位快照 |
| `boss_helper_jobs_detail` | 主动读取指定岗位详情 |
| `boss_helper_jobs_review` | 提交外部审核结果 |

### 执行与审计

| Tool | 作用 |
| --- | --- |
| `boss_helper_plan_preview` | 只读预演当前岗位会怎样被处理 |
| `boss_helper_start` | 启动投递任务 |
| `boss_helper_pause` | 暂停当前任务 |
| `boss_helper_resume` | 恢复已暂停任务 |
| `boss_helper_stop` | 停止当前任务并清理中间状态 |
| `boss_helper_stats` | 读取进度、统计和风险摘要 |
| `boss_helper_run_report` | 读取 current / recent run 审计报告 |
| `boss_helper_logs_query` | 查询结构化日志 |

### 配置与事件

| Tool | 作用 |
| --- | --- |
| `boss_helper_config_get` | 读取当前配置 |
| `boss_helper_config_update` | 更新配置；已移除的问候 / 聊天字段会触发 `validation-failed` |
| `boss_helper_batch` | 顺序执行一组命令 |
| `boss_helper_events_recent` | 读取最近事件快照 |
| `boss_helper_wait_for_event` | 等待下一条匹配事件 |

## 高层资源与提示模板

当前 MCP 还提供：

### Resources

- `boss-helper://guides/autonomy-workflow`
- `boss-helper://guides/review-loop`
- `boss-helper://runtime/bridge-context`

### Prompts

- `boss_helper_targeted_delivery`
- `boss_helper_review_closure`

这些资源适合让外部 Agent 读取当前推荐工作流，而不是把说明硬编码在客户端里。

## 几个关键工具的边界

### `boss_helper_bootstrap_guide`

适用于冷启动阶段。它会只读告诉你：

- bridge 是否在线
- relay 是否已连接
- relay 是否已配置 extension ID
- Boss 页是否存在
- 页面是否需要登录、是否存在风控阻断

如果返回的下一步动作仍然是人工动作，例如打开浏览器、完成登录、处理验证码，就不要让 Agent 盲重试。

### `boss_helper_agent_context`

这是最适合作为“第一条主要工具调用”的高层聚合接口。

它会返回：

- `readiness`
- `summary`
- `workflow`
- `recommendations`
- 按需聚合的 section，例如 jobs、stats、events、logs、plan

如果你只是想知道“当前该往哪里走”，优先用它，而不是自己手工串很多底层命令。

### `boss_helper_jobs_current`、`boss_helper_jobs_detail`、`boss_helper_jobs_refresh`

三者的边界：

- `jobs.current`: 只读当前已选中岗位，不切换列表
- `jobs.detail`: 按 `encryptJobId` 主动读取或加载指定岗位详情
- `jobs.refresh`: 刷新当前列表页，只做页面恢复，不读取详情

### `boss_helper_navigate`

`navigate` 的几个关键参数语义：

- `city`: 支持 Boss 城市编码，也支持常见地级市中文名；MCP 会在页面侧把如 `杭州`、`湖州` 自动转成 Boss 城市编码
- `multiBusinessDistrict`: Boss 页面实际使用的区县 / 商圈筛选参数，通常传 6 位代码，例如 `330523` 表示安吉县
- 如果目标是县区，不要只传 `city='安吉'` 这类名字并期待 Boss 一定识别；更稳妥的做法是传地级市 + 区县码，例如 `city='湖州'` 且 `multiBusinessDistrict='330523'`

例如：

```json
{
  "city": "湖州",
  "multiBusinessDistrict": "330523",
  "query": "运维"
}
```

### `boss_helper_plan_preview`

用于在真正 `start` 前做一次只读预演，帮助外部 Agent 判断：

- 哪些岗位会被直接跳过
- 哪些岗位缺少信息
- 哪些岗位还要等外部 AI 审核
- 哪些岗位已具备执行条件

如果你已经在用 `boss_helper_agent_context(include=['plan'])`，MCP 聚合层会做小范围 scoped preview，优先复用当前已选中岗位或少量候选岗位，而不是扫整页。

### `boss_helper_run_report`

用于排障和复盘，不是日常第一跳工具。它只面向 current / recent run，适合在暂停、异常、中断或结束后使用。

## 高风险动作与配置校验

以下工具调用前必须显式确认风险：

| Tool | 额外要求 |
| --- | --- |
| `boss_helper_start` | 必须传 `confirmHighRisk=true` |
| `boss_helper_resume` | 必须传 `confirmHighRisk=true` |
| `boss_helper_config_update` | 不需要高风险确认，但若 patch 包含已移除字段或非法值，会返回 `validation-failed` |

额外说明：

- `start` / `resume` 在未确认时会返回结构化 `preflight` 摘要，便于你先读风险再决定是否真执行
- 即使传了 `confirmHighRisk=true`，也不能绕过页面侧的每日投递额度和其他护栏
- `config.update` 当前是 delivery-only 配置更新接口；像 `customGreeting`、`greetingVariable`、`aiGreeting`、`aiReply`、`delay.messageSending` 这类已移除字段应先从 patch 中删掉再调用

## Readiness 与错误恢复

### 页面 readiness

`boss_helper_agent_context.readiness.suggestedAction` 当前稳定收敛为：

- `navigate`
- `wait-login`
- `refresh-page`
- `stop`
- `continue`

这是 page-level readiness 的优先分支信号。

### 命令失败时的错误 envelope

关键命令失败时通常会返回：

- `code`
- `message`
- `retryable`
- `suggestedAction`

命令级 `suggestedAction` 还可能出现：

- `retry`
- `fix-input`
- `reconnect-relay`
- `resume`

推荐恢复方式：

| suggestedAction | 推荐动作 |
| --- | --- |
| `navigate` | 调用 `boss_helper_navigate` |
| `refresh-page` | 优先调用 `boss_helper_jobs_refresh` |
| `wait-login` | 等待用户完成登录 |
| `retry` | 可直接重试当前命令 |
| `fix-input` | 修正参数后再调用 |
| `reconnect-relay` | 先恢复 relay 页面 |
| `resume` | 当前批次处于暂停态，先判断是否应恢复 |

## 外部 AI 审核闭环

如果启用了外部审核模式，典型闭环如下：

1. `boss_helper_wait_for_event` 等待 `job-pending-review`
2. 取出 `encryptJobId`
3. 必要时 `boss_helper_jobs_detail`
4. 必要时 `boss_helper_resume_get`
5. 调用 `boss_helper_jobs_review`

提交审核时建议至少包含：

- `accepted`
- `rating`
- `reason`
- `positive`
- `negative`

## MCP 客户端注册示例

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

即使显式使用 `--bootstrap`，首次登录、证书接受、验证码和风控处理仍需要人工在真实浏览器中完成。任务结束后，如需关闭本地 companion bridge，可运行 `pnpm agent:stop`。

## 推荐实践

1. 不要跳过 `boss_helper_bootstrap_guide` / `boss_helper_agent_context`，直接对整页执行 `start`。
2. 在真实执行前优先做 `plan.preview`。
3. 只对明确筛出的岗位执行 `start`，尽量传入显式 `jobIds`。
4. 运行中优先看事件和 run report，不要盲目重试写命令。
5. 出现异常时优先 `stop`，不要让 run 长期停在不确定状态。
