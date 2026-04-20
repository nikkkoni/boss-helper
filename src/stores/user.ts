import { ElMessage } from 'element-plus'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch, type Ref } from 'vue'

import { getRootVue } from '@/composables/useVue'
import { counter } from '@/message'
import type { CookieInfo } from '@/message'
import { amapKeyStorageKey, formDataKey, sanitizeSensitiveFormData } from '@/stores/conf/shared'
import { useStatistics } from '@/stores/statistics'
import type { FormData } from '@/types/formData'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

import { defaultFormData } from './conf'

function toCookieGender(gender?: number): CookieInfo['gender'] {
  if (gender === 0) {
    return 'man'
  }
  if (gender === 1) {
    return 'woman'
  }
  return 'unknown'
}

function getResumeGenderLabel(gender?: number) {
  if (gender === 0) {
    return '男'
  }
  if (gender === 1) {
    return '女'
  }
  return '未知'
}

function toResumeValue(value: unknown) {
  if (value == null) {
    return ''
  }
  return String(value).trim()
}

function joinResumeValues(values: unknown[], separator: string) {
  return values
    .map((value) => toResumeValue(value))
    .filter(Boolean)
    .join(separator)
}

function formatResumeRange(start?: string, end?: string) {
  const range = joinResumeValues([start, end], '-')
  return range ? ` ${range}` : ''
}

function formatResumeBlock(tag: string, value: unknown) {
  const text = toResumeValue(value)
  return text ? `<${tag}>\n${text}\n</${tag}>` : ''
}

function sanitizeResumeText(text: string) {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getBossToken() {
  const pageToken = window?.Cookie?.get?.('bst')
  if (typeof pageToken === 'string' && pageToken) {
    return pageToken
  }

  const cookieToken = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('bst='))
    ?.slice(4)

  if (cookieToken) {
    return decodeURIComponent(cookieToken)
  }

  return ''
}

export interface UserInfo {
  userId: number
  identity: number
  encryptUserId: string
  name: string
  showName: string
  tinyAvatar: string
  largeAvatar: string
  token: string
  isHunter: boolean
  clientIP: string
  email: any
  phone: any
  brandName: any
  doubleIdentity: boolean
  recruit: boolean
  agentRecruit: boolean
  industryCostTag: number
  gender: number
  trueMan: boolean
  studentFlag: boolean
  completeDayStatus: boolean
  complete: boolean
  multiExpect: boolean
}

export const UserResumeStringOptions = {
  基本信息: {
    姓名: false,
    年龄: true,
    性别: true,
    学历: true,
    求职状态: true,
    工作年限: true,
  },
  期望职位: true,
  个人优势: true,
  工作经历: true,
  项目经历: true,
  教育经历: true,
  资格证书: true,
  志愿者经历: true,
}

let getCurrentFormDataSnapshot: (() => Partial<FormData>) | null = null

export function registerUserConfigSnapshotGetter(getter: (() => Partial<FormData>) | null) {
  getCurrentFormDataSnapshot = getter
}

function getSanitizedCurrentFormData() {
  if (getCurrentFormDataSnapshot == null) {
    return undefined
  }

  return sanitizeSensitiveFormData(getCurrentFormDataSnapshot())
}

