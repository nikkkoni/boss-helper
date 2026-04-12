export const AGENT_PROTOCOL_VERSION: 1

export type BossHelperAgentSuggestedAction =
	| 'continue'
	| 'navigate'
	| 'refresh-page'
	| 'stop'
	| 'wait-login'
	| 'resume'
	| 'retry'
	| 'fix-input'
	| 'reconnect-relay'

export interface BossHelperAgentResponseMeta {
	retryable?: boolean
	suggestedAction?: BossHelperAgentSuggestedAction
}

export const BOSS_HELPER_AGENT_SUGGESTED_ACTIONS: readonly BossHelperAgentSuggestedAction[]

export function resolveBossHelperAgentErrorMeta(
	code?: string | null,
	overrides?: Partial<BossHelperAgentResponseMeta>,
): BossHelperAgentResponseMeta
