const noop = () => {}

export const logger = {
  log: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  group: noop,
  groupEnd: noop,
}
