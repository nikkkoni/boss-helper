// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { resolveSignedKeyBaseUrl } from '@/stores/signedKey'

describe('resolveSignedKeyBaseUrl', () => {
  it('uses localhost in development-like environments', () => {
    expect(resolveSignedKeyBaseUrl({ PROD: false, TEST: false, WXT_TEST: false })).toBe(
      'http://localhost:8002',
    )
  })

  it('uses the production endpoint in prod and test builds', () => {
    expect(resolveSignedKeyBaseUrl({ PROD: true, TEST: false, WXT_TEST: false })).toBe(
      'https://boss-helper.ocyss.icu',
    )
    expect(resolveSignedKeyBaseUrl({ PROD: false, TEST: true, WXT_TEST: false })).toBe(
      'https://boss-helper.ocyss.icu',
    )
    expect(resolveSignedKeyBaseUrl({ PROD: false, TEST: false, WXT_TEST: true })).toBe(
      'https://boss-helper.ocyss.icu',
    )
  })
})
