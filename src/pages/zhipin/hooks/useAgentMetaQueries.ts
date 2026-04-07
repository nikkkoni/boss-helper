import {
  createBossHelperAgentResponse,
  type BossHelperAgentConfigSnapshot,
  type BossHelperAgentConfigUpdateData,
  type BossHelperAgentConfigUpdatePayload,
  type BossHelperAgentNavigateData,
  type BossHelperAgentNavigatePayload,
  type BossHelperAgentResponse,
  type BossHelperAgentResumeData,
  type BossHelperAgentValidationError,
} from '@/message/agent'
import { useConf } from '@/stores/conf'
import { validateConfigPatch } from '@/stores/conf/validation'
import { useUser } from '@/stores/user'
import { jsonClone } from '@/utils/deepmerge'

import { buildBossHelperNavigateUrl } from './agentNavigate'
import type { UseAgentQueriesOptions } from './agentQueryShared'

export function useAgentMetaQueries(options: UseAgentQueriesOptions) {
  const conf = useConf()

  async function configOk(
    code: string,
    message: string,
    config: BossHelperAgentConfigSnapshot['config'],
  ): Promise<BossHelperAgentResponse<BossHelperAgentConfigUpdateData>> {
    return createBossHelperAgentResponse(true, code, message, { config })
  }

  async function configFail(
    code: string,
    message: string,
    errors?: BossHelperAgentValidationError[],
  ): Promise<BossHelperAgentResponse<BossHelperAgentConfigUpdateData>> {
    await options.ensureStoresLoaded()
    return createBossHelperAgentResponse(false, code, message, {
      config: conf.getRuntimeConfigSnapshot(),
      errors,
    })
  }

  async function resumeGet() {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentResumeData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    try {
      const user = useUser()
      const resumeData = await user.getUserResumeData()
      const resumeText = await user.getUserResumeString({})
      return createBossHelperAgentResponse(true, 'resume', '已返回当前简历', {
        userId: user.getUserId(),
        resumeData: jsonClone(resumeData),
        resumeText,
      })
    } catch (error) {
      return createBossHelperAgentResponse<BossHelperAgentResumeData>(
        false,
        'resume-load-failed',
        error instanceof Error ? error.message : '简历读取失败',
      )
    }
  }

  async function navigate(payload?: BossHelperAgentNavigatePayload) {
    await options.ensureStoresLoaded()
    if (!options.ensureSupportedPage()) {
      return createBossHelperAgentResponse<BossHelperAgentNavigateData>(
        false,
        'unsupported-page',
        '当前页面不支持自动投递',
      )
    }

    try {
      const targetUrl = buildBossHelperNavigateUrl(payload, location.href, location.origin)
      window.setTimeout(() => {
        window.location.href = targetUrl
      }, 50)

      return createBossHelperAgentResponse(true, 'navigate-accepted', '已接受导航请求', {
        targetUrl,
      })
    } catch (error) {
      return createBossHelperAgentResponse<BossHelperAgentNavigateData>(
        false,
        'navigate-invalid',
        error instanceof Error ? error.message : '导航参数不合法',
      )
    }
  }

  async function getConfig() {
    await options.ensureStoresLoaded()
    return configOk('config', '已返回当前配置', conf.getRuntimeConfigSnapshot())
  }

  async function updateConfig(payload?: BossHelperAgentConfigUpdatePayload) {
    await options.ensureStoresLoaded()
    if (!payload?.configPatch || Object.keys(payload.configPatch).length === 0) {
      return configFail('empty-config-patch', '缺少 configPatch 或 patch 为空')
    }

    const validationErrors = validateConfigPatch(payload.configPatch)
    if (validationErrors.length > 0) {
      return configFail('validation-failed', '配置校验失败', validationErrors)
    }

    const config = await conf.applyRuntimeConfigPatch(payload.configPatch, {
      persist: payload.persist,
    })

    return configOk(
      'config-updated',
      payload.persist ? '配置已更新并持久化' : '配置已更新',
      config,
    )
  }

  return {
    resumeGet,
    navigate,
    getConfig,
    updateConfig,
  }
}