// @vitest-environment jsdom
import { describe, it } from 'vitest'

describe('module import coverage', () => {
  it('imports type-only agent modules', async () => {
    await import('@/message/agent')
    await import('@/message/agent/controller')
    await import('@/message/agent/jobs')
    await import('@/message/agent/meta')
    await import('@/message/agent/planning')
    await import('@/message/agent/response')
    await import('@/message/agent/responseMap')
    await import('@/message/agent/types')
  })

  it('imports shared type modules without errors', async () => {
    await import('@/site-adapters/type')
    await import('@/composables/useApplying/services/filterSteps')
  })
})
