const BOSS_HELPER_PRIVATE_BRIDGE_HOST_ID = 'boss-helper-private-bridge-host'
const BOSS_HELPER_PRIVATE_BRIDGE_NODE_ID = 'boss-helper-private-bridge'
const BOSS_HELPER_MAIN_WORLD_SCRIPT_MARKER = 'boss-helper-main-world-script'
const BOSS_HELPER_PRIVATE_BRIDGE_EVENT = '__boss_helper_private_bridge__'
const BOSS_HELPER_MAIN_WORLD_BRIDGE_EVENT_PARAM = 'bridgeEvent'
export type BossHelperWindowBusMessage = {
  source?: 'content-script' | 'main-world'
  payload: unknown
  type: string
}

interface PrivateBridgeElements {
  bridge: HTMLElement
  host: HTMLElement
  root: ShadowRoot
}

type Listener = (payload: unknown, message: BossHelperWindowBusMessage) => void

let privateBridgeElements: PrivateBridgeElements | null = null
let windowBridgeTarget: EventTarget | null = null
let windowBridgeEventType: string | null = null

function isWindowBusMessage(value: unknown): value is BossHelperWindowBusMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { type?: unknown }).type === 'string' &&
    'payload' in (value as Record<string, unknown>)
  )
}

function toBossHelperWindowBusMessage(value: unknown) {
  if (isWindowBusMessage(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    return isWindowBusMessage(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getExistingHost() {
  return document.getElementById(BOSS_HELPER_PRIVATE_BRIDGE_HOST_ID) as HTMLElement | null
}

export function getBossHelperPrivateBridgeHostId() {
  return BOSS_HELPER_PRIVATE_BRIDGE_HOST_ID
}

export function getBossHelperPrivateBridgeNodeId() {
  return BOSS_HELPER_PRIVATE_BRIDGE_NODE_ID
}

export function getBossHelperPrivateBridgeEventType() {
  return windowBridgeEventType ?? BOSS_HELPER_PRIVATE_BRIDGE_EVENT
}

export function createBossHelperPrivateBridgeEventType(token: string) {
  return `${BOSS_HELPER_PRIVATE_BRIDGE_EVENT}:${token}`
}

export function createBossHelperMainWorldScriptUrl(scriptUrl: string, eventType: string) {
  const url = new URL(scriptUrl)
  url.searchParams.set(BOSS_HELPER_MAIN_WORLD_BRIDGE_EVENT_PARAM, eventType)
  return url.toString()
}

function getBossHelperBridgeEventTypeFromScriptUrl(scriptUrl: string) {
  const url = new URL(scriptUrl)
  return (
    url.searchParams.get(BOSS_HELPER_MAIN_WORLD_BRIDGE_EVENT_PARAM)
    ?? BOSS_HELPER_PRIVATE_BRIDGE_EVENT
  )
}

function getBossHelperExecutingScriptUrlFromStack(stack: string) {
  const lines = stack.split('\n')
  for (const line of lines) {
    const match = line.match(
      /((?:chrome|moz)-extension:[^\s)]+main-world\.js(?:\?[^\s):]*)?)(?::\d+:\d+)?/,
    )
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

export function getBossHelperMainWorldScriptUrlFromRuntime(errorFactory: () => Error = () => new Error()) {
  const currentScript = document.currentScript
  if (currentScript instanceof HTMLScriptElement && currentScript.src) {
    return currentScript.src
  }

  const stack = errorFactory().stack
  if (typeof stack === 'string' && stack) {
    const scriptUrl = getBossHelperExecutingScriptUrlFromStack(stack)
    if (scriptUrl) {
      return scriptUrl
    }
  }

  throw new Error('未找到 BossHelper main-world 脚本地址')
}

export function initializeBossHelperWindowBridgeTargetFromRuntime(
  scriptUrl = getBossHelperMainWorldScriptUrlFromRuntime(),
) {
  return initializeBossHelperWindowBridgeTargetFromScriptUrl(scriptUrl)
}

export function getBossHelperMainWorldScriptMarker() {
  return BOSS_HELPER_MAIN_WORLD_SCRIPT_MARKER
}

export function getBossHelperPrivateBridgeHost() {
  return privateBridgeElements?.host ?? getExistingHost()
}

export function ensureBossHelperPrivateBridge() {
  if (privateBridgeElements) {
    return privateBridgeElements
  }

  const host = document.createElement('div')
  host.id = BOSS_HELPER_PRIVATE_BRIDGE_HOST_ID
  host.style.display = 'none'
  host.setAttribute('aria-hidden', 'true')

  const root = host.attachShadow({ mode: 'closed' })
  const bridge = document.createElement('div')
  bridge.id = BOSS_HELPER_PRIVATE_BRIDGE_NODE_ID
  bridge.setAttribute('aria-hidden', 'true')
  root.append(bridge)

  ;(document.head ?? document.documentElement).append(host)

  privateBridgeElements = {
    bridge,
    host,
    root,
  }
  windowBridgeTarget ??= host
  return privateBridgeElements
}

export function initializeBossHelperWindowBridgeTargetFromScriptUrl(scriptUrl: string) {
  const host = getBossHelperPrivateBridgeHost()
  if (!host) {
    throw new Error('未找到 BossHelper 私有桥接宿主节点')
  }

  windowBridgeTarget = host
  windowBridgeEventType = getBossHelperBridgeEventTypeFromScriptUrl(scriptUrl)
  return host
}

export function getBossHelperWindowBridgeTarget() {
  if (!windowBridgeTarget) {
    throw new Error('BossHelper 私有桥接通道尚未初始化')
  }

  return windowBridgeTarget
}

export function setBossHelperWindowBridgeTargetForTest(target: EventTarget | null) {
  windowBridgeTarget = target
}

export function setBossHelperWindowBridgeEventType(eventType: string | null) {
  windowBridgeEventType = eventType
}

export function resetBossHelperPrivateBridgeForTest() {
  privateBridgeElements?.host.remove()
  privateBridgeElements = null
  windowBridgeTarget = null
  windowBridgeEventType = null
}

export function postBossHelperWindowMessage(target: EventTarget, message: BossHelperWindowBusMessage) {
  if (!isWindowBusMessage(message)) {
    throw new Error('Boss helper private bridge message 格式无效')
  }

  target.dispatchEvent(
    new CustomEvent(getBossHelperPrivateBridgeEventType(), {
      detail: JSON.stringify(message),
    }),
  )
}

export function onBossHelperWindowMessage(
  target: EventTarget,
  listener: Listener,
  options?: {
    messageType?: string
  },
) {
  const expectedType = options?.messageType
  const handler = (event: Event) => {
    const message = toBossHelperWindowBusMessage((event as CustomEvent<unknown>).detail)
    if (!message) {
      return
    }
    if (expectedType && message.type !== expectedType) {
      return
    }
    listener(message.payload, message)
  }

  const eventType = getBossHelperPrivateBridgeEventType()
  target.addEventListener(eventType, handler)
  return () => target.removeEventListener(eventType, handler)
}
