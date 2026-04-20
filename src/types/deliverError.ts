export type BossHelperErrorState = 'warning' | 'danger'

export class BossHelperError extends Error {
  state: BossHelperErrorState
  error_type: 'boss-helper'

  constructor(message: string, state: BossHelperErrorState = 'warning', options?: ErrorOptions) {
    super(message, options)
    this.state = state
    this.error_type = 'boss-helper'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface AIFilteringScoreDetail {
  accepted?: boolean
  negative?: Array<{ reason: string; score: number }>
  positive?: Array<{ reason: string; score: number }>
  rating?: number
  reason?: string
  source?: 'internal' | 'external'
  threshold?: number
}

function createDeliverErrorClass(name: string, state: BossHelperErrorState = 'warning') {
  return class extends BossHelperError {
    constructor(message: string, options?: ErrorOptions) {
      super(message, state, options)
      this.name = name
    }
  }
}

export const RepeatError = createDeliverErrorClass('重复沟通')
export const JobTitleError = createDeliverErrorClass('岗位名筛选')
export const CompanyNameError = createDeliverErrorClass('公司名筛选')
export const SalaryError = createDeliverErrorClass('薪资筛选')
export const CompanySizeError = createDeliverErrorClass('公司规模筛选')
export const JobDescriptionError = createDeliverErrorClass('工作内容筛选')
export const HrPositionError = createDeliverErrorClass('Hr职位筛选')
export const JobAddressError = createDeliverErrorClass('工作地址筛选')
export const AmapError = createDeliverErrorClass('高德地图筛选')

export class AIFilteringError extends BossHelperError {
  aiScore?: AIFilteringScoreDetail

  constructor(message: string, aiScore?: AIFilteringScoreDetail, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = 'AI筛选'
    this.aiScore = aiScore
  }
}

export const FriendStatusError = createDeliverErrorClass('好友状态')
export const ActivityError = createDeliverErrorClass('活跃度过滤')
export const GoldHunterError = createDeliverErrorClass('猎头过滤')
export const UnknownError = createDeliverErrorClass('未知错误', 'danger')
export const PublishError = createDeliverErrorClass('投递出错', 'danger')
export const LimitError = createDeliverErrorClass('达到限制', 'danger')
export const RateLimitError = createDeliverErrorClass('操作频繁', 'danger')
