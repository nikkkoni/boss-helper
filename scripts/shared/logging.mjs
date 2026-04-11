// @ts-check

import { stderr } from 'node:process'

/** @param {unknown} error */
export function stringifyError(error) {
  if (error instanceof Error) {
    return error.stack || error.message
  }

  return String(error)
}

/** @param {unknown} value */
export function formatJson(value) {
  return JSON.stringify(value, null, 2)
}

/** @param {unknown} value */
export function printJson(value) {
  console.log(formatJson(value))
}

/** @param {...unknown} values */
export function writeStderrLine(...values) {
  stderr.write(`${values.map((value) => stringifyError(value)).join(' ')}\n`)
}

/** @param {string} prefix */
export function createPrefixedLogger(prefix) {
  return {
    /** @param {...unknown} values */
    error(...values) {
      console.error(`[${prefix}]`, ...values)
    },
    /** @param {...unknown} values */
    log(...values) {
      console.log(`[${prefix}]`, ...values)
    },
  }
}