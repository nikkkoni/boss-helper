import { X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getAgentBridgeCertificate, getAgentBridgeTokenSync } from '../scripts/agent-security.mjs'

function createTempSecurityEnv() {
  const tempDir = mkdtempSync(join(tmpdir(), 'boss-helper-agent-security-'))
  return {
    certFile: join(tempDir, 'bridge-cert.json'),
    tokenFile: join(tempDir, 'bridge-token'),
  }
}

describe('agent security helpers', () => {
  it('writes bridge tokens with owner-only permissions', () => {
    const files = createTempSecurityEnv()

    const token = getAgentBridgeTokenSync({
      BOSS_HELPER_AGENT_BRIDGE_TOKEN: 'owner-only-token',
      BOSS_HELPER_AGENT_TOKEN_FILE: files.tokenFile,
    })

    expect(token).toBe('owner-only-token')
    expect(readFileSync(files.tokenFile, 'utf8')).toBe('owner-only-token\n')
    expect(statSync(files.tokenFile).mode & 0o777).toBe(0o600)

    writeFileSync(files.tokenFile, 'owner-only-token\n', { encoding: 'utf8', mode: 0o644 })

    const reused = getAgentBridgeTokenSync({
      BOSS_HELPER_AGENT_BRIDGE_TOKEN: 'owner-only-token',
      BOSS_HELPER_AGENT_TOKEN_FILE: files.tokenFile,
    })

    expect(reused).toBe('owner-only-token')
    expect(statSync(files.tokenFile).mode & 0o777).toBe(0o600)
  })

  it('writes generated bridge certificates with owner-only permissions and leaf constraints', async () => {
    const files = createTempSecurityEnv()

    const certificate = await getAgentBridgeCertificate({
      BOSS_HELPER_AGENT_CERT_FILE: files.certFile,
    })

    expect(certificate.cert).toContain('BEGIN CERTIFICATE')
    expect(certificate.key).toContain('BEGIN PRIVATE KEY')
    expect(statSync(files.certFile).mode & 0o777).toBe(0o600)

    const persisted = readFileSync(files.certFile, 'utf8')
    expect(persisted).toContain('BEGIN CERTIFICATE')
    expect(persisted).toContain('BEGIN PRIVATE KEY')

    const parsedCertificate = new X509Certificate(certificate.cert)
    expect(parsedCertificate.ca).toBe(false)
  })
})
