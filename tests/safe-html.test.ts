// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { htmlToText, sanitizeRichHtml, sanitizeSvgHtml } from '@/utils/safeHtml'

describe('safeHtml utilities', () => {
  it('normalizes <br /> tags into line breaks in htmlToText', () => {
    expect(htmlToText('<div>hello<br />world<br/>boss</div>')).toBe('hello\nworld\nboss')
  })

  it('strips inline style attributes from rich html', () => {
    expect(sanitizeRichHtml('<p style="color:red">hello</p>')).toBe('<p>hello</p>')
  })

  it('keeps allowed svg attributes while sanitizing svg markup', () => {
    expect(
      sanitizeSvgHtml('<svg viewBox="0 0 10 10"><path fill="#fff" d="M0 0h10v10H0z"></path></svg>'),
    ).toContain('viewBox="0 0 10 10"')
  })

  it('treats nullish inputs as empty markup', () => {
    expect(sanitizeRichHtml(null)).toBe('')
    expect(sanitizeSvgHtml(undefined)).toBe('')
  })
})
