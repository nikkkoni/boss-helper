// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { axiosGetMock, axiosMock, mockCookieGet, mockElMessageError } = vi.hoisted(() => ({
  axiosGetMock: vi.fn(),
  axiosMock: vi.fn(),
  mockCookieGet: vi.fn(),
  mockElMessageError: vi.fn(),
}))

vi.mock('#imports', () => ({
  browser: {
    cookies: {
      get: mockCookieGet,
    },
  },
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: mockElMessageError,
  },
}))

vi.mock('axios', () => {
  const axios = Object.assign(axiosMock, {
    get: axiosGetMock,
  })
  return {
    default: axios,
  }
})

import {
  errorHandle,
  parseFiltering,
  rangeMatch,
  rangeMatchFormat,
  requestBossData,
  requestCard,
  requestDetail,
  sendPublishReq,
} from '@/composables/useApplying/utils'
import {
  GreetError,
  LimitError,
  PublishError,
  RateLimitError,
} from '@/types/deliverError'

function createJob(overrides: Partial<bossZpJobItemData> = {}) {
  return {
    encryptJobId: 'job-1',
    securityId: 'security-1',
    ...overrides,
  } as bossZpJobItemData
}

function createCard(overrides: Partial<bossZpCardData> = {}) {
  return {
    encryptUserId: 'boss-user-1',
    securityId: 'security-1',
    ...overrides,
  } as bossZpCardData
}

