import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useHookVueData, useHookVueFn } from '@/composables/useVue'
import { getActiveSiteAdapter } from '@/site-adapters'
import { logger } from '@/utils/logger'
import { getActiveSelectorRegistry, joinSelectors } from '@/utils/selectors'

function getVueContainerQuery(key: string) {
  const selectors = getActiveSelectorRegistry()
  return joinSelectors(selectors.vueContainers[key] ?? selectors.vueContainers.all)
}

export const usePager = defineStore('zhipin/pager', () => {
  const page = ref({ page: 1, pageSize: 15 })
  const pageChange = ref<((value: number) => void) | null>(null)

  function getPageChange() {
    if (!pageChange.value) {
      throw new Error('pageChange is undefined')
    }
    return pageChange.value
  }

  function next() {
    try {
      return getActiveSiteAdapter(location.href).navigatePage({
        direction: 'next',
        page: page.value,
        pageChange: getPageChange(),
      })
    } catch (err) {
      logger.error('翻页: 下一页错误', err)
      return false
    }
  }

  function prev() {
    try {
      return getActiveSiteAdapter(location.href).navigatePage({
        direction: 'prev',
        page: page.value,
        pageChange: getPageChange(),
      })
    } catch (err) {
      logger.error('翻页: 上一页错误', err)
      return false
    }
  }

  function reset() {
    page.value = { page: 1, pageSize: 15 }
    pageChange.value = null
  }

  return {
    page,
    pageChange,
    next,
    prev,
    reset,
    initPager: async () => {
      const adapter = getActiveSiteAdapter(location.href)
      const bindings = adapter.getPagerBindings(location.pathname)
      const initPage = useHookVueData(
        getVueContainerQuery(bindings.pageStateSelectorKey),
        bindings.pageStateKey,
        page,
      )
      const initChange = useHookVueFn(
        getVueContainerQuery(bindings.pageChangeSelectorKey),
        [...bindings.pageChangeMethodKeys],
      )

      await initPage()
      pageChange.value = await initChange()
      getPageChange()
    },
  }
})
