// Shared agent protocol constants for both extension code and Node scripts.
export const AGENT_PROTOCOL_VERSION = 1

export const BOSS_HELPER_AGENT_SUGGESTED_ACTIONS = Object.freeze([
	'continue',
	'navigate',
	'refresh-page',
	'stop',
	'wait-login',
	'resume',
	'retry',
	'fix-input',
	'reconnect-relay',
])

const bossHelperAgentResponseMetaByCode = Object.freeze({
	'already-running': { retryable: false, suggestedAction: 'continue' },
	'blocking-modal': { retryable: true, suggestedAction: 'refresh-page' },
	'boss-page-not-found': { retryable: true, suggestedAction: 'navigate' },
	'bridge-request-failed': { retryable: true, suggestedAction: 'retry' },
	'bridge-server-error': { retryable: true, suggestedAction: 'retry' },
	'bridge-timeout': { retryable: true, suggestedAction: 'retry' },
	'captcha-required': { retryable: false, suggestedAction: 'stop' },
	'chat-send-failed': { retryable: true, suggestedAction: 'retry' },
	'command-request-failed': { retryable: true, suggestedAction: 'retry' },
	'controller-error': { retryable: true, suggestedAction: 'refresh-page' },
	'delivery-limit-reached': { retryable: false, suggestedAction: 'stop' },
	'empty-config-patch': { retryable: false, suggestedAction: 'fix-input' },
	'empty-response': { retryable: true, suggestedAction: 'refresh-page' },
	'event-request-failed': { retryable: true, suggestedAction: 'retry' },
	'event-stream-closed': { retryable: true, suggestedAction: 'retry' },
	'event-timeout': { retryable: true, suggestedAction: 'retry' },
	'events-history-unavailable': { retryable: true, suggestedAction: 'retry' },
	'high-risk-action-confirmation-required': { retryable: false, suggestedAction: 'fix-input' },
	'invalid-agent-event': { retryable: false, suggestedAction: 'fix-input' },
	'invalid-batch-command-item': { retryable: false, suggestedAction: 'fix-input' },
	'invalid-batch-commands': { retryable: false, suggestedAction: 'fix-input' },
	'invalid-command': { retryable: false, suggestedAction: 'fix-input' },
	'job-detail-load-failed': { retryable: true, suggestedAction: 'retry' },
	'job-detail-unavailable': { retryable: true, suggestedAction: 'refresh-page' },
	'job-not-found': { retryable: false, suggestedAction: 'fix-input' },
	'login-required': { retryable: false, suggestedAction: 'wait-login' },
	'mcp-tool-failed': { retryable: true, suggestedAction: 'retry' },
	'missing-chat-target': { retryable: false, suggestedAction: 'fix-input' },
	'missing-content': { retryable: false, suggestedAction: 'fix-input' },
	'missing-conversation-id': { retryable: false, suggestedAction: 'fix-input' },
	'missing-form-uid': { retryable: false, suggestedAction: 'fix-input' },
	'missing-job-id': { retryable: false, suggestedAction: 'fix-input' },
	'navigate-invalid': { retryable: false, suggestedAction: 'fix-input' },
	'not-paused': { retryable: false, suggestedAction: 'continue' },
	'not-running': { retryable: false, suggestedAction: 'continue' },
	'page-bridge-error': { retryable: true, suggestedAction: 'refresh-page' },
	'page-not-initialized': { retryable: true, suggestedAction: 'refresh-page' },
	'page-timeout': { retryable: true, suggestedAction: 'refresh-page' },
	'paused': { retryable: false, suggestedAction: 'resume' },
	'relay-bootstrap-requires-https': { retryable: false, suggestedAction: 'fix-input' },
	'relay-not-connected': { retryable: true, suggestedAction: 'reconnect-relay' },
	'request-body-too-large': { retryable: false, suggestedAction: 'fix-input' },
	'resume-load-failed': { retryable: true, suggestedAction: 'refresh-page' },
	'risk-warning': { retryable: false, suggestedAction: 'stop' },
	'selector-health-failed': { retryable: true, suggestedAction: 'refresh-page' },
	'tab-forward-failed': { retryable: true, suggestedAction: 'refresh-page' },
	'target-tab-not-found': { retryable: true, suggestedAction: 'navigate' },
	'unauthorized-bridge-token': { retryable: false, suggestedAction: 'stop' },
	'unsupported-page': { retryable: true, suggestedAction: 'navigate' },
	'validation-failed': { retryable: false, suggestedAction: 'fix-input' },
})

function normalizeBossHelperAgentResponseMeta(value) {
	if (!value || typeof value !== 'object') {
		return {}
	}

	const meta = {}
	if (typeof value.retryable === 'boolean') {
		meta.retryable = value.retryable
	}
	if (
		typeof value.suggestedAction === 'string'
		&& BOSS_HELPER_AGENT_SUGGESTED_ACTIONS.includes(value.suggestedAction)
	) {
		meta.suggestedAction = value.suggestedAction
	}
	return meta
}

export function resolveBossHelperAgentErrorMeta(code, overrides = undefined) {
	const base = typeof code === 'string' ? bossHelperAgentResponseMetaByCode[code] ?? {} : {}
	return {
		...base,
		...normalizeBossHelperAgentResponseMeta(overrides),
	}
}