const useUserStore = defineStore('user', () => {
  const info = ref<UserInfo>()
  const cookieDatas = ref<Record<string, CookieInfo>>({})
  const cookieTableData = computed(() => Object.values(cookieDatas.value))
  const resume = ref<bossZpResumeData>()

  function getUserId(): number | string | null {
    return info.value?.userId ?? window?._PAGE?.uid ?? window?._PAGE?.userId
  }

  function getUserScopeId(): number | string | null {
    const userId = getUserId()
    if (userId != null && userId !== '') {
      return userId
    }

    const encryptUserId = info.value?.encryptUserId ?? window?._PAGE?.encryptUserId
    return encryptUserId ? encryptUserId : null
  }

  async function initUser() {
    const v = await getRootVue()
    const now = Date.now()
    const rootState = v?.$store?.state

    if (rootState == null || typeof rootState !== 'object') {
      logger.error('获取用户信息失败', now, { root: v, info })
      return null
    }

    return waitForRootUserInfo(rootState as { userInfo?: UserInfo | null | undefined }, now, info)
  }

  async function initCookie() {
    try {
      const res = (await counter.cookieInfo()) ?? {}
      logger.debug('账户数据', res)
      cookieDatas.value = res
    } catch (err) {
      logger.error('获取账户数据失败', err)
    }
  }

  async function saveUser({ uid }: { uid: string | number | null }) {
    if (uid == null) {
      uid = getUserId()
    }

    if (uid == null) {
      throw new Error('找不到uid')
    }
    uid = String(uid)

    const val: CookieInfo = {
      uid,
      user: info.value?.showName ?? info.value?.name ?? '未知用户',
      avatar: info.value?.tinyAvatar ?? info.value?.largeAvatar ?? '',
      remark: '',
      gender: toCookieGender(info.value?.gender),
      flag: info.value?.studentFlag ? 'student' : 'staff',
      date: new Date().toLocaleString(),
      form: getSanitizedCurrentFormData(),
      statistics: await useStatistics().getStatistics(),
    }
    logger.debug('开始创建账户', info.value, val)
    await counter.cookieSave(val)
    return val
  }

  async function clearUser() {
    await counter.cookieClear()
  }

  async function changeUser(currentRow?: CookieInfo) {
    if (!currentRow) {
      ElMessage.error('请先选择要切换的账号')
      return
    }

    const targetAccount = jsonClone(currentRow)
    const uid = getUserId()
    if (uid != null) {
      await saveUser({ uid })
    }

    if (targetAccount.form) {
      if (typeof targetAccount.form.amap?.key === 'string' && targetAccount.form.amap.key.trim()) {
        await counter.storageSet(amapKeyStorageKey, targetAccount.form.amap.key.trim())
      }
      const nextFormData = deepmerge<FormData>(jsonClone(defaultFormData), targetAccount.form, {
        clone: false,
      })
      await counter.storageSet(formDataKey, sanitizeSensitiveFormData(nextFormData))
    }

    if (targetAccount.statistics != null) {
      await useStatistics().setStatistics(targetAccount.statistics)
    }

    await counter.cookieSwitch(targetAccount.uid)
  }

  async function deleteUser(d: CookieInfo) {
    try {
      await counter.cookieDelete(d.uid)
      delete cookieDatas.value[d.uid]
      ElMessage.success('账号删除成功')
    } catch (error) {
      logger.error('删除账号失败', error)
      ElMessage.error('删除账号失败，请重试')
    }
  }

  async function getUserResumeString(options: Partial<typeof UserResumeStringOptions>) {
    options = {
      ...UserResumeStringOptions,
      ...options,
    }

    const data = await getUserResumeData()
    const genUserResumeStatus = function (v: number) {
      switch (v) {
        case 0:
          return '离职-随时到岗'
        case 1:
          return '在职-暂不考虑'
        case 2:
          return '在职-考虑机会'
        case 3:
          return '在职-月内到岗'
        default:
          return '未知'
      }
    }
    let template = ''
    if (typeof options.基本信息 === 'object') {
      template += '## 基本信息'
      if (options.基本信息.姓名 && data.baseInfo?.nickName) {
        template += `\n- 姓名: ${data.baseInfo.nickName}`
      }
      if (options.基本信息.年龄 && data.baseInfo?.age) {
        template += `\n- 年龄: ${data.baseInfo.age}`
      }
      if (options.基本信息.性别 && data.baseInfo) {
        template += `\n- 性别: ${getResumeGenderLabel(data.baseInfo.gender)}`
      }
      if (options.基本信息.学历 && data.baseInfo?.degreeCategory) {
        template += `\n- 学历: ${data.baseInfo.degreeCategory}`
      }
      if (options.基本信息.工作年限 && data.baseInfo?.workYearDesc) {
        template += `\n- 工作年限: ${data.baseInfo.workYearDesc}`
      }
      if (options.基本信息.求职状态 && data.applyStatus) {
        template += `\n- 求职状态: ${genUserResumeStatus(data.applyStatus ?? 0)}`
      }
    }
    const expectList = data.expectList?.filter((item) => item?.positionType === 0)
    if (options.期望职位 && expectList && expectList.length > 0) {
      const positions = expectList
        .map((item) => joinResumeValues([item?.positionName, item?.salaryDesc], ' '))
        .filter(Boolean)
      template += `\n\n## 期望职位
${positions.map((item) => `- ${item}`).join('\n')}`
    }
    if (options.个人优势 && data.userDesc) {
      template += `\n\n## 个人优势

<个人优势>
${data.userDesc}
</个人优势>`
    }
    if (options.工作经历 && data.workExpList != null && data.workExpList.length > 0) {
      const workExperiences = data.workExpList
        ?.map((item) => {
          const heading = joinResumeValues(
            [item?.companyName, item?.positionName ? `(${item.positionName})` : ''],
            ' ',
          )
          const emphasis = Array.isArray(item?.emphasis)
            ? item.emphasis
                .map((entry) => toResumeValue(entry))
                .filter(Boolean)
                .map((entry) => `\`${entry}\``)
                .join(' ')
            : ''
          const sections = [
            heading ? `### ${heading}${formatResumeRange(item?.startDate, item?.endDate)}` : '',
            emphasis ? `相关技能: ${emphasis}` : '',
            formatResumeBlock('工作内容', item?.workContent),
            formatResumeBlock('工作业绩', item?.workPerformance),
          ].filter(Boolean)
          return sections.join('\n\n')
        })
        .filter(Boolean)
      template += `\n\n## 工作经历
${workExperiences.join('\n\n')}`
    }
    if (options.项目经历 && data.projectExpList && data.projectExpList.length > 0) {
      const projectExperiences = data.projectExpList
        ?.map((item) => {
          const heading = joinResumeValues(
            [item?.name, item?.roleName ? `(${item.roleName})` : ''],
            ' ',
          )
          const sections = [
            heading ? `### ${heading}${formatResumeRange(item?.startDate, item?.endDate)}` : '',
            formatResumeBlock('项目描述', item?.projectDesc),
            formatResumeBlock('项目业绩', item?.performance),
          ].filter(Boolean)
          return sections.join('\n')
        })
        .filter(Boolean)
      template += `\n\n## 项目经历
${projectExperiences.join('\n\n')}`
    }
    if (options.教育经历 && data.educationExpList && data.educationExpList.length > 0) {
      const educationExperiences = data.educationExpList
        ?.map((item) => {
          const firstLine = joinResumeValues(
            [item?.school, joinResumeValues([item?.startYear, item?.endYear], '-')],
            ' ',
          )
          const secondLine = toResumeValue(item?.degreeName)
          return [firstLine ? `- ${firstLine}` : '', secondLine].filter(Boolean).join('\n')
        })
        .filter(Boolean)
      template += `\n## 教育经历
${educationExperiences.join('\n')}`
    }
    if (options.资格证书 && data.certificationList && data.certificationList.length > 0) {
      const certifications = data.certificationList
        ?.map((item) => toResumeValue(item?.certName))
        .filter(Boolean)
      template += `\n## 资格证书:
${certifications.map((item) => `- ${item}`).join('\n')}
`
    }
    if (options.志愿者经历 && data.volunteerExpList && data.volunteerExpList.length > 0) {
      const volunteerExperiences = data.volunteerExpList
        ?.map((item) => {
          const firstLine = joinResumeValues([item?.name, item?.serviceLength], ' ')
          const secondLine = toResumeValue(item?.volunteerDesc ?? item?.volunteerDescription)
          return [firstLine ? `- ${firstLine}` : '', secondLine].filter(Boolean).join('\n')
        })
        .filter(Boolean)
      template += `\n## 志愿者经历:
${volunteerExperiences.join('\n')}`
    }

    template = sanitizeResumeText(template)
    logger.debug('getUserResumeString', { template, data })
    return template
  }

  async function getUserResumeData(forceRefresh = false) {
    if (resume.value != null && !forceRefresh) {
      return resume.value
    }

    const token = getBossToken()

    try {
      const res = await fetch(
        `https://www.zhipin.com/wapi/zpgeek/resume/geek/preview/data.json?_=${Date.now()}`,
        {
          headers: {
            Zp_token: token,
          },
        },
      )
      const data = (await res.json()) as {
        code: number
        message: string
        zpData: bossZpResumeData
      }
      if (data.code !== 0) {
        throw new Error(data.message)
      }
      resume.value = data.zpData
      return data.zpData
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      ElMessage.error(`获取简历数据失败: ${message}`)
      throw error instanceof Error ? error : new Error(message)
    }
  }

  return {
    info,
    resume,
    getUserResumeString,
    getUserResumeData,
    getUserId,
    getUserScopeId,
    initUser,
    saveUser,
    clearUser,
    changeUser,
    deleteUser,
    cookieDatas,
    cookieTableData,
    initCookie,
  }
})

