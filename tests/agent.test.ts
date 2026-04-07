import { describe, expect, it } from 'vitest'

import {
  BOSS_HELPER_AGENT_CHANNEL,
  createBossHelperAgentResponse,
  isBossHelperAgentRequest,
  isBossHelperSupportedJobUrl,
} from '@/message/agent'

describe('agent helpers', () => {
  it('builds a standard agent response payload', () => {
    expect(createBossHelperAgentResponse(true, 'ok', 'done', { count: 1 })).toEqual({
      ok: true,
      code: 'ok',
      message: 'done',
      data: { count: 1 },
    })
  })

  it('recognizes supported zhipin job urls', () => {
    expect(isBossHelperSupportedJobUrl('https://www.zhipin.com/web/geek/job?query=frontend')).toBe(true)
    expect(isBossHelperSupportedJobUrl('https://www.zhipin.com/web/geek/job-recommend')).toBe(true)
    expect(isBossHelperSupportedJobUrl('https://www.zhipin.com/web/geek/jobs?page=2')).toBe(true)
    expect(isBossHelperSupportedJobUrl('https://www.zhipin.com/web/geek/chat')).toBe(false)
    expect(isBossHelperSupportedJobUrl('not-a-url')).toBe(false)
  })

  it('validates agent requests by channel and command', () => {
    expect(
      isBossHelperAgentRequest({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'jobs.list',
      }),
    ).toBe(true)

    expect(
      isBossHelperAgentRequest({
        channel: BOSS_HELPER_AGENT_CHANNEL,
        command: 'unknown.command',
      }),
    ).toBe(false)

    expect(
      isBossHelperAgentRequest({
        channel: 'other-channel',
        command: 'jobs.list',
      }),
    ).toBe(false)
  })
})