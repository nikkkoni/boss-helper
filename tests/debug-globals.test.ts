import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('debug global exposure', () => {
  it('keeps agent and __q_* globals behind import.meta.env.DEV guards', () => {
    const deliveryControlSource = readSource('src/pages/zhipin/hooks/useDeliveryControl.ts')
    const agentWindowBridgeSource = readSource('src/pages/zhipin/hooks/agentWindowBridge.ts')
    const appSource = readSource('src/App.vue')
    const confStoreSource = readSource('src/stores/conf/index.ts')
    const jobsStoreSource = readSource('src/stores/jobs.ts')
    const logStoreSource = readSource('src/stores/log.tsx')
    const signedKeyStoreSource = readSource('src/stores/signedKey.ts')
    const userStoreSource = readSource('src/stores/user.ts')

    expect(deliveryControlSource).toContain('registerWindowAgentBridge: () =>')
    expect(agentWindowBridgeSource).toContain(
      'if (import.meta.env.DEV) {\n    targetWindow.__bossHelperAgent = options.controller\n  }',
    )
    expect(appSource).toContain('if (import.meta.env.DEV) {\n  window.__q_openStore = () => {')
    expect(confStoreSource).toContain(
      'if (import.meta.env.DEV) {\n  window.__q_useConf = useConf\n}',
    )
    expect(jobsStoreSource).toContain(
      'if (import.meta.env.DEV) {\n  window.__q_jobList = jobList\n}',
    )
    expect(logStoreSource).toContain('window.__q_log = () => useLog().data.value')
    expect(signedKeyStoreSource).toContain('window.__q_netConf = () => netConf.value')
    expect(signedKeyStoreSource).toContain(
      'if (import.meta.env.DEV) {\n  window.__q_useSignedKey = useSignedKey\n}',
    )
    expect(userStoreSource).toContain(
      'if (import.meta.env.DEV) {\n  window.__q_useUser = useUser\n}',
    )
  })
})
