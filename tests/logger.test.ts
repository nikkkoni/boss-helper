// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('logger.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    localStorage.clear()
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

  it('honors the error log level by silencing lower-priority methods', async () => {
    localStorage.setItem('__BH_LOG_LEVEL__', 'error')

    const originalCreateElement = document.createElement.bind(document)
    const consoleStub = {
      ...console,
      error: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as Console

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'iframe') {
        Object.defineProperty(element, 'contentWindow', {
          configurable: true,
          value: { console: consoleStub },
        })
      }
      return element
    }) as typeof document.createElement)

    const { logger } = await import('../src/utils/logger')

    logger.debug('skip-debug')
    logger.info('skip-info')
    logger.warn('skip-warn')
    logger.error('expected-error')

    expect(consoleStub.error).toHaveBeenCalledWith(
      '%c❌️ error > ',
      'color:#FF6257;; padding-left:1.2em; line-height:1.5em;',
      'expected-error',
    )
    expect(consoleStub.log).not.toHaveBeenCalled()
    expect(consoleStub.info).not.toHaveBeenCalled()
    expect(consoleStub.warn).not.toHaveBeenCalled()
  })

  it('enables debug logging when the debug level is configured', async () => {
    localStorage.setItem('__BH_LOG_LEVEL__', 'debug')

    const originalCreateElement = document.createElement.bind(document)
    const consoleStub = {
      ...console,
      error: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as Console

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'iframe') {
        Object.defineProperty(element, 'contentWindow', {
          configurable: true,
          value: { console: consoleStub },
        })
      }
      return element
    }) as typeof document.createElement)

    const { logger } = await import('../src/utils/logger')

    logger.debug('debug-msg')
    logger.info('info-msg')
    logger.warn('warn-msg')

    expect(consoleStub.log).toHaveBeenCalledWith(
      '%c🐞 debug > ',
      'color:#42CA8C;; padding-left:1.2em; line-height:1.5em;',
      'debug-msg',
    )
    expect(consoleStub.info).toHaveBeenCalledWith(
      '%cℹ️ info > ',
      'color:#37C5D6;; padding-left:1.2em; line-height:1.5em;',
      'info-msg',
    )
    expect(consoleStub.warn).toHaveBeenCalledWith(
      '%c⚠ warn > ',
      'color:#EFC441;; padding-left:1.2em; line-height:1.5em;',
      'warn-msg',
    )
  })
})
