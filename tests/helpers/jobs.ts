import type { MyJobListData } from '@/stores/jobs'
import type { logData } from '@/stores/log'

type JobCard = NonNullable<MyJobListData['card']>

export function createJob(overrides: Partial<MyJobListData> = {}): MyJobListData {
  const job = {
    areaDistrict: '浦东新区',
    bossAvatar: 'https://example.com/avatar.png',
    bossName: 'Alice',
    bossTitle: 'HR',
    brandIndustry: '互联网',
    brandLogo: 'https://example.com/logo.png',
    brandName: 'Acme',
    brandScaleName: '100-499人',
    businessDistrict: '张江',
    cityName: '上海',
    contact: false,
    encryptBossId: 'boss-1',
    encryptBrandId: 'brand-1',
    encryptJobId: 'job-1',
    friendStatus: 0,
    getCard: async () => {
      throw new Error('getCard not mocked')
    },
    goldHunter: 0,
    gps: null,
    jobDegree: '本科',
    jobExperience: '3-5年',
    jobLabels: ['双休'],
    jobName: 'Frontend Engineer',
    lid: 'lid-1',
    salaryDesc: '20-30K',
    securityId: 'security-1',
    skills: ['Vue', 'TypeScript'],
    status: {
      msg: '未开始',
      setStatus(status: MyJobListData['status']['status'], msg = '') {
        job.status.status = status
        job.status.msg = msg
      },
      status: 'pending',
    },
    welfareList: ['五险一金'],
    ...overrides,
  } as MyJobListData

  return job
}

export function createJobCard(overrides: Partial<JobCard> = {}): JobCard {
  return {
    activeTimeDesc: '刚刚活跃',
    address: '张江高科',
    appendixInfo: {
      canFeedback: false,
      chatBubble: null,
    },
    atsOnlineApplyInfo: {
      alreadyApply: false,
      inviteType: 0,
    },
    bossInfo: {
      activeTimeDesc: '刚刚活跃',
      avatarStickerUrl: null,
      bossOnline: true,
      bossSource: 0,
      brandName: 'Acme',
      certificated: true,
      large: 'https://example.com/avatar-large.png',
      name: 'Alice',
      tagIconUrl: null,
      tiny: 'https://example.com/avatar-small.png',
      title: 'HR',
    },
    bossName: 'Alice',
    bossTitle: 'HR',
    brandComInfo: {
      activeTime: Date.now(),
      brandName: 'Acme',
      customerBrandName: 'Acme',
      customerBrandStageName: '',
      encryptBrandId: 'brand-1',
      focusBrand: false,
      industryName: '互联网',
      industry: 100020,
      introduce: 'A fixture company',
      labels: [],
      logo: 'https://example.com/logo.png',
      scale: 301,
      scaleName: '100-499人',
      stage: 0,
      stageName: '',
      visibleBrandInfo: true,
    },
    brandName: 'Acme',
    certMaterials: [],
    cityName: '上海',
    degreeName: '本科',
    encryptBossId: 'boss-1',
    encryptJobId: 'job-1',
    encryptUserId: 'user-encrypt-1',
    experienceName: '3-5年',
    friendStatus: 0,
    handicappedInfo: null,
    jobName: 'Frontend Engineer',
    jobInfo: {
      address: '张江高科',
      anonymous: 0,
      baiduPcStaticMapUrl: '',
      baiduStaticMapUrl: '',
      degreeName: '本科',
      encryptId: 'job-1',
      encryptAddressId: 'address-1',
      encryptUserId: 'user-encrypt-1',
      experienceName: '3-5年',
      invalidStatus: false,
      jobName: 'Frontend Engineer',
      jobStatusDesc: '最新',
      jobType: 0,
      latitude: 31.2,
      locationName: '上海',
      location: 101020100,
      locationUrl: '/c101020100/',
      longitude: 121.6,
      overseasAddressList: [],
      overseasInfo: null,
      payTypeDesc: null,
      pcStaticMapUrl: '',
      postDescription: '负责前端页面开发',
      position: 1,
      positionName: 'Frontend Engineer',
      proxyJob: 0,
      proxyType: 0,
      salaryDesc: '20-30K',
      showSkills: ['Vue', 'TypeScript'],
      staticMapUrl: '',
    },
    jobLabels: ['Vue', 'TypeScript'],
    lid: 'lid-1',
    oneKeyResumeInfo: {
      alreadySend: false,
      canSendPhone: false,
      canSendResume: false,
      canSendWechat: false,
      inviteType: 0,
    },
    pageType: 0,
    postDescription: '负责前端页面开发',
    relationInfo: {
      beFriend: false,
      interestJob: false,
    },
    salaryDesc: '20-30K',
    securityId: 'security-1',
    selfAccess: false,
    sessionId: 'session-1',
    ...overrides,
  } as JobCard
}

export function createLogContext(job: MyJobListData, overrides: Partial<logData> = {}): logData {
  return {
    listData: job,
    ...overrides,
  }
}
