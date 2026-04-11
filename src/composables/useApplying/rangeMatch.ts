import type { FormDataRange } from '@/types/formData'

export function rangeMatchFormat(v: FormDataRange, unit: string): string {
  return `${v[0]} - ${v[1]} ${unit} ${v[2] ? '严格' : '宽松'}`
}

export function rangeMatch(rangeStr: string, form: FormDataRange): boolean {
  if (!rangeStr) return false

  let [start, end, mode] = form
  if (start > end) {
    ;[start, end] = [end, start]
  }

  const match = String(rangeStr).match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/)
  if (!match) return false

  let inputStart = Number.parseFloat(match[1])
  let inputEnd = Number.parseFloat(match[2] != null ? match[2] : match[1])
  if (!Number.isFinite(inputStart) || !Number.isFinite(inputEnd)) return false

  if (inputStart > inputEnd) {
    ;[inputStart, inputEnd] = [inputEnd, inputStart]
  }

  return mode
    ? start <= inputStart && inputEnd <= end
    : Math.max(inputStart, start) <= Math.min(inputEnd, end)
}
