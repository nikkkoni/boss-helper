/* c8 ignore start */
import type { BossHelperAgentJobSummary } from './jobs'

export type BossHelperAgentPlanDecision =
  | 'ready'
  | 'skip'
  | 'missing-info'
  | 'needs-manual-review'
  | 'needs-external-review'

export type BossHelperAgentPlanStage =
  | 'current-status'
  | 'filters'
  | 'load-card'
  | 'ai-filtering'
  | 'ready'

export interface BossHelperAgentPlanIssue {
  code: string
  message: string
  severity: 'info' | 'warn' | 'error'
  step?: string
}

export interface BossHelperAgentPlanConfigSummary {
  aiFilteringEnabled: boolean
  aiFilteringExternal: boolean
  aiFilteringModelReady: boolean
  aiFilteringThreshold: number | null
  aiGreetingEnabled: boolean
  aiGreetingModelReady: boolean
  resetFiltered: boolean
  targetJobIds: string[]
}

export interface BossHelperAgentPlanPreviewItem {
  decision: BossHelperAgentPlanDecision
  explain: string
  issues: BossHelperAgentPlanIssue[]
  job: BossHelperAgentJobSummary
  remainingSteps: string[]
  stage: BossHelperAgentPlanStage
}
/* c8 ignore stop */

export interface BossHelperAgentPlanPreviewSummary {
  missingInfoCount: number
  needsExternalReviewCount: number
  needsManualReviewCount: number
  readyCount: number
  scopedCount: number
  skipCount: number
  totalOnPage: number
  unknownTargetJobIds: string[]
}

export interface BossHelperAgentPlanPreviewData {
  config: BossHelperAgentPlanConfigSummary
  items: BossHelperAgentPlanPreviewItem[]
  summary: BossHelperAgentPlanPreviewSummary
}
