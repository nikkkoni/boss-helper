// @ts-check

/** @typedef {import('../types.d.ts').McpPromptDefinition} McpPromptDefinition */

/**
 * @param {string} description
 * @param {string} text
 * @returns {{ description: string, messages: import('../types.d.ts').McpPromptMessage[] }}
 */
function makePromptResult(description, text) {
  return {
    description,
    messages: [
      {
        /** @type {'user'} */
        role: 'user',
        content: {
          /** @type {'text'} */
          type: 'text',
          text,
        },
      },
    ],
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item).trim()).filter(Boolean)
}

function getPromptArg(args, name, fallback = '') {
  const value = args?.[name]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function joinPromptDetails(values, fallback) {
  const items = Array.isArray(values)
    ? normalizeStringArray(values)
    : typeof values === 'string'
      ? values
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  return items.length > 0 ? items.join(', ') : fallback
}

function buildTargetedDeliveryPrompt(args = {}) {
  const goal = getPromptArg(args, 'goal', '未指定目标')
  const constraints = getPromptArg(args, 'constraints', '无额外约束')
  const keywords = joinPromptDetails(getPromptArg(args, 'keywords'), '无显式关键词')

  return `你现在要把 Boss Helper 当作求职执行器，而不是简单的远程按钮。

目标：${goal}
约束：${constraints}
优先关键词：${keywords}

请按下面顺序工作：

1. 先调用 \`boss_helper_health\`、\`boss_helper_status\`、\`boss_helper_agent_context\`，确认 bridge、relay、页面上下文和推荐下一步。
2. 如果你还不确定环境是否已经搭好，优先插入一次 \`boss_helper_bootstrap_guide\`，确认当前缺的是 bridge、relay、extension ID、Boss 页还是登录/风控前置条件。
3. 如果当前页面不在目标搜索场景，调用 \`boss_helper_navigate\`。
4. 用 \`boss_helper_jobs_list\` 找候选岗位，只对少量高价值岗位调用 \`boss_helper_jobs_detail\`。
5. 用 \`boss_helper_resume_get\` 校验岗位和真实简历的匹配度。
6. 调用 \`boss_helper_plan_preview\` 先拿到只读执行预演，确认哪些岗位会被跳过、哪些仍需审核。
7. 只有在明确选中岗位后，才调用 \`boss_helper_start\`，并传入明确的 \`jobIds\`。
8. 运行中优先用 \`boss_helper_wait_for_event\` 或 \`boss_helper_events_recent\` 观察结果。
9. 如果收到 \`job-pending-review\`，必须完成 \`boss_helper_jobs_review\` 的结构化审核闭环。
10. 遇到 \`relay-not-connected\`、\`target-tab-not-found\`、\`validation-failed\` 时，先自我修正上下文或参数，再继续执行。

每一步都先说明你的判断依据，再调用工具。不要无条件对整页岗位直接执行 \`boss_helper_start\`。`
}

function buildReviewClosurePrompt(args = {}) {
  const policy = getPromptArg(args, 'policy', '优先高匹配、低风险岗位')
  const greetingStyle = getPromptArg(args, 'greetingStyle', '简洁、职业、贴合岗位亮点')

  return `你正在处理 Boss Helper 的 \`job-pending-review\` 事件。

审核策略：${policy}
招呼语风格：${greetingStyle}

请按下面闭环执行：

1. 从事件里提取 \`encryptJobId\` 和当前岗位上下文。
2. 如信息不完整，调用 \`boss_helper_jobs_detail\`；如需要确认履历匹配，再调用 \`boss_helper_resume_get\`。
3. 基于真实岗位描述做明确结论，而不是泛化判断。
4. 调用 \`boss_helper_jobs_review\` 时，必须提交 \`accepted\`、\`rating\`、\`reason\`、\`positive\`、\`negative\`。
5. 只有在 \`accepted=true\` 时才附带 \`greeting\`，且内容要体现岗位与简历的真实匹配点。
6. 如果返回 \`review-not-found\`，说明事件已失效或被处理，先刷新上下文，不要盲重试同一请求。

你的输出重点是：给出可追溯的审核依据，并确保 tool 参数结构完整。`
}

/** @returns {McpPromptDefinition[]} */
export function createPromptDefinitions() {
  return [
    {
      name: 'boss_helper_targeted_delivery',
      description: '生成一段先观察再执行的定向投递工作流提示。',
      arguments: [
        {
          name: 'goal',
          description: '目标岗位、领域或求职结果，例如“上海前端岗位，优先 Vue”。',
          required: true,
        },
        {
          name: 'constraints',
          description: '额外约束，例如城市、薪资、公司类型或排除项。',
        },
        {
          name: 'keywords',
          description: '优先关注的关键词，逗号分隔即可。',
        },
      ],
      handler: async (args) => makePromptResult(
        'Boss Helper 定向投递提示模板',
        buildTargetedDeliveryPrompt(args),
      ),
    },
    {
      name: 'boss_helper_review_closure',
      description: '生成处理 job-pending-review 事件的审核闭环提示。',
      arguments: [
        {
          name: 'policy',
          description: '审核策略，例如“优先稳定性、少量高匹配岗位”。',
        },
        {
          name: 'greetingStyle',
          description: '通过审核时招呼语的风格，例如“简洁职业、不要模板腔”。',
        },
      ],
      handler: async (args) => makePromptResult(
        'Boss Helper 外部审核闭环提示模板',
        buildReviewClosurePrompt(args),
      ),
    },
  ]
}