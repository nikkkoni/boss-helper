import { SELECTOR_RETRY_INTERVAL_MS, SELECTOR_TIMEOUT_MS, splitSelectors } from '@/utils/selectors'

type QueryParent = ParentNode & Node

export type ElmGetterOptions = {
  parent?: QueryParent
  retryIntervalMs?: number
  timeoutMs?: number
}

type EachCallback = (elm: Element, isInserted: boolean) => boolean | void

const win = document.defaultView ?? window
const doc = win.document
const MutationObs = win.MutationObserver ?? win.WebkitMutationObserver ?? win.MozMutationObserver

function matches(element: Element, selector: string) {
  return element.matches(selector)
}

class SelectorTimeoutError extends Error {
  constructor(
    public selector: string,
    public timeoutMs: number,
    parent: QueryParent,
  ) {
    super(`等待选择器超时: ${selector} (${timeoutMs}ms, parent=${describeParent(parent)})`)
    this.name = 'SelectorTimeoutError'
  }
}

function isElement(value: unknown): value is Element {
  return value instanceof win.Element
}

function isQueryParent(value: unknown): value is QueryParent {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'nodeType' in value &&
      'querySelector' in value &&
      typeof (value as QueryParent).querySelector === 'function',
  )
}

function isOptions(value: unknown): value is ElmGetterOptions {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !isQueryParent(value))
}

function describeParent(parent: QueryParent) {
  if (parent === doc) {
    return 'document'
  }
  if (isElement(parent)) {
    const id = parent.id ? `#${parent.id}` : ''
    return `${parent.tagName.toLowerCase()}${id}`
  }
  return parent.nodeName.toLowerCase()
}

function queryOne<E extends Element = Element>(
  selector: string,
  parent: QueryParent,
  includeParent: boolean,
) {
  const checkParent = includeParent && isElement(parent) && matches(parent, selector)
  if (checkParent) {
    return parent as E
  }
  return parent.querySelector<E>(selector)
}

function queryAll(selector: string, parent: QueryParent, includeParent: boolean) {
  const nodes = [...parent.querySelectorAll<Element>(selector)]
  if (includeParent && isElement(parent) && matches(parent, selector)) {
    return [parent, ...nodes]
  }
  return nodes
}

function observeTarget(target: QueryParent, callback: (el: Element) => void) {
  if (!MutationObs) {
    return () => {}
  }

  const observer = new MutationObs((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && isElement(mutation.target)) {
        callback(mutation.target)
      }

      for (const node of mutation.addedNodes) {
        if (isElement(node)) {
          callback(node)
        }
      }
    }
  })

  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
  })

  return () => {
    observer.disconnect()
  }
}

function normalizeOptions(args: unknown[]) {
  if (isOptions(args[0])) {
    return {
      parent: args[0].parent ?? doc,
      retryIntervalMs: args[0].retryIntervalMs ?? SELECTOR_RETRY_INTERVAL_MS,
      timeoutMs: args[0].timeoutMs ?? SELECTOR_TIMEOUT_MS,
    }
  }

  const parent = isQueryParent(args[0]) ? args[0] : doc
  const timeoutMs =
    typeof args[0] === 'number'
      ? args[0]
      : typeof args[1] === 'number'
        ? args[1]
        : SELECTOR_TIMEOUT_MS

  return {
    parent,
    retryIntervalMs: SELECTOR_RETRY_INTERVAL_MS,
    timeoutMs,
  }
}

function waitForSelector<E extends Element = Element>(selector: string, options: Required<ElmGetterOptions>) {
  return new Promise<E>((resolve, reject) => {
    let settled = false
    const cleanups: Array<() => void> = []

    const finish = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      for (const cleanup of cleanups) {
        cleanup()
      }
      callback()
    }

    const lookup = (target: QueryParent, includeParent = false) => {
      try {
        const found = queryOne<E>(selector, target, includeParent)
        if (found) {
          finish(() => resolve(found))
        }
      } catch (error) {
        finish(() => reject(error))
      }
    }

    lookup(options.parent)

    if (settled) {
      return
    }

    if (options.timeoutMs <= 0) {
      finish(() => reject(new SelectorTimeoutError(selector, options.timeoutMs, options.parent)))
      return
    }

    cleanups.push(observeTarget(options.parent, (element) => lookup(element, true)))

    if (options.retryIntervalMs > 0) {
      const retryId = window.setInterval(() => {
        lookup(options.parent)
      }, options.retryIntervalMs)
      cleanups.push(() => clearInterval(retryId))
    }

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new SelectorTimeoutError(selector, options.timeoutMs, options.parent)))
    }, options.timeoutMs)
    cleanups.push(() => clearTimeout(timeoutId))
  })
}

function get<E extends Element = Element>(selector: readonly string[], options?: ElmGetterOptions): Promise<E[]>
function get<E extends Element = Element>(selector: string, options?: ElmGetterOptions): Promise<E>
function get<E extends Element = Element>(
  selector: readonly string[],
  ...args: [QueryParent, number] | [number] | [QueryParent] | []
): Promise<E[]>
function get<E extends Element = Element>(
  selector: string,
  ...args: [QueryParent, number] | [number] | [QueryParent] | []
): Promise<E>
function get<E extends Element = Element>(
  selector: string | readonly string[],
  ...args: unknown[]
): Promise<E | E[]> {
  const options = normalizeOptions(args) as Required<ElmGetterOptions>
  if (typeof selector !== 'string') {
    return Promise.all(selector.map((item) => waitForSelector<E>(item, options)))
  }
  return waitForSelector<E>(selector, options)
}

function each(
  selector: string,
  ...args:
    | [QueryParent, EachCallback]
    | [EachCallback]
) {
  const parent = isQueryParent(args[0]) ? args[0] : doc
  const callback = (isQueryParent(args[0]) ? args[1] : args[0]) as EachCallback

  if (typeof callback !== 'function') {
    throw new TypeError('elmGetter.each requires a callback')
  }

  const refs = new WeakSet<Element>()
  const handleNode = (node: Element, isInserted: boolean) => {
    if (refs.has(node)) {
      return true
    }
    refs.add(node)
    return callback(node, isInserted) !== false
  }

  for (const node of queryAll(selector, parent, false)) {
    if (!handleNode(node, false)) {
      return
    }
  }

  const stopObserving = observeTarget(parent, (element) => {
    try {
      for (const node of queryAll(selector, element, true)) {
        if (!handleNode(node, true)) {
          stopObserving()
          return
        }
      }
    } catch (error) {
      stopObserving()
      console.error('[BossHelper] elmGetter.each callback failed', error)
    }
  })
}

function validateSelectors(selector: string | readonly string[], parent: QueryParent = doc) {
  return splitSelectors(selector).map((item: string) => ({
    selector: item,
    found: Boolean(queryOne(item, parent, false)),
  }))
}

async function rm(
  selector: string | readonly string[],
  ...args: [QueryParent, number] | [number] | [QueryParent] | [ElmGetterOptions] | []
) {
  try {
    if (typeof selector !== 'string') {
      const targets = await get(selector, ...(args as [QueryParent, number] | [number] | [QueryParent] | []))
      targets.forEach((target) => target.remove())
      return
    }
    const targets = await get(selector, ...(args as [QueryParent, number] | [number] | [QueryParent] | []))
    targets.remove()
  } catch (error) {
    if (error instanceof SelectorTimeoutError) {
      return
    }
    console.warn('[BossHelper] elmGetter.rm failed', { selector, error })
  }
}

export default {
  each,
  get,
  rm,
  validateSelectors,
}
