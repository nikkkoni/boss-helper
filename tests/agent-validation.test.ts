import { describe, expect, it } from 'vitest'

import {
  getBossHelperAgentEventPortName,
  hasValidBossHelperAgentBridgeToken,
  hasValidBossHelperAgentEventPort,
  isBossHelperSupportedJobUrl,
} from '@/message/agent/validation'
import { BOSS_HELPER_AGENT_BRIDGE_TOKEN } from '@/message/agent/constants'

describe('agent validation', () => {
  it('validates bridge token payloads', () => {
    expect(hasValidBossHelperAgentBridgeToken({ bridgeToken: BOSS_HELPER_AGENT_BRIDGE_TOKEN })).toBe(
      true,
    )
    expect(hasValidBossHelperAgentBridgeToken({ bridgeToken: 'wrong' })).toBe(false)
    expect(hasValidBossHelperAgentBridgeToken(null)).toBe(false)
  })

  it('builds event port names and validates port inputs', () => {
    const name = getBossHelperAgentEventPortName()
    expect(hasValidBossHelperAgentEventPort(name)).toBe(true)
    expect(hasValidBossHelperAgentEventPort(`${name}-extra`)).toBe(false)
    expect(hasValidBossHelperAgentEventPort(null)).toBe(false)

    const customName = getBossHelperAgentEventPortName('token-2')
    expect(customName.endsWith('token-2')).toBe(true)
  })

  it('checks supported job URLs with safe fallbacks', () => {
    expect(isBossHelperSupportedJobUrl('https://www.zhipin.com/web/geek/job')).toBe(true)
    expect(isBossHelperSupportedJobUrl('https://www.zhipin.com/web/geek/job/123')).toBe(true)
    expect(isBossHelperSupportedJobUrl('https://www.zhipin.com/web/geek/other')).toBe(false)
    expect(isBossHelperSupportedJobUrl('bad-url')).toBe(false)
    expect(isBossHelperSupportedJobUrl(undefined)).toBe(false)
  })
})
