import type { Pipeline } from '../type'

import { handles, type ApplyingHandleOptions } from '../handles'
import { createLoadCardStep, createResolveAmapStep } from './amapStep'
import { compilePipeline, withStepName } from './pipelineCompiler'

export interface CreateApplyingPipelineOptions extends ApplyingHandleOptions {
  includeAiFiltering?: boolean
  includeGreeting?: boolean
}

/**
 * 组装默认投递 pipeline，并把步骤编译成 before / after 两段执行队列。
 *
 * 这里定义的是业务顺序本身：哪些过滤在投递前执行，哪些动作在投递后执行。
 */
export async function createApplyingPipeline(options: CreateApplyingPipelineOptions = {}) {
  const h = handles(options)
  const loadCard = createLoadCardStep()
  const resolveAmap = createResolveAmapStep()
  const includeAiFiltering = options.includeAiFiltering !== false
  const includeGreeting = options.includeGreeting !== false
  const pipeline: Pipeline = [
    withStepName('communicated', h.communicated()),
    withStepName('sameCompanyFilter', h.SameCompanyFilter()),
    withStepName('sameHrFilter', h.SameHrFilter()),
    withStepName('jobTitle', h.jobTitle()),
    withStepName('company', h.company()),
    withStepName('salaryRange', h.salaryRange()),
    withStepName('companySizeRange', h.companySizeRange()),
    withStepName('goldHunterFilter', h.goldHunterFilter()),
    [
      withStepName('loadCard', loadCard),
      withStepName('activityFilter', h.activityFilter()),
      withStepName('hrPosition', h.hrPosition()),
      withStepName('jobAddress', h.jobAddress()),
      withStepName('jobFriendStatus', h.jobFriendStatus()),
      withStepName('jobContent', h.jobContent()),
      [
        withStepName('resolveAmap', resolveAmap),
        withStepName('amap', h.amap()),
        includeAiFiltering ? withStepName('aiFiltering', h.aiFiltering()) : undefined,
      ],
      includeGreeting ? withStepName('greeting', h.greeting()) : undefined,
    ],
  ]

  return compilePipeline(pipeline)
}
