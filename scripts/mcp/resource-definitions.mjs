// @ts-check

/** @typedef {import('../types.d.ts').McpResourceDefinition} McpResourceDefinition */

function makeResourceContent(uri, mimeType, text) {
  return {
    uri,
    mimeType,
    text,
  }
}

function buildAutonomyWorkflowResource() {
  return `# Boss Helper Autonomy Workflow

把 Boss Helper 当成自主执行器时，推荐遵循下面的顺序，而不是直接调用 \`boss_helper_start\`。

1. 如果还不确定环境是否已准备好，先调用 \`boss_helper_bootstrap_guide\`，确认 bridge、relay、extension ID 和 Boss 页前置条件。
2. 再调用 \`boss_helper_health\`、\`boss_helper_status\`，确认 bridge 和 relay 在线。
3. 然后调用 \`boss_helper_agent_context\`，一次性读取运行上下文、最近事件和下一步建议。
4. 如有必要，用 \`boss_helper_navigate\` 切换到目标搜索页。
5. 用 \`boss_helper_jobs_list\` 获取候选岗位，再对少量高价值岗位调用 \`boss_helper_jobs_detail\`。
6. 用 \`boss_helper_resume_get\` 把判断建立在真实简历上，而不是凭空猜测。
7. 在真正执行前，先调用 \`boss_helper_plan_preview\` 读取只读预演结果，确认哪些岗位会被跳过、哪些仍需 AI 审核或人工确认。
8. 只对明确筛出的岗位调用 \`boss_helper_start\`，并显式传入 \`jobIds\`。
9. 运行中优先通过 \`boss_helper_events_recent\`、\`boss_helper_wait_for_event\` 观察进度，不要盲轮询。
10. 收到 \`job-pending-review\` 后，必须补完 \`boss_helper_jobs_review\` 审核闭环。
11. 异常时优先调用 \`boss_helper_stop\`，不要把系统长期停在不确定状态。

恢复策略：

- \`relay-not-connected\`：先打开 relay 页面并确认扩展已连接。
- \`target-tab-not-found\`：先打开 Boss 职位页并等待扩展初始化完成。
- \`validation-failed\`：修正参数后再重试，不要重复提交同一个错误 patch。
- \`review-not-found\`：说明待审核岗位已过期或已被处理，先刷新上下文再决策。
`
}

function buildReviewLoopResource() {
  return `# Boss Helper Review Loop

当运行中的岗位触发 \`job-pending-review\` 时，外部 Agent 应按下面的闭环处理：

1. 读取事件中的 \`encryptJobId\`、基础岗位信息和触发原因。
2. 如事件信息不足，再调用 \`boss_helper_jobs_detail\` 获取完整职位描述。
3. 必要时结合 \`boss_helper_resume_get\`，确认岗位和简历是否真实匹配。
4. 调用 \`boss_helper_jobs_review\` 提交结构化决策：
   - \`accepted\`
   - \`rating\`
   - \`reason\`
   - \`positive\`
   - \`negative\`
   - \`greeting\`（只在接受时填写）
5. 如果返回 \`review-not-found\`，不要盲重试，先重新读取事件和岗位上下文。

建议：

- 审核理由尽量具体，避免“感觉不错”这类空泛结论。
- 拒绝时不需要生成招呼语。
- 接受时的招呼语要基于岗位与简历匹配点，而不是通用模板。
`
}

/**
 * @param {{
 *   contextService: ReturnType<import('./context.mjs').createAgentContextService>,
 * }} services
 * @returns {McpResourceDefinition[]}
 */
export function createResourceDefinitions({ contextService }) {
  const { buildBridgeContextResource } = contextService

  return [
    {
      uri: 'boss-helper://guides/autonomy-workflow',
      name: 'Boss Helper Autonomy Workflow',
      description: '推荐的自主投递调用顺序、观察点和恢复策略。',
      mimeType: 'text/markdown',
      read: async () => makeResourceContent(
        'boss-helper://guides/autonomy-workflow',
        'text/markdown',
        buildAutonomyWorkflowResource(),
      ),
    },
    {
      uri: 'boss-helper://guides/review-loop',
      name: 'Boss Helper Review Loop',
      description: '处理 job-pending-review 事件的外部审核闭环说明。',
      mimeType: 'text/markdown',
      read: async () => makeResourceContent(
        'boss-helper://guides/review-loop',
        'text/markdown',
        buildReviewLoopResource(),
      ),
    },
    {
      uri: 'boss-helper://runtime/bridge-context',
      name: 'Boss Helper Bridge Context',
      description: '当前 bridge/relay 就绪情况、推荐工具和下一步建议。',
      mimeType: 'application/json',
      read: async () => makeResourceContent(
        'boss-helper://runtime/bridge-context',
        'application/json',
        JSON.stringify(await buildBridgeContextResource(), null, 2),
      ),
    },
  ]
}