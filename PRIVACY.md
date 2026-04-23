# Boss Helper Privacy

最后更新：2026-04-19

本文档描述的是当前仓库的实际行为，不代表上游仓库、第三方分发版本或任何非本仓库维护的浏览器商店条目。

## 总体原则

Boss Helper 的大部分能力在本地浏览器和本地 companion 进程内运行。是否会把数据发往外部，取决于你是否主动启用对应能力。

## 本地存储的数据

浏览器扩展和本地 companion 可能在本地保存以下数据：

- 扩展运行配置、模板、主题等普通设置
- 投递统计、缓存、去重记录、日志摘要和 run checkpoint
- 多账号切换所需的账号元数据与本地 Cookie 管理信息
- 你自行配置的 OpenAI 兼容模型信息与 API Key
- 使用本地 bridge / bootstrap 时生成的 `.boss-helper-agent-token`、`.boss-helper-agent-cert.json`、`.boss-helper-agent-bridge.log`、`.boss-helper-agent-bridge.pid`、`.boss-helper-agent-extension-build.json`

这些数据默认保存在本地设备，不会因为你单纯打开仓库而自动同步到当前 GitHub 仓库维护者。

## 可能发生的外部请求

### Boss 直聘站点

扩展运行在 `zhipin.com` 页面中，会读取页面 DOM、调用站点接口，并在你触发职位读取、筛选、投递、简历读取或账号切换等操作时与 Boss 直聘站点交互。

### 你自行配置的 OpenAI 兼容模型

只有在你配置了模型地址、模型名和 API Key，并启用了相关 AI 功能后，岗位信息、提示词和模型请求才会发往你指定的 API 服务。

## 默认不会发生的事情

- 当前仓库不会因为你本地启动 bridge / CLI / MCP 就自动把本地日志上传到当前仓库维护者
- 当前仓库没有单独的公共云 relay 或公共桥接服务
- 不会在未启用对应能力的情况下主动把 OpenAI API Key 或简历内容发往第三方接口

## 用户控制方式

你可以通过以下方式控制本地数据：

- 在扩展 UI 中修改或删除模型配置与运行配置
- 关闭或不启用 OpenAI、自定义 AI 功能
- 卸载扩展或清理浏览器扩展存储
- 删除仓库根目录中的本地 companion 文件，例如 token、证书、日志、pid 和构建元数据

## 联系方式

如果你对当前仓库的数据处理边界有疑问，请通过 Issues 提交：

- <https://github.com/nikkkoni/boss-helper/issues>
