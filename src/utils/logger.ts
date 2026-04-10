// https://bbs.tampermonkey.net.cn/forum.php?mod=redirect&goto=findpost&ptid=5899&pid=77134

const icons = { debug: '🐞', info: 'ℹ️', warn: '⚠', error: '❌️' }
const Color = {
  debug: '#42CA8C;',
  info: '#37C5D6;',
  warn: '#EFC441;',
  error: '#FF6257;',
}

function getCleanConsole() {
  if (typeof document === 'undefined' || !document.head) {
    return console
  }
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  document.head.appendChild(iframe)
  try {
    return iframe.contentWindow?.console ?? console
  } finally {
    iframe.remove()
  }
}
enum LogLevel {
  DEBUG = 8,
  INFO = 4,
  WARN = 2,
  ERROR = 1,
}

function getLogLevel() {
  try {
    if ('localStorage' in window) {
      const temp = window.localStorage.getItem('__BH_LOG_LEVEL__')
      if (temp) {
        switch (temp.toLowerCase()) {
          case 'debug':
            return LogLevel.DEBUG
          case 'info':
            return LogLevel.INFO
          case 'warn':
            return LogLevel.WARN
          case 'error':
            return LogLevel.ERROR
        }
      }
    }
  } catch {
    // main-world execution can deny direct storage access on some page contexts
  }
  return LogLevel.INFO
}

const newConsole = getCleanConsole()
const logLevel = getLogLevel()
const noop = () => {}

function bindConsoleMethod(method: keyof Console, ...args: unknown[]) {
  const fn = newConsole[method]
  return typeof fn === 'function' ? fn.bind(newConsole, ...args) : noop
}

export const logger = {
  log: bindConsoleMethod(
    'log',
    `%c${icons.info} log > `,
    `color:${Color.info}; padding-left:1.2em; line-height:1.5em;`,
  ),
  debug:
    logLevel >= LogLevel.DEBUG
      ? bindConsoleMethod(
          'log',
          `%c${icons.debug} debug > `,
          `color:${Color.debug}; padding-left:1.2em; line-height:1.5em;`,
        )
      : noop,
  info:
    logLevel >= LogLevel.INFO
      ? bindConsoleMethod(
          'info',
          `%c${icons.info} info > `,
          `color:${Color.info}; padding-left:1.2em; line-height:1.5em;`,
        )
      : noop,
  warn:
    logLevel >= LogLevel.WARN
      ? bindConsoleMethod(
          'warn',
          `%c${icons.warn} warn > `,
          `color:${Color.warn}; padding-left:1.2em; line-height:1.5em;`,
        )
      : noop,
  error: bindConsoleMethod(
    'error',
    `%c${icons.error} error > `,
    `color:${Color.error}; padding-left:1.2em; line-height:1.5em;`,
  ),
  group: bindConsoleMethod('groupCollapsed'),
  groupEnd: bindConsoleMethod('groupEnd'),
}
