export type BossHelperAgentAuditCategory =
	| 'execution'
	| 'business'
	| 'risk'
	| 'page'
	| 'config'
	| 'system'

export type BossHelperAgentAuditOutcome =
	| 'delivered'
	| 'skipped'
	| 'failed'
	| 'interrupted'
	| 'info'

export interface BossHelperAgentAudit {
	category: BossHelperAgentAuditCategory
	outcome: BossHelperAgentAuditOutcome
	reasonCode: string
}

export interface BossHelperAgentAuditClassifierInput {
	detail?: Record<string, unknown> | null
	fallback?: string
	message?: string
	status?: string
	step?: string
}

export const BOSS_HELPER_AGENT_AUDIT_CATEGORIES: readonly BossHelperAgentAuditCategory[]
export const BOSS_HELPER_AGENT_AUDIT_OUTCOMES: readonly BossHelperAgentAuditOutcome[]

export function normalizeBossHelperAgentAudit(
	value: unknown,
	fallback?: Partial<BossHelperAgentAudit>,
): BossHelperAgentAudit | null

export function resolveBossHelperAgentAuditReasonCode(
	input?: BossHelperAgentAuditClassifierInput,
): string

export function resolveBossHelperAgentLogAudit(
	input?: BossHelperAgentAuditClassifierInput,
): BossHelperAgentAudit
