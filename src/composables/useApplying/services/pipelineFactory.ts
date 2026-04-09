import type { Pipeline } from '../type'

import { handles } from '../handles'
import { createLoadCardStep, createResolveAmapStep } from './amapStep'
import { compilePipeline, withStepName } from './pipelineCompiler'

export async function createApplyingPipeline() {
  const h = handles()
  const loadCard = createLoadCardStep()
  const resolveAmap = createResolveAmapStep()
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
      ],
      withStepName('aiFiltering', h.aiFiltering()),
      withStepName('greeting', h.greeting()),
    ],
  ]

  return compilePipeline(pipeline)
}
