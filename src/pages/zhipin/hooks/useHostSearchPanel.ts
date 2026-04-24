import { onBeforeUnmount } from 'vue'

import { getActiveSiteAdapter } from '@/site-adapters'
import { elmGetter } from '@/utils/elmGetter'
import { logger } from '@/utils/logger'
import { SELECTOR_TIMEOUT_MS } from '@/utils/selectors'

const HOST_SEARCH_BRIDGE_CLASS = 'boss-helper-host-search-bridge'
const HOST_SEARCH_BRIDGE_JOBS_CLASS = `${HOST_SEARCH_BRIDGE_CLASS}--jobs`
const HOST_SEARCH_RECOMMEND_CLASS = 'boss-helper-host-search-recommend'
const HOST_SEARCH_STATIC_CLASS = 'boss-helper-host-search-static'
const HOST_SEARCH_STATIC_JOBS_CONDITION_CLASS = `${HOST_SEARCH_STATIC_CLASS}--jobs-condition`
const HOST_SEARCH_STATIC_JOBS_EXPECT_CLASS = `${HOST_SEARCH_STATIC_CLASS}--jobs-expect`
const HOST_SEARCH_STATIC_JOBS_INPUT_CLASS = `${HOST_SEARCH_STATIC_CLASS}--jobs-input`
const HOST_SEARCH_STATIC_JOBS_SOURCE_CLASS = `${HOST_SEARCH_STATIC_CLASS}--jobs-source`

type JobsBridgeStaticKind = 'condition' | 'default' | 'expect-select' | 'search-input' | 'source'

type JobsBridgeStaticOptions = {
  hidden?: boolean
  kind?: JobsBridgeStaticKind
}

