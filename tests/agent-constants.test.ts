import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('agent constants', () => {
  it('prefers injected bridge token when provided', async () => {
    vi.stubGlobal('__BOSS_HELPER_AGENT_BRIDGE_TOKEN__', 'custom-token')
    const { BOSS_HELPER_AGENT_BRIDGE_TOKEN } = await import('@/message/agent/constants')

    expect(BOSS_HELPER_AGENT_BRIDGE_TOKEN).toBe('custom-token')
  })

  it('falls back to default bridge token', async () => {
    vi.stubGlobal('__BOSS_HELPER_AGENT_BRIDGE_TOKEN__', undefined)
    const { BOSS_HELPER_AGENT_BRIDGE_TOKEN } = await import('@/message/agent/constants')

    expect(BOSS_HELPER_AGENT_BRIDGE_TOKEN).toBe('boss-helper-dev-bridge-token')
  })
})
