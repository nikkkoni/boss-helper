// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import { counter } from '@/message'
import { animate, delay, loader, notification } from '@/utils'

describe('utils/index', () => {
  it('forwards notifications to the message bridge', async () => {
    const notifySpy = vi.spyOn(counter, 'notify')

    await notification('投递完成', 'list')

    expect(notifySpy).toHaveBeenCalledWith({
      iconUrl: expect.stringContaining('bosszhipin'),
      message: '投递完成',
      title: 'Boss直聘批量投简历',
      type: 'list',
    })
  })

  it('animates until progress reaches one and then calls the end handler', () => {
    const callbacks: FrameRequestCallback[] = []
    const callIds: number[] = []
    const draw = vi.fn()
    const end = vi.fn()
    const timing = vi.fn((value: number) => value)

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    }))
    vi.spyOn(performance, 'now').mockReturnValue(0)

    animate({
      callId(id) {
        callIds.push(id)
      },
      draw,
      duration: 100,
      end,
      timing,
    })

    expect(callIds).toEqual([1])

    callbacks[0](50)
    expect(draw).toHaveBeenNthCalledWith(1, 0.5)
    expect(callIds).toEqual([1, 2])

    callbacks[1](150)
    expect(draw).toHaveBeenNthCalledWith(2, 1)
    expect(timing).toHaveBeenNthCalledWith(2, 1)
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('reuses the loader element, cancels the previous animation, and resets width on stop', () => {
    document.body.innerHTML = '<div id="header"></div>'

    const callbacks: FrameRequestCallback[] = []
    const cancelAnimationFrameSpy = vi.fn()
    const onDone = vi.fn()

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    }))
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy)
    vi.spyOn(performance, 'now').mockReturnValue(0)

    loader({ color: '#111111', ms: 100 })
    const stop = loader({ color: '#222222', ms: 200, onDone })
    const load = document.querySelector<HTMLDivElement>('#loader')

    expect(load).not.toBeNull()
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(1)

    callbacks[1](200)

    expect(load?.style.width).toBe('0%')
    expect(onDone).toHaveBeenCalledTimes(1)

    stop()

    expect(cancelAnimationFrameSpy).toHaveBeenLastCalledWith(2)
    expect(load?.style.width).toBe('0%')
  })

  it('handles missing headers and delayed waits', async () => {
    vi.useFakeTimers()

    try {
      vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
      vi.stubGlobal('cancelAnimationFrame', vi.fn())
      vi.spyOn(performance, 'now').mockReturnValue(0)

      const stop = loader({ ms: 50 })
      expect(document.querySelector('#loader')).toBeNull()

      stop()

      const wait = delay(0.01)
      await vi.advanceTimersByTimeAsync(10)
      await expect(wait).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