export function useHostSearchPanel() {
  const searchPanelPlan = getActiveSiteAdapter(location.href).getSearchPanelPlan(location.pathname)
  const jobsBridgeObservers: Array<{ disconnect: () => void }> = []

  function resetJobsBridgeObservers() {
    while (jobsBridgeObservers.length > 0) {
      jobsBridgeObservers.pop()?.disconnect()
    }
  }

  function applyJobsBridgeStaticLayout(
    element: HTMLElement | null | undefined,
    options: JobsBridgeStaticOptions = {},
  ) {
    if (!element) {
      return
    }

    const setImportantStyle = (target: HTMLElement, property: string, value: string) => {
      if (
        target.style.getPropertyValue(property) === value &&
        target.style.getPropertyPriority(property) === 'important'
      ) {
        return
      }

      target.style.setProperty(property, value, 'important')
    }

    const queryAndApply = (selectors: string[], callback: (target: HTMLElement) => void) => {
      const visited = new Set<HTMLElement>()

      for (const selector of selectors) {
        for (const target of element.querySelectorAll<HTMLElement>(selector)) {
          if (visited.has(target)) {
            continue
          }

          visited.add(target)
          callback(target)
        }
      }
    }

    setImportantStyle(element, 'position', 'static')
    setImportantStyle(element, 'inset', 'auto')
    setImportantStyle(element, 'top', 'auto')
    setImportantStyle(element, 'right', 'auto')
    setImportantStyle(element, 'bottom', 'auto')
    setImportantStyle(element, 'left', 'auto')
    setImportantStyle(element, 'margin', '0')
    setImportantStyle(element, 'width', '100%')
    setImportantStyle(element, 'max-width', '100%')
    setImportantStyle(element, 'transform', 'none')

    if (options.kind === 'condition') {
      setImportantStyle(element, 'overflow', 'visible')
      setImportantStyle(element, 'z-index', 'auto')
      setImportantStyle(element, 'padding', '14px 16px')
      setImportantStyle(element, 'border', '1px solid var(--bh-border-subtle)')
      setImportantStyle(element, 'border-radius', 'var(--bh-radius-card)')
      setImportantStyle(element, 'background', 'var(--bh-surface-soft)')
      setImportantStyle(element, 'box-shadow', 'var(--bh-shadow-soft)')
      setImportantStyle(element, 'color', 'var(--bh-text-primary)')

      queryAndApply(
        [
          '.c-filter-condition',
          '.filter-condition',
          '.search-condition-wrapper',
          '.search-condition-wrapper.clearfix',
          '.condition-wrapper',
          '.filter-wrap',
        ],
        (target) => {
          setImportantStyle(target, 'overflow', 'visible')
          setImportantStyle(target, 'background', 'transparent')
          setImportantStyle(target, 'box-shadow', 'none')
        },
      )

      queryAndApply(['.c-filter-condition'], (target) => {
        setImportantStyle(target, 'width', '100%')
        setImportantStyle(target, 'padding', '0')
        setImportantStyle(target, 'border-radius', '18px')
        setImportantStyle(target, 'background', 'transparent')
        setImportantStyle(target, 'box-shadow', 'none')
        setImportantStyle(target, 'color', 'var(--bh-text-primary)')
      })

      queryAndApply(
        [
          '.condition-filter-select',
          '.condition-position-select.is-select .current-select',
          '.condition-industry-select',
          '.city-area-select .current-select',
        ],
        (target) => {
          setImportantStyle(target, 'border-radius', '16px')
          setImportantStyle(target, 'background', 'var(--bh-surface-muted)')
          setImportantStyle(target, 'box-shadow', 'inset 0 0 0 1px var(--bh-border-subtle)')
          setImportantStyle(target, 'color', 'var(--bh-text-primary)')
        },
      )

      queryAndApply(
        [
          '.condition-filter-select .current-select',
          '.condition-position-select .current-select',
          '.condition-industry-select .current-select',
          '.city-area-select .current-select',
        ],
        (target) => {
          setImportantStyle(target, 'color', 'inherit')
        },
      )

      queryAndApply(['.clear-filter', '.clear-all', "[class*='clear']"], (target) => {
        setImportantStyle(target, 'color', 'var(--bh-text-secondary)')
      })

      queryAndApply(
        [
          '.filter-select-dropdown',
          '.filter-select-dropdown ul',
          '.filter-select-dropdown .condition-position-detail',
          '.city-area-select .area-select-wrapper',
        ],
        (target) => {
          setImportantStyle(target, 'z-index', '1300')
          setImportantStyle(target, 'overflow', 'visible')
          setImportantStyle(target, 'border', '1px solid var(--bh-border-subtle)')
          setImportantStyle(target, 'border-radius', 'var(--bh-radius-md)')
          setImportantStyle(target, 'background', 'var(--bh-surface-dialog)')
          setImportantStyle(target, 'box-shadow', 'var(--bh-shadow-card)')
          setImportantStyle(target, 'backdrop-filter', 'blur(var(--bh-blur-md))')
          setImportantStyle(target, '-webkit-backdrop-filter', 'blur(var(--bh-blur-md))')
        },
      )

      queryAndApply(
        [
          '.filter-select-dropdown li',
          '.city-area-select .area-dropdown-item li',
          '.city-area-select .city-area-tab li',
          '.subway-select-wrapper .subway-line-list li',
        ],
        (target) => {
          setImportantStyle(target, 'background', 'transparent')
          setImportantStyle(target, 'color', 'var(--bh-text-primary)')
        },
      )

      queryAndApply(
        [
          '.filter-select-dropdown .active',
          '.city-area-select .city-area-tab .active',
          '.subway-select-wrapper .subway-line-list .active',
        ],
        (target) => {
          setImportantStyle(target, 'color', 'var(--bh-accent)')
        },
      )
    }

    if (options.kind === 'search-input' || options.kind === 'expect-select') {
      setImportantStyle(element, 'overflow', 'visible')
      setImportantStyle(element, 'z-index', '1000')
    }

    if (options.hidden) {
      setImportantStyle(element, 'display', 'none')
      element.setAttribute('aria-hidden', 'true')
    }
  }

  function stabilizeJobsBridgeElement(
    element: HTMLElement | null | undefined,
    options: JobsBridgeStaticOptions = {},
  ) {
    if (!element) {
      return
    }

    applyJobsBridgeStaticLayout(element, options)

    let queued = false
    let disposed = false
    let observing = false
    const observer = new MutationObserver(() => {
      if (disposed) {
        return
      }
      if (queued) {
        return
      }

      queued = true
      queueMicrotask(() => {
        queued = false
        if (disposed) {
          return
        }
        observer.disconnect()
        observing = false
        applyJobsBridgeStaticLayout(element, options)
        if (!disposed) {
          observer.observe(element, {
            attributes: true,
            attributeFilter: ['class', 'style'],
          })
          observing = true
        }
      })
    })

    observer.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    observing = true

    jobsBridgeObservers.push({
      disconnect: () => {
        disposed = true
        if (!observing) {
          return
        }
        observer.disconnect()
        observing = false
      },
    })
  }

  async function mountSearchPanel(searchMount: HTMLElement | null | undefined) {
    if (!searchMount) {
      logger.warn('未找到搜索栏挂载节点')
      return
    }

    resetJobsBridgeObservers()
    searchMount.replaceChildren()

    if (searchPanelPlan.kind === 'recommend') {
      try {
        const searchEl = await elmGetter.get<HTMLDivElement>(searchPanelPlan.searchSelector, {
          timeoutMs: SELECTOR_TIMEOUT_MS,
        })
        searchEl.classList.add(HOST_SEARCH_RECOMMEND_CLASS)
        searchMount.appendChild(searchEl)
      } catch (error) {
        logger.warn('初始化推荐页搜索栏失败', { error })
      }
      return
    }

    if (searchPanelPlan.kind === 'jobs') {
      const container = document.createElement('div')
      container.classList.add(HOST_SEARCH_BRIDGE_CLASS, HOST_SEARCH_BRIDGE_JOBS_CLASS)
      searchMount.appendChild(container)

      try {
        const [searchEl, conditionEl] = await elmGetter.get<HTMLDivElement>(
          searchPanelPlan.blockSelectors,
          {
            timeoutMs: SELECTOR_TIMEOUT_MS,
          },
        )

        searchEl.classList.add(HOST_SEARCH_STATIC_CLASS, HOST_SEARCH_STATIC_JOBS_SOURCE_CLASS)
        conditionEl.classList.add(HOST_SEARCH_STATIC_CLASS, HOST_SEARCH_STATIC_JOBS_CONDITION_CLASS)
        stabilizeJobsBridgeElement(conditionEl, { kind: 'condition' })

        try {
          const [searchInputEl, expectSelectEl] = await elmGetter.get<
            HTMLInputElement | HTMLDivElement
          >(searchPanelPlan.inputSelectors, {
            parent: searchEl,
            timeoutMs: SELECTOR_TIMEOUT_MS,
          })

          searchInputEl.classList.add(HOST_SEARCH_STATIC_CLASS, HOST_SEARCH_STATIC_JOBS_INPUT_CLASS)
          expectSelectEl.classList.add(
            HOST_SEARCH_STATIC_CLASS,
            HOST_SEARCH_STATIC_JOBS_EXPECT_CLASS,
          )
          stabilizeJobsBridgeElement(searchInputEl, { kind: 'search-input' })
          stabilizeJobsBridgeElement(expectSelectEl, { kind: 'expect-select' })
          stabilizeJobsBridgeElement(searchEl, { hidden: true, kind: 'source' })

          container.appendChild(searchInputEl)
          container.appendChild(expectSelectEl)
          container.appendChild(conditionEl)
          return
        } catch (error) {
          logger.warn('初始化新版职位页搜索输入失败', { error })
        }

        stabilizeJobsBridgeElement(searchEl)
        container.appendChild(searchEl)
        container.appendChild(conditionEl)
      } catch (error) {
        logger.warn('初始化新版职位页搜索布局失败', { error })
      }
      return
    }

    try {
      const [searchEl, conditionEl] = await elmGetter.get<HTMLDivElement>(
        searchPanelPlan.blockSelectors,
        {
          timeoutMs: SELECTOR_TIMEOUT_MS,
        },
      )
      searchMount.appendChild(searchEl)
      searchMount.appendChild(conditionEl)
      void elmGetter.rm(searchPanelPlan.scanSelector, {
        parent: searchEl,
        timeoutMs: SELECTOR_TIMEOUT_MS,
      })
    } catch (error) {
      logger.warn('初始化经典职位页搜索布局失败', { error })
    }
  }

  onBeforeUnmount(() => {
    resetJobsBridgeObservers()
  })

  return {
    mountSearchPanel,
    searchPanelKind: searchPanelPlan.kind,
  }
}
