export function getBossHelperWindowOrigin(currentWindow: Pick<Window, 'location'> = window) {
  return currentWindow.location.origin
}

export function postBossHelperWindowMessage(
  targetWindow: Pick<Window, 'postMessage'>,
  message: unknown,
  origin = getBossHelperWindowOrigin(),
) {
  targetWindow.postMessage(message, origin)
}

export function isBossHelperSameOriginWindowMessage(
  event: Pick<MessageEvent, 'origin' | 'source'>,
  sourceWindow: Window = window,
  expectedOrigin = getBossHelperWindowOrigin(sourceWindow),
) {
  return event.source === sourceWindow && event.origin === expectedOrigin
}