export function waitForRootUserInfo(
  rootState: { userInfo?: UserInfo | null | undefined },
  now = Date.now(),
  infoRef: Ref<UserInfo | undefined> = useUser().info,
): Promise<UserInfo | null> {
  return new Promise((resolve) => {
    let settled = false
    let stop = () => {}
    let timeout: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      stop()
      if (timeout !== undefined) {
        clearTimeout(timeout)
      }
    }

    const finish = (value: UserInfo | null | undefined) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(value ?? null)
    }

    const applyUserInfo = (userInfo: UserInfo | null | undefined) => {
      if (userInfo) {
        infoRef.value = userInfo
        logger.debug('用户信息获取成功: ', now, userInfo)
        finish(infoRef.value)
      }
    }

    stop = watch(
      () => rootState.userInfo,
      (userInfo) => {
        applyUserInfo(userInfo)
      },
      {
        flush: 'sync',
        immediate: true,
      },
    )

    timeout = setTimeout(() => {
      if (!infoRef.value) {
        logger.error('获取用户信息失败', now, { rootState, info: infoRef })
      }
      finish(null)
    }, 25000)
  })
}

export function useUser() {
  const store = useUserStore()
  const refs = storeToRefs(store)

  return {
    ...refs,
    getUserResumeString: store.getUserResumeString,
    getUserResumeData: store.getUserResumeData,
    getUserId: store.getUserId,
    getUserScopeId: store.getUserScopeId,
    initUser: store.initUser,
    saveUser: store.saveUser,
    clearUser: store.clearUser,
    changeUser: store.changeUser,
    deleteUser: store.deleteUser,
    initCookie: store.initCookie,
  }
}

if (import.meta.env.DEV) {
  window.__q_useUser = useUser
}