describe('useApplying utils', () => {
  beforeEach(() => {
    document.cookie = 'bst=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    axiosGetMock.mockReset()
    axiosMock.mockReset()
    mockCookieGet.mockReset()
    mockCookieGet.mockResolvedValue(undefined)
    mockElMessageError.mockReset()
    window.Cookie = undefined as unknown as Window['Cookie']
  })

  it('reads bst token from page cookie helpers before extension cookies API', async () => {
    axiosMock.mockResolvedValue({ data: { code: 0, zpData: { ok: true } } })

    window.Cookie = {
      get(name: string) {
        return name === 'bst' ? 'page-cookie-token' : ''
      },
    } as Window['Cookie']

    await sendPublishReq(createJob())

    expect(axiosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Zp_token: 'page-cookie-token',
        }),
      }),
    )
  })

  it('reads bst token from document.cookie and extension cookies fallback', async () => {
    axiosMock.mockResolvedValue({ data: { code: 0, zpData: { ok: true } } })

    document.cookie = 'bst=document-cookie-token; path=/'
    await sendPublishReq(createJob({ encryptJobId: 'job-cookie' }))
    expect(axiosMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Zp_token: 'document-cookie-token' }),
      }),
    )

    document.cookie = 'bst=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    mockCookieGet.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ value: 'extension-cookie-token' })
    await sendPublishReq(createJob({ encryptJobId: 'job-extension' }))

    expect(mockCookieGet).toHaveBeenNthCalledWith(1, {
      name: 'bst',
      url: 'https://www.zhipin.com',
    })
    expect(mockCookieGet).toHaveBeenNthCalledWith(2, {
      name: 'bst',
      url: 'https://zhipin.com',
    })
    expect(axiosMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Zp_token: 'extension-cookie-token' }),
      }),
    )
  })

  it('fails when no boss token is available', async () => {
    await expect(sendPublishReq(createJob())).rejects.toBeInstanceOf(PublishError)
    expect(mockElMessageError).toHaveBeenCalledWith('没有获取到token,请刷新重试')
  })

  it('returns cards and details when boss APIs succeed', async () => {
    document.cookie = 'bst=detail-token; path=/'
    axiosGetMock
      .mockResolvedValueOnce({
        data: {
          code: 0,
          zpData: {
            jobCard: { jobName: 'Frontend Engineer' },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          code: 0,
          zpData: {
            job: { name: 'detail' },
          },
        },
      })

    await expect(requestCard({ lid: 'lid-1', securityId: 'security-1' })).resolves.toEqual(
      expect.objectContaining({ jobName: 'Frontend Engineer' }),
    )
    await expect(requestDetail({ lid: 'lid-1', securityId: 'security-1' })).resolves.toEqual({
      job: { name: 'detail' },
    })

    expect(axiosGetMock).toHaveBeenNthCalledWith(
      2,
      'https://www.zhipin.com/wapi/zpgeek/job/detail.json',
      expect.objectContaining({
        headers: { Zp_token: 'detail-token' },
        params: expect.objectContaining({
          _: expect.any(Number),
          lid: 'lid-1',
          securityId: 'security-1',
        }),
      }),
    )
  })

  it('surfaces requestCard and requestDetail API failures', async () => {
    document.cookie = 'bst=detail-token; path=/'
    axiosGetMock
      .mockResolvedValueOnce({
        data: {
          code: 1,
          message: '卡片失败',
          zpData: null,
        },
      })
      .mockResolvedValueOnce({
        data: {
          code: 2,
          message: '详情失败',
          zpData: null,
        },
      })

    await expect(requestCard({ lid: 'lid-1', securityId: 'security-1' })).rejects.toEqual(
      expect.objectContaining({
        message: '获取职位卡片失败: 卡片失败',
      }),
    )
    await expect(requestDetail({ lid: 'lid-1', securityId: 'security-1' })).rejects.toEqual(
      expect.objectContaining({
        message: '获取职位详情失败: 详情失败',
      }),
    )
  })

  it('retries sendPublishReq after generic failures and returns success data', async () => {
    document.cookie = 'bst=retry-token; path=/'
    axiosMock
      .mockRejectedValueOnce(new Error('网络错误'))
      .mockResolvedValueOnce({ data: { code: 0, zpData: { ok: true } } })

    await expect(sendPublishReq(createJob())).resolves.toEqual({ code: 0, zpData: { ok: true } })
    expect(axiosMock).toHaveBeenCalledTimes(2)
  })

  it('handles all publish response error branches', async () => {
    document.cookie = 'bst=publish-token; path=/'

    axiosMock.mockResolvedValueOnce({
      data: {
        code: 1,
        message: '今日上限',
        zpData: {
          bizData: {
            chatRemindDialog: {
              content: '您今天已与150位BOSS沟通',
            },
          },
        },
      },
    })
    await expect(sendPublishReq(createJob())).rejects.toBeInstanceOf(LimitError)

    axiosMock.mockResolvedValueOnce({
      data: {
        code: 1,
        message: '频率限制',
        zpData: {
          bizData: {
            chatRemindDialog: {
              content: '操作过于频繁，请稍后再试',
            },
          },
        },
      },
    })
    await expect(sendPublishReq(createJob())).rejects.toBeInstanceOf(RateLimitError)

    axiosMock.mockResolvedValueOnce({
      data: {
        code: 1,
        message: '普通错误',
        zpData: {
          bizData: {
            chatRemindDialog: {
              content: '普通投递失败',
            },
          },
        },
      },
    })
    await expect(sendPublishReq(createJob())).rejects.toBeInstanceOf(PublishError)

    axiosMock.mockResolvedValueOnce({
      data: {
        code: 2,
        message: '未知状态',
      },
    })
    await expect(sendPublishReq(createJob())).rejects.toEqual(
      expect.objectContaining({ message: '未知错误状态:未知状态' }),
    )
  })

  it('confirms the daily limit popup and retries publish with cid=1', async () => {
    document.cookie = 'bst=confirm-token; path=/'
    axiosMock
      .mockResolvedValueOnce({
        data: {
          code: 1,
          message: '触发限额',
          zpData: {
            bizData: {
              chatRemindDialog: {
                ba: 'popup-ba',
                content: '您今天已与120位BOSS沟通',
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({ data: { ok: true } })
      .mockResolvedValueOnce({ data: { code: 0, zpData: { ok: true } } })

    await expect(sendPublishReq(createJob())).resolves.toEqual({ code: 0, zpData: { ok: true } })
    expect(axiosMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.any(URLSearchParams),
        headers: { Zp_token: 'confirm-token' },
        method: 'POST',
        url: 'https://www.zhipin.com/wapi/zpCommon/actionLog/geek/chatremind.json',
      }),
    )
    expect(axiosMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        params: expect.objectContaining({ cid: 1 }),
      }),
    )
  })

  it('surfaces popup confirmation failures and exhausted retries', async () => {
    document.cookie = 'bst=confirm-token; path=/'
    axiosMock
      .mockResolvedValueOnce({
        data: {
          code: 1,
          message: '触发限额',
          zpData: {
            bizData: {
              chatRemindDialog: {
                ba: 'popup-ba',
                content: '您今天已与120位BOSS沟通',
              },
            },
          },
        },
      })
      .mockRejectedValueOnce(new Error('确认失败'))

    await expect(sendPublishReq(createJob())).rejects.toEqual(
      expect.objectContaining({ message: '投递限制确认失败]您今天已与120位BOSS沟通' }),
    )
    await expect(sendPublishReq(createJob(), '最后错误', 0)).rejects.toEqual(
      expect.objectContaining({ message: '最后错误' }),
    )
  })

  it('decrements retries when the 120-boss popup keeps reappearing', async () => {
    document.cookie = 'bst=confirm-token; path=/'
    const popupResponse = {
      data: {
        code: 1,
        message: '触发限额',
        zpData: {
          bizData: {
            chatRemindDialog: {
              ba: 'popup-ba',
              content: '您今天已与120位BOSS沟通',
            },
          },
        },
      },
    }

    axiosMock
      .mockResolvedValueOnce(popupResponse)
      .mockResolvedValueOnce({ data: { ok: true } })
      .mockResolvedValueOnce(popupResponse)
      .mockResolvedValueOnce({ data: { ok: true } })

    await expect(sendPublishReq(createJob(), undefined, 2)).rejects.toEqual(
      expect.objectContaining({ message: '重试多次失败' }),
    )
    expect(axiosMock).toHaveBeenCalledTimes(4)
  })

  it('returns boss data, retries friend-state failures, and surfaces fatal greet errors', async () => {
    document.cookie = 'bst=greet-token; path=/'
    axiosMock
      .mockResolvedValueOnce({
        data: {
          code: 1,
          message: '非好友关系',
        },
      })
      .mockResolvedValueOnce({
        data: {
          code: 0,
          zpData: {
            data: {
              bossId: 1,
            },
          },
        },
      })

    await expect(requestBossData(createCard())).resolves.toEqual({
      data: {
        bossId: 1,
      },
    })

    axiosMock.mockResolvedValueOnce({
      data: {
        code: 1,
        message: '接口故障',
      },
    })
    await expect(requestBossData(createCard())).rejects.toBeInstanceOf(GreetError)

    axiosMock.mockRejectedValueOnce(new Error('网络抖动')).mockResolvedValueOnce({
      data: {
        code: 0,
        zpData: {
          data: {
            bossId: 2,
          },
        },
      },
    })
    await expect(requestBossData(createCard())).resolves.toEqual({
      data: {
        bossId: 2,
      },
    })

    await expect(requestBossData(createCard(), '结束', 0)).rejects.toEqual(
      expect.objectContaining({ message: '结束' }),
    )
  }, 10000)

  it('formats and matches ranges across strict, loose, swapped, and invalid inputs', () => {
    expect(rangeMatchFormat([10, 20, true], 'K')).toBe('10 - 20 K 严格')
    expect(rangeMatch('', [10, 20, true])).toBe(false)
    expect(rangeMatch('no numbers', [10, 20, false])).toBe(false)
    expect(rangeMatch('10-15K', [10, 20, true])).toBe(true)
    expect(rangeMatch('15-18K', [20, 10, true])).toBe(true)
    expect(rangeMatch('15-21K', [10, 20, true])).toBe(false)
    expect(rangeMatch('18K', [10, 20, true])).toBe(true)
    expect(rangeMatch('20-10K', [9, 15, false])).toBe(true)
    expect(rangeMatch('20-26K', [10, 20, false])).toBe(true)
    expect(rangeMatch('21-22K', [10, 20, false])).toBe(false)
    expect(rangeMatch(`${'9'.repeat(400)}K`, [10, 20, false])).toBe(false)
  })

  it('parses filtering summaries and normalizes non-error values', () => {
    expect(
      parseFiltering('```json\n{"negative":[{"reason":"距离远","score":-20}],"positive":[{"reason":"双休","score":10}]}\n```'),
    ).toEqual(
      expect.objectContaining({
        rating: -10,
        message: expect.stringContaining('距离远/(20分)'),
      }),
    )

    expect(parseFiltering('{}')).toEqual(
      expect.objectContaining({
        rating: 0,
        res: {},
      }),
    )

    expect(errorHandle(new Error('boom'))).toBe('boom')
    expect(errorHandle('plain')).toBe('plain')
  })
})
