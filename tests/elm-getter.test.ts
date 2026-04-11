// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { elmGetter } from '@/utils/elmGetter'

describe('elmGetter', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('gets an existing element immediately', async () => {
    document.body.innerHTML = '<div class="target"></div>'

    await expect(elmGetter.get('.target')).resolves.toBe(document.querySelector('.target'))
  })

  it('waits for inserted elements with MutationObserver', async () => {
    const promise = elmGetter.get('.dynamic', {
      retryIntervalMs: 0,
      timeoutMs: 200,
    })

    const node = document.createElement('div')
    node.className = 'dynamic'
    document.body.appendChild(node)

    await expect(promise).resolves.toBe(node)
  })

  it('supports getting multiple selectors as an array', async () => {
    document.body.innerHTML = '<div class="one"></div><div class="two"></div>'

    await expect(elmGetter.get(['.one', '.two'])).resolves.toEqual([
      document.querySelector('.one'),
      document.querySelector('.two'),
    ])
  })

  it('supports legacy overloads for parent and timeout arguments', async () => {
    const parent = document.createElement('section')
    document.body.appendChild(parent)

    const child = document.createElement('div')
    child.className = 'inside'
    parent.appendChild(child)

    await expect(elmGetter.get('.inside', parent)).resolves.toBe(child)
    await expect(elmGetter.get('.inside', parent, 50)).resolves.toBe(child)
    await expect(elmGetter.get('.inside', 50)).resolves.toBe(child)
  })

  it('includes the parent element itself when it matches later lookup targets', async () => {
    const parent = document.createElement('div')
    parent.className = 'self-target'
    document.body.appendChild(parent)

    const promise = elmGetter.get('.self-target', {
      parent: document.body,
      retryIntervalMs: 0,
      timeoutMs: 200,
    })

    parent.setAttribute('data-ready', 'yes')

    await expect(promise).resolves.toBe(parent)
  })

  it('iterates existing and inserted nodes exactly once and can stop on false', async () => {
    document.body.innerHTML = '<div class="item"></div>'
    const callback = vi.fn((element: Element, isInserted: boolean) => {
      expect(typeof isInserted).toBe('boolean')
      return !element.classList.contains('stop')
    })

    elmGetter.each('.item', callback)

    const inserted = document.createElement('div')
    inserted.className = 'item'
    document.body.appendChild(inserted)

    const stop = document.createElement('div')
    stop.className = 'item stop'
    document.body.appendChild(stop)

    await new Promise((resolve) => setTimeout(resolve, 0))

    const afterStop = document.createElement('div')
    afterStop.className = 'item'
    document.body.appendChild(afterStop)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(callback).toHaveBeenCalledTimes(3)
    expect(callback.mock.calls[0][1]).toBe(false)
    expect(callback.mock.calls[1][1]).toBe(true)
    expect(callback.mock.calls[2][0]).toBe(stop)
  })

  it('requires a callback for each and ignores duplicate observed nodes', async () => {
    document.body.innerHTML = '<div class="item"></div>'

    expect(() => elmGetter.each('.item', null as never)).toThrow(
      'elmGetter.each requires a callback',
    )

    const callback = vi.fn()
    const parent = document.querySelector('.item') as HTMLDivElement
    elmGetter.each('.item', callback)

    parent.setAttribute('data-flag', 'first')
    parent.setAttribute('data-flag', 'second')

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(parent, false)
  })

  it('stops observing when the callback throws for inserted nodes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const callback = vi.fn(() => {
      throw new Error('boom')
    })

    elmGetter.each('.item', callback)

    const failing = document.createElement('div')
    failing.className = 'item'
    document.body.appendChild(failing)

    await new Promise((resolve) => setTimeout(resolve, 0))

    const afterFailure = document.createElement('div')
    afterFailure.className = 'item'
    document.body.appendChild(afterFailure)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(callback).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      '[BossHelper] elmGetter.each callback failed',
      expect.any(Error),
    )

    errorSpy.mockRestore()
  })

  it('validates selector availability and rm ignores timeout misses', async () => {
    document.body.innerHTML = '<div id="present"></div>'

    expect(elmGetter.validateSelectors(['#present', '.missing'])).toEqual([
      { found: true, selector: '#present' },
      { found: false, selector: '.missing' },
    ])

    await expect(
      elmGetter.rm('.missing', {
        retryIntervalMs: 0,
        timeoutMs: 20,
      }),
    ).resolves.toBeUndefined()
  })

  it('removes selector arrays and warns for non-timeout rm failures', async () => {
    document.body.innerHTML = '<div class="one"></div><div class="two"></div>'

    await elmGetter.rm(['.one', '.two'])

    expect(document.querySelector('.one')).toBeNull()
    expect(document.querySelector('.two')).toBeNull()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const brokenParent = {
      nodeName: 'BROKEN',
      nodeType: Node.ELEMENT_NODE,
      querySelector() {
        throw new Error('invalid selector run')
      },
      querySelectorAll() {
        return []
      },
    } as unknown as ParentNode & Node

    await elmGetter.rm('.broken', brokenParent, 10)

    expect(warnSpy).toHaveBeenCalledWith('[BossHelper] elmGetter.rm failed', {
      selector: '.broken',
      error: expect.any(Error),
    })

    warnSpy.mockRestore()
  })

  it('times out with descriptive parents when selectors never appear', async () => {
    const parent = document.createElement('article')
    parent.id = 'host'
    document.body.appendChild(parent)

    await expect(
      elmGetter.get('.never', {
        parent,
        retryIntervalMs: 0,
        timeoutMs: 10,
      }),
    ).rejects.toThrow('等待选择器超时: .never (10ms, parent=article#host)')
  })

  it('fails immediately for timeoutMs=0 without starting observers or retry timers', async () => {
    const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe')
    const intervalSpy = vi.spyOn(window, 'setInterval')

    await expect(
      elmGetter.get('.never', {
        retryIntervalMs: 10,
        timeoutMs: 0,
      }),
    ).rejects.toThrow('等待选择器超时: .never (0ms, parent=document)')

    expect(observeSpy).not.toHaveBeenCalled()
    expect(intervalSpy).not.toHaveBeenCalled()

    observeSpy.mockRestore()
    intervalSpy.mockRestore()
  })
})
