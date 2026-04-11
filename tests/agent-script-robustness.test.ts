import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('agent script robustness', () => {
  it('reports invalid cli payload json instead of crashing', async () => {
    // @ts-ignore scripts are typechecked separately via tsconfig.scripts.json
    const { parseArgs: parseCliArgs } = await import('../scripts/agent-cli.mjs')
    expect(() => parseCliArgs(['stats', '--payload', '{'])).toThrow('--payload 必须是合法 JSON')
  })

  it('treats -h as help for orchestrator', async () => {
    // @ts-ignore scripts are typechecked separately via tsconfig.scripts.json
    const { parseArgs: parseOrchestratorArgs } = await import('../scripts/agent-orchestrator.mjs')
    expect(parseOrchestratorArgs(['-h'])).toEqual(
      expect.objectContaining({
        help: true,
        host: '127.0.0.1',
      }),
    )
  })

  it('prints structured launch failures', async () => {
    const openSync = vi.fn(() => 99)
    const closeSync = vi.fn()
    const spawn = vi.fn(() => ({ pid: undefined, unref: vi.fn() }))

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>()
      return {
        ...actual,
        closeSync,
        openSync,
      }
    })
    vi.doMock('node:child_process', () => ({ spawn }))
    vi.doMock('node:fs/promises', () => ({ writeFile: vi.fn(async () => undefined) }))
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('bridge unavailable')
    }))

    // @ts-ignore scripts are typechecked separately via tsconfig.scripts.json
    const agentLaunch = await import('../scripts/agent-launch.mjs')

    await expect(agentLaunch.ensureBridge()).rejects.toThrow('bridge 启动失败，未获取到子进程 pid')
    expect(openSync).toHaveBeenCalledTimes(1)
    expect(closeSync).toHaveBeenCalledWith(99)
    expect(spawn).toHaveBeenCalledTimes(1)
  })
})
