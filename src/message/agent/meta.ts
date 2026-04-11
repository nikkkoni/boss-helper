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
