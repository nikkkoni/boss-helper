export const BOSS_HELPER_AGENT_AUDIT_CATEGORIES = Object.freeze([
	'execution',
	'business',
	'risk',
	'page',
	'config',
	'system',
])

export const BOSS_HELPER_AGENT_AUDIT_OUTCOMES = Object.freeze([
	'delivered',
	'skipped',
	'failed',
	'interrupted',
	'info',
])

const STEP_REASON_CODES = Object.freeze({
	activityFilter: 'activity-filter',
	aiFiltering: 'ai-filtering',
	amap: 'amap-filter',
	communicated: 'duplicate-communicated',
	company: 'company-filter',
	companySizeRange: 'company-size-filter',
	goldHunterFilter: 'gold-hunter-filter',
	greeting: 'greeting-failed',
	hrPosition: 'hr-position-filter',
	jobAddress: 'job-address-filter',
	jobContent: 'job-content-filter',
	jobFriendStatus: 'friend-status-filter',
	jobTitle: 'job-title-filter',
	loadCard: 'job-card-unavailable',
	resolveAmap: 'amap-unavailable',
	salaryRange: 'salary-filter',
	sameCompanyFilter: 'duplicate-same-company',
	sameHrFilter: 'duplicate-same-hr',
})

const STATUS_REASON_CODES = Object.freeze({
	AI筛选: 'ai-filtering',
	公司名筛选: 'company-filter',
	公司规模筛选: 'company-size-filter',
	好友状态: 'friend-status-filter',
	工作内容筛选: 'job-content-filter',
	工作地址筛选: 'job-address-filter',
	岗位名筛选: 'job-title-filter',
	打招呼出错: 'greeting-failed',
	投递出错: 'apply-failed',
	投递成功: 'delivery-succeeded',
	操作频繁: 'rate-limited',
	活跃度过滤: 'activity-filter',
	消息: 'run-note',
	猎头过滤: 'gold-hunter-filter',
	未知错误: 'unexpected-error',
	薪资筛选: 'salary-filter',
	达到限制: 'delivery-limit-interrupted',
	重复沟通: 'duplicate-communicated',
	Hr职位筛选: 'hr-position-filter',
})

const RISK_STEPS = new Set([
	'communicated',
	'sameCompanyFilter',
	'sameHrFilter',
	'jobFriendStatus',
])

const BUSINESS_STEPS = new Set([
	'activityFilter',
	'company',
	'companySizeRange',
	'goldHunterFilter',
	'hrPosition',
	'jobAddress',
	'jobContent',
	'jobTitle',
	'salaryRange',
])

const PAGE_STEPS = new Set([
	'greeting',
	'loadCard',
])

const CONFIG_STEPS = new Set([
	'aiFiltering',
	'amap',
	'resolveAmap',
])

