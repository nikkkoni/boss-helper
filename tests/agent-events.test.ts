import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: loggerMock,
}))

import {
  createBossHelperAgentEvent,
  emitBossHelperAgentEvent,
  onBossHelperAgentEvent,
} from '@/pages/zhipin/hooks/agentEvents'

describe('agentEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('continues notifying later listeners when one listener throws', () => {
    const failing = vi.fn(() => {
      throw new Error('boom')
    })
    const succeeding = vi.fn()

    const stopFailing = onBossHelperAgentEvent(failing)
    const stopSucceeding = onBossHelperAgentEvent(succeeding)

    emitBossHelperAgentEvent(
      createBossHelperAgentEvent({
        message: 'event',
        type: 'job-started',
      }),
    )

    expect(failing).toHaveBeenCalledTimes(1)
    expect(succeeding).toHaveBeenCalledTimes(1)
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Boss helper agent event listener failed',
      expect.any(Error),
    )

    stopFailing()
    stopSucceeding()
  })
})
