// @ts-check

import { createHash } from 'node:crypto'

export const BOSS_HELPER_AGENT_EXTENSION_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvl6+Aj4Q+BBrAXrV8we5SUJbrtv6JxX6cQ37GpRNl+QPEgKHz0tnj8j6QK+Y0dvC9zyypMLWCYTMouEgiY43mNKgAZULllg9B8hRKmbtE3pv7oK4SDt/0yYIP4YadTH4+6alnVd5SbYf6mIFPhbXhLaByj4PbJnP1TU/u13AUNr4ekjjMZ+e6kkLYoFpSrlEdfNuEd4pnDqzFMWLqz3F8bP5HPsHa9B7+5gP7Aba5fNV5xPk7cNZny3T1sq63WQlt2rM/Fu+WyJmim6xvyi3wTje+4hjI/UE7GcDunqY+uSvtT/kYY4mA0d1kL75LGfZ3WlnDkWXH6+fWmtSg0W73wIDAQAB'

export function getBossHelperAgentExtensionId() {
  const keyBuffer = Buffer.from(BOSS_HELPER_AGENT_EXTENSION_KEY, 'base64')
  const hash = createHash('sha256').update(keyBuffer).digest('hex').slice(0, 32)
  return [...hash]
    .map((char) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(char, 16)))
    .join('')
}

export const BOSS_HELPER_AGENT_EXTENSION_ID = getBossHelperAgentExtensionId()