function trimString(value, fallback = '') {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function hasMessageToken(message, pattern) {
	return typeof message === 'string' && pattern.test(message)
}

function isAiFilteringConfigIssue(step, message, detail) {
	const detailMessage = typeof detail?.errorMessage === 'string' ? detail.errorMessage : ''
	return (
		step === 'aiFiltering'
		&& /没有找到AI筛选的模型|模型不可用|未配置模型/.test(`${message}\n${detailMessage}`)
	)
}

function isAmapConfigIssue(step, message, detail) {
	const detailMessage = typeof detail?.errorMessage === 'string' ? detail.errorMessage : ''
	return (
		(step === 'resolveAmap' || step === 'amap' || step === 'jobAddress')
		&& /高德地图未初始化|高德地图api数据异常|amap/i.test(`${message}\n${detailMessage}`)
	)
}

function isPageFailure(step, message, status) {
	return (
		PAGE_STEPS.has(step)
		|| hasMessageToken(message, /没有获取到uid|没有获取到token|卡片读取失败|详情.*失败|页面/i)
		|| (status === '投递出错' && hasMessageToken(message, /token|uid|登录|页面/i))
		|| (status === '打招呼出错' && hasMessageToken(message, /uid|页面|会话/i))
	)
}

function normalizeAuditField(value, allowedValues, fallback) {
	if (typeof value === 'string' && allowedValues.includes(value)) {
		return value
	}
	if (typeof fallback === 'string' && allowedValues.includes(fallback)) {
		return fallback
	}
	return null
}

export function normalizeBossHelperAgentAudit(value, fallback = undefined) {
	if (!value || typeof value !== 'object') {
		return null
	}

	const audit = value
	const category = normalizeAuditField(
		audit.category,
		BOSS_HELPER_AGENT_AUDIT_CATEGORIES,
		fallback?.category,
	)
	const outcome = normalizeAuditField(
		audit.outcome,
		BOSS_HELPER_AGENT_AUDIT_OUTCOMES,
		fallback?.outcome,
	)
	const reasonCode = trimString(audit.reasonCode, trimString(fallback?.reasonCode, ''))

	if (!category || !outcome || !reasonCode) {
		return null
	}

	return {
		category,
		outcome,
		reasonCode,
	}
}

export function resolveBossHelperAgentAuditReasonCode(input = {}) {
	const detail = input.detail && typeof input.detail === 'object' ? input.detail : null
	const fallback = trimString(input.fallback, 'unknown-audit')
	const message = trimString(input.message, '')
	const status = trimString(input.status, '未知状态')
	const step = trimString(input.step, '')

	if (typeof detail?.guardrailCode === 'string' && detail.guardrailCode) {
		return detail.guardrailCode
	}

	if (isAiFilteringConfigIssue(step, message, detail)) {
		return 'ai-filtering-model-missing'
	}

	if (isAmapConfigIssue(step, message, detail)) {
		return 'amap-config-unavailable'
	}

	if (STEP_REASON_CODES[step]) {
		return STEP_REASON_CODES[step]
	}

	if (STATUS_REASON_CODES[status]) {
		return STATUS_REASON_CODES[status]
	}

	if (typeof detail?.errorName === 'string' && detail.errorName) {
		return detail.errorName
	}

	return fallback
}

export function resolveBossHelperAgentLogAudit(input = {}) {
	const detail = input.detail && typeof input.detail === 'object' ? input.detail : null
	const status = trimString(input.status, '未知状态')
	const message = trimString(input.message, trimString(input.fallback, status))
	const step = trimString(input.step, '')
	const dangerStatuses = new Set(['打招呼出错', '投递出错', '未知错误'])

	if (status === '投递成功') {
		return {
			category: 'execution',
			outcome: 'delivered',
			reasonCode: 'delivery-succeeded',
		}
	}

	if (status === '消息') {
		return {
			category: 'execution',
			outcome: 'info',
			reasonCode: 'run-note',
		}
	}

	if (status === '达到限制' || status === '操作频繁' || typeof detail?.guardrailCode === 'string') {
		return {
			category: 'risk',
			outcome: 'interrupted',
			reasonCode: resolveBossHelperAgentAuditReasonCode({
				detail,
				fallback: input.fallback,
				message,
				status,
				step,
			}),
		}
	}

	if (status === '重复沟通' || status === '好友状态' || RISK_STEPS.has(step)) {
		return {
			category: 'risk',
			outcome: 'skipped',
			reasonCode: resolveBossHelperAgentAuditReasonCode({
				detail,
				fallback: input.fallback,
				message,
				status,
				step,
			}),
		}
	}

	if (isAiFilteringConfigIssue(step, message, detail) || isAmapConfigIssue(step, message, detail)) {
		return {
			category: 'config',
			outcome: dangerStatuses.has(status) ? 'failed' : 'skipped',
			reasonCode: resolveBossHelperAgentAuditReasonCode({
				detail,
				fallback: input.fallback,
				message,
				status,
				step,
			}),
		}
	}

	if (BUSINESS_STEPS.has(step) || (STATUS_REASON_CODES[status] && !dangerStatuses.has(status))) {
		return {
			category: 'business',
			outcome: 'skipped',
			reasonCode: resolveBossHelperAgentAuditReasonCode({
				detail,
				fallback: input.fallback,
				message,
				status,
				step,
			}),
		}
	}

	if (isPageFailure(step, message, status)) {
		return {
			category: 'page',
			outcome: 'failed',
			reasonCode: resolveBossHelperAgentAuditReasonCode({
				detail,
				fallback: input.fallback,
				message,
				status,
				step,
			}),
		}
	}

	if (CONFIG_STEPS.has(step)) {
		return {
			category: 'config',
			outcome: 'failed',
			reasonCode: resolveBossHelperAgentAuditReasonCode({
				detail,
				fallback: input.fallback,
				message,
				status,
				step,
			}),
		}
	}

	return {
		category: 'system',
		outcome: dangerStatuses.has(status) ? 'failed' : 'info',
		reasonCode: resolveBossHelperAgentAuditReasonCode({
			detail,
			fallback: input.fallback,
			message,
			status,
			step,
		}),
	}
}
