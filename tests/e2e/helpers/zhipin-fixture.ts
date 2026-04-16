import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { BrowserContext, Route } from '@playwright/test'

const currentDir = dirname(fileURLToPath(import.meta.url))
const fixtureHtmlPath = resolve(currentDir, '../fixtures/zhipin-jobs.html')
const templateHtml = readFileSync(fixtureHtmlPath, 'utf8')

const inlineSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="#409eff"/><text x="32" y="38" font-size="20" text-anchor="middle" fill="#fff">BH</text></svg>`,
)

const inlineImageUrl = `data:image/svg+xml,${inlineSvg}`

export const fixtureJobId = 'job-1'

type FixtureRouteHandler = (route: Route) => Promise<void>

interface FixtureJsonResponse {
  body?: unknown
  contentType?: string
  status?: number
}

interface ZhipinFixtureOptions {
  jobDetails?: Record<string, unknown>
  jobList?: Array<(typeof fixtureJobList)[number]>
  onApply?: FixtureRouteHandler
  onChatRemind?: FixtureRouteHandler
  selectedJobId?: string | null
  userInfo?: typeof fixtureUserInfo
}

const fixtureUserInfo = {
  userId: 1001,
  identity: 0,
  encryptUserId: 'fixture-user',
  name: '测试用户',
  showName: '测试用户',
  tinyAvatar: inlineImageUrl,
  largeAvatar: inlineImageUrl,
  token: 'fixture-user-token',
  isHunter: false,
  clientIP: '127.0.0.1',
  email: null,
  phone: null,
  brandName: null,
  doubleIdentity: false,
  recruit: false,
  agentRecruit: false,
  industryCostTag: 0,
  gender: 0,
  trueMan: true,
  studentFlag: false,
  completeDayStatus: true,
  complete: true,
  multiExpect: false,
}

export const fixtureJobList = [
  {
    securityId: 'security-1',
    bossAvatar: inlineImageUrl,
    bossCert: 0,
    encryptBossId: 'boss-1',
    bossName: 'Alice',
    bossTitle: 'HR',
    goldHunter: 0,
    bossOnline: true,
    encryptJobId: fixtureJobId,
    expectId: 1,
    jobName: 'Frontend Engineer',
    lid: 'lid-1',
    salaryDesc: '20-30K',
    jobLabels: ['双休', 'Vue'],
    jobValidStatus: 1,
    iconWord: '',
    skills: ['Vue', 'TypeScript'],
    jobExperience: '3-5年',
    daysPerWeekDesc: '',
    leastMonthDesc: '',
    jobDegree: '本科',
    cityName: '上海',
    areaDistrict: '浦东新区',
    businessDistrict: '张江',
    jobType: 0,
    proxyJob: 0,
    proxyType: 0,
    anonymous: 0,
    outland: 0,
    optimal: 0,
    iconFlagList: [],
    itemId: 1,
    city: 101020100,
    isShield: 0,
    atsDirectPost: false,
    gps: {
      longitude: 121.6,
      latitude: 31.2,
    },
    lastModifyTime: 1_710_067_550_000,
    encryptBrandId: 'brand-1',
    brandName: 'Acme',
    brandLogo: inlineImageUrl,
    brandStageName: '',
    brandIndustry: '互联网',
    brandScaleName: '100-499人',
    welfareList: ['五险一金', '双休'],
    industry: 100020,
    contact: false,
  },
]

export const fixtureJobDetails: Record<string, unknown> = {
  [fixtureJobId]: {
    pageType: 0,
    selfAccess: false,
    securityId: 'security-1',
    sessionId: 'session-1',
    lid: 'lid-1',
    jobInfo: {
      encryptId: fixtureJobId,
      encryptUserId: 'boss-user-1',
      invalidStatus: false,
      jobName: 'Frontend Engineer',
      position: 1,
      positionName: 'Frontend Engineer',
      location: 101020100,
      locationName: '上海',
      locationUrl: '/c101020100/',
      experienceName: '3-5年',
      degreeName: '本科',
      jobType: 0,
      proxyJob: 0,
      proxyType: 0,
      salaryDesc: '20-30K',
      payTypeDesc: null,
      postDescription: '负责前端页面开发',
      encryptAddressId: 'address-1',
      address: '上海市浦东新区张江高科',
      longitude: 121.6,
      latitude: 31.2,
      staticMapUrl: '',
      pcStaticMapUrl: '',
      baiduStaticMapUrl: '',
      baiduPcStaticMapUrl: '',
      overseasAddressList: [],
      overseasInfo: null,
      showSkills: ['Vue', 'TypeScript'],
      anonymous: 0,
      jobStatusDesc: '最新',
    },
    bossInfo: {
      name: 'Alice',
      title: 'HR',
      tiny: inlineImageUrl,
      large: inlineImageUrl,
      activeTimeDesc: '刚刚活跃',
      bossOnline: true,
      brandName: 'Acme',
      bossSource: 0,
      certificated: true,
      tagIconUrl: null,
      avatarStickerUrl: null,
    },
    brandComInfo: {
      encryptBrandId: 'brand-1',
      brandName: 'Acme',
      logo: inlineImageUrl,
      stage: 0,
      stageName: '',
      scale: 301,
      scaleName: '100-499人',
      industry: 100020,
      industryName: '互联网',
      introduce: 'A fixture company for Playwright',
      labels: [],
      activeTime: Date.now(),
      visibleBrandInfo: true,
      focusBrand: false,
      customerBrandName: 'Acme',
      customerBrandStageName: '',
    },
    oneKeyResumeInfo: {
      inviteType: 0,
      alreadySend: false,
      canSendResume: false,
      canSendPhone: false,
      canSendWechat: false,
    },
    relationInfo: {
      interestJob: false,
      beFriend: false,
    },
    handicappedInfo: null,
    appendixInfo: {
      canFeedback: false,
      chatBubble: null,
    },
    atsOnlineApplyInfo: {
      inviteType: 0,
      alreadyApply: false,
    },
    certMaterials: [],
  },
}

function fixtureHtml(options: ZhipinFixtureOptions = {}) {
  const jobList = options.jobList ?? fixtureJobList
  const jobDetails = options.jobDetails ?? fixtureJobDetails
  const selectedJobId = options.selectedJobId === undefined ? jobList[0]?.encryptJobId ?? null : options.selectedJobId
  const userInfo = options.userInfo ?? fixtureUserInfo
  const payload = JSON.stringify(
    {
      jobDetails,
      jobList,
      selectedJobId,
      userInfo,
    },
    null,
    2,
  ).replaceAll('<', '\\u003c')

  return templateHtml.replace('__BOSS_HELPER_E2E_FIXTURE__', payload)
}

function json(route: Route, data: unknown) {
  return route.fulfill({
    body: JSON.stringify(data),
    contentType: 'application/json; charset=utf-8',
    status: 200,
  })
}

function jsonWithStatus(route: Route, response: FixtureJsonResponse) {
  return route.fulfill({
    body: JSON.stringify(response.body ?? {}),
    contentType: response.contentType ?? 'application/json; charset=utf-8',
    status: response.status ?? 200,
  })
}

export async function registerZhipinFixtureRoutes(
  context: BrowserContext,
  options: ZhipinFixtureOptions = {},
) {
  await context.addCookies([
    {
      name: 'bst',
      value: 'fixture-bst-token',
      domain: '.zhipin.com',
      path: '/',
      sameSite: 'Lax',
      secure: true,
    },
  ])

  await context.route('https://www.zhipin.com/web/geek/jobs**', async (route) => {
    await route.fulfill({
      body: fixtureHtml(options),
      contentType: 'text/html; charset=utf-8',
      status: 200,
    })
  })

  await context.route('https://www.zhipin.com/wapi/zpgeek/friend/add.json**', async (route) => {
    if (options.onApply) {
      await options.onApply(route)
      return
    }

    await json(route, {
      code: 0,
      message: 'ok',
      zpData: {
        encryptJobId: fixtureJobId,
      },
    })
  })

  await context.route(
    'https://www.zhipin.com/wapi/zpCommon/actionLog/geek/chatremind.json**',
    async (route) => {
      if (options.onChatRemind) {
        await options.onChatRemind(route)
        return
      }

      await json(route, {
        code: 0,
        message: 'ok',
        zpData: {},
      })
    },
  )

  await context.route('https://www.zhipin.com/favicon.ico', async (route) => {
    await route.fulfill({
      body: '',
      contentType: 'image/x-icon',
      status: 204,
    })
  })
}

export async function fulfillFixtureJson(route: Route, response: FixtureJsonResponse) {
  await jsonWithStatus(route, response)
}
