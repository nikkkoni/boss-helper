// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  exportJson,
  importJson,
  ImportJsonCancelledError,
} from '@/utils/jsonImportExport'

class MockFileReader {
  static nextError = false
  static nextResult = ''

  onerror: null | (() => void) = null
  onload: null | ((event: { target: { result: string } }) => void) = null

  readAsText() {
    if (MockFileReader.nextError) {
      this.onerror?.()
      return
    }

    this.onload?.({
      target: {
        result: MockFileReader.nextResult,
      },
    })
  }
}

let createdInputs: HTMLInputElement[] = []

function getLastCreatedInput() {
  return createdInputs.at(-1) ?? null
}

describe('jsonImportExport', () => {
  beforeEach(() => {
    vi.useRealTimers()
    MockFileReader.nextError = false
    MockFileReader.nextResult = ''
    createdInputs = []
    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader)
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName as never, options)
      if (tagName === 'input') {
        createdInputs.push(element as HTMLInputElement)
      }
      return element
    }) as typeof document.createElement)
  })

  it('exports json through a blob download link', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-download')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    exportJson({ hello: 'world' }, 'BossHelper')

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-download')
  })

  it('imports valid object json files', async () => {
    MockFileReader.nextResult = JSON.stringify({ hello: 'world' })
    const promise = importJson<Record<string, string>>()
    const input = getLastCreatedInput()

    expect(input).not.toBeNull()

    const file = new File(['{"hello":"world"}'], 'config.json', { type: 'application/json' })
    Object.defineProperty(input!, 'files', {
      configurable: true,
      value: [file],
    })
    input!.dispatchEvent(new Event('change'))

    await expect(promise).resolves.toEqual({ hello: 'world' })
  })

  it('rejects non-json files and invalid json payloads', async () => {
    const wrongFilePromise = importJson()
    const wrongFileInput = getLastCreatedInput()
    Object.defineProperty(wrongFileInput!, 'files', {
      configurable: true,
      value: [new File(['x'], 'config.txt', { type: 'text/plain' })],
    })
    wrongFileInput!.dispatchEvent(new Event('change'))

    await expect(wrongFilePromise).rejects.toThrow('请选择 JSON 文件')

    MockFileReader.nextResult = '{bad json'
    const invalidJsonPromise = importJson()
    const invalidJsonInput = getLastCreatedInput()
    Object.defineProperty(invalidJsonInput!, 'files', {
      configurable: true,
      value: [new File(['{bad json'], 'config.json', { type: 'application/json' })],
    })
    invalidJsonInput!.dispatchEvent(new Event('change'))

    await expect(invalidJsonPromise).rejects.toThrow('内容非合法 JSON')
  })

  it('rejects scalar json, reader failures, cancel events, and focus-without-selection', async () => {
    MockFileReader.nextResult = '1'
    const scalarPromise = importJson()
    const scalarInput = getLastCreatedInput()
    Object.defineProperty(scalarInput!, 'files', {
      configurable: true,
      value: [new File(['1'], 'config.json', { type: 'application/json' })],
    })
    scalarInput!.dispatchEvent(new Event('change'))
    await expect(scalarPromise).rejects.toThrow('JSON 内容必须是对象或数组')

    MockFileReader.nextError = true
    const readErrorPromise = importJson()
    const readErrorInput = getLastCreatedInput()
    Object.defineProperty(readErrorInput!, 'files', {
      configurable: true,
      value: [new File(['{}'], 'config.json', { type: 'application/json' })],
    })
    readErrorInput!.dispatchEvent(new Event('change'))
    await expect(readErrorPromise).rejects.toThrow('读取文件失败')

    const cancelPromise = importJson()
    const cancelInput = getLastCreatedInput()
    cancelInput!.dispatchEvent(new Event('cancel'))
    await expect(cancelPromise).rejects.toBeInstanceOf(ImportJsonCancelledError)

    vi.useFakeTimers()
    const focusPromise = importJson()
    const focusErrorPromise = focusPromise.catch((error) => error)
    window.dispatchEvent(new Event('focus'))
    await vi.runAllTimersAsync()
    expect(await focusErrorPromise).toBeInstanceOf(ImportJsonCancelledError)
  })
})
