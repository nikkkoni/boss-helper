import { ALL, parse } from 'partial-json'

export function stripJsonFence(json: string) {
  const exactMatch = json.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (exactMatch) {
    return exactMatch[1]
  }

  const inlineMatch = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (inlineMatch) {
    return inlineMatch[1]
  }
  return json
}

export function parseStructuredJson<T = unknown>(json: string): T {
  return JSON.parse(stripJsonFence(json).trim()) as T
}

export function parseGptJson<T = any>(json: string): Partial<T> | null {
  json = stripJsonFence(json)
  return parse(json, ALL)
}

if (typeof window !== 'undefined') {
  window.__q_parseGptJson = parseGptJson
}
