// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('logger.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    document.head.innerHTML = ''
  })

  it('removes the temporary iframe and falls back when the clean console is unavailable', async () => {
    const originalCreateElement = document.createElement.bind(document)
    const createdIframes: HTMLIFrameElement[] = []

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'iframe') {
        Object.defineProperty(element, 'contentWindow', {
          configurable: true,
          value: null,
        })
        createdIframes.push(element as HTMLIFrameElement)
      }
      return element
    }) as typeof document.createElement)

    const { logger } = await import('../src/utils/logger')

    expect(() => logger.info('fallback console')).not.toThrow()
    expect(createdIframes).toHaveLength(1)
    expect(document.head.contains(createdIframes[0])).toBe(false)
  })

  it('binds group methods to the clean console instance', async () => {
    const originalCreateElement = document.createElement.bind(document)
    let consoleStub!: Console
    const groupCollapsed = vi.fn(function (this: unknown) {
      expect(this).toBe(consoleStub)
    })
    const groupEnd = vi.fn(function (this: unknown) {
      expect(this).toBe(consoleStub)
    })

    consoleStub = {
      ...console,
      error: vi.fn(),
      groupCollapsed,
      groupEnd,
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as Console

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'iframe') {
        Object.defineProperty(element, 'contentWindow', {
          configurable: true,
          value: {
            console: consoleStub,
          },
        })
      }
      return element
    }) as typeof document.createElement)

    const { logger } = await import('../src/utils/logger')

    logger.group('LLMTest')
    logger.groupEnd()

    expect(groupCollapsed).toHaveBeenCalledWith('LLMTest')
    expect(groupEnd).toHaveBeenCalledWith()
  })
})
