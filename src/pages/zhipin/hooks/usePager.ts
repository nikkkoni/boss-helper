import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useHookVueData, useHookVueFn } from '@/composables/useVue'
import { logger } from '@/utils/logger'
import { joinSelectors, zhipinSelectors } from '@/utils/selectors'

const legacyVueContainerQuery = joinSelectors(zhipinSelectors.vueContainers.job)
const vueContainerQuery = joinSelectors(zhipinSelectors.vueContainers.all)

export const usePager = defineStore('zhipin/pager', () => {
  const page = ref({ page: 1, pageSize: 15 })
  const pageChange = ref<((value: number) => void) | null>(null)

  const initPage = useHookVueData(
    vueContainerQuery,
    'pageVo',
    page,
  )

  const initChange = useHookVueFn(legacyVueContainerQuery, 'pageChangeAction')
  const initSearch = useHookVueFn(vueContainerQuery, [
    'searchJobAction',
    'onSearch',
  ])

  function getPageChange() {
    if (!pageChange.value) {
      throw new Error('pageChange is undefined')
    }
    return pageChange.value
  }

  function next() {
    try {
      getPageChange()(page.value.page + 1)
      return true
    } catch (err) {
      logger.error('翻页: 下一页错误', err)
      return false
    }
  }

  function prev() {
    if (page.value.page <= 1) {
      return false
    }
    try {
      getPageChange()(page.value.page - 1)
      return true
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
      await initPage()
      pageChange.value =
        location.href.includes('/web/geek/job-recommend') ||
        location.href.includes('/web/geek/jobs')
          ? await initSearch()
          : await initChange()
      getPageChange()
    },
  }
})
