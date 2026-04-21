/* c8 ignore start */
import type { FormData } from '@/types/formData'

export interface BossHelperAgentConfigSnapshot {
  config: FormData
}

export interface BossHelperAgentResumeData {
  resumeData: bossZpResumeData
  resumeText: string
  userId: number | string | null
}

export interface BossHelperAgentValidationError {
  code: string
  field: string
  message: string
}

export interface BossHelperAgentConfigUpdateData extends BossHelperAgentConfigSnapshot {
  errors?: BossHelperAgentValidationError[]
}

export interface BossHelperAgentNavigateData {
  targetUrl: string
}

export type BossHelperAgentReadinessAction =
  | 'continue'
  | 'navigate'
  | 'refresh-page'
  | 'stop'
  | 'wait-login'

export type BossHelperAgentReadinessSeverity = 'info' | 'warn' | 'error'

export interface BossHelperAgentReadinessBlocker {
  code: string
  message: string
  severity: BossHelperAgentReadinessSeverity
}

export interface BossHelperAgentReadinessSignal {
  code: string
  detected: boolean
  message: string
  severity: BossHelperAgentReadinessSeverity
  selector?: string
  text?: string
}

export interface BossHelperAgentReadinessSelectorHealthCheck {
  label: string
  matchedSelectors: string[]
  missingSelectors: string[]
  mode: 'all' | 'any'
  ok: boolean
  selectors: string[]
}

export interface BossHelperAgentReadinessData {
  account: {
    loggedIn: boolean | null
    loginRequired: boolean
  }
  blockers: BossHelperAgentReadinessBlocker[]
  extension: {
    initialized: boolean
    panelMounted: boolean
    panelWrapMounted: boolean
    rootMounted: boolean
    selectorHealth: {
      checks: BossHelperAgentReadinessSelectorHealthCheck[]
      ok: boolean
      summary: string
  }
}
/* c8 ignore stop */
  page: {
    active: boolean
    controllable: boolean
    exists: boolean
    pathname: string
    routeKind: string
    supported: boolean
    title: string
    url: string
    visible: boolean
  }
  ready: boolean
  risk: {
    hasBlockingModal: boolean
    hasCaptcha: boolean
    hasRiskWarning: boolean
    signals: BossHelperAgentReadinessSignal[]
  }
  snapshotAt: string
  suggestedAction: BossHelperAgentReadinessAction
}
