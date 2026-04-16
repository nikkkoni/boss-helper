import { describe, expect, it } from 'vitest'

import { startMcpServer } from './helpers/agent-mcp-server'

describe('agent mcp server catalog', () => {
  it('exposes high-level context tool, resources and prompts for autonomous agents', async () => {
    const server = await startMcpServer()

    try {
      const initialize = await server.client.request('initialize', {
        capabilities: {},
        clientInfo: { name: 'vitest', version: '1.0.0' },
        protocolVersion: '2024-11-05',
      })
      expect(initialize.error).toBeUndefined()
      expect(initialize.result?.serverInfo).toEqual(
        expect.objectContaining({
          name: 'boss-helper-agent-mcp',
        }),
      )

      server.client.notify('notifications/initialized')

      const tools = await server.client.request('tools/list')
      const toolList = (tools.result?.tools ?? []) as Array<{
        inputSchema?: { required?: string[] }
        name: string
      }>
      const toolNames = toolList.map((tool) => tool.name)
      expect(toolNames).toContain('boss_helper_bootstrap_guide')
      expect(toolNames).toContain('boss_helper_agent_context')
      expect(toolNames).toContain('boss_helper_plan_preview')
      expect(toolNames).toContain('boss_helper_run_report')
      expect(toolNames).toContain('boss_helper_jobs_current')
      expect(toolNames).toContain('boss_helper_jobs_refresh')
      expect(toolNames).toContain('boss_helper_start')
      expect(toolNames).toContain('boss_helper_resume')
      expect(toolNames).toContain('boss_helper_chat_send')
      expect(toolList.find((tool) => tool.name === 'boss_helper_start')).toEqual(
        expect.objectContaining({
          inputSchema: expect.objectContaining({
            required: expect.arrayContaining(['confirmHighRisk']),
          }),
        }),
      )
      expect(toolList.find((tool) => tool.name === 'boss_helper_resume')).toEqual(
        expect.objectContaining({
          inputSchema: expect.objectContaining({
            required: expect.arrayContaining(['confirmHighRisk']),
          }),
        }),
      )
      expect(toolList.find((tool) => tool.name === 'boss_helper_chat_send')).toEqual(
        expect.objectContaining({
          inputSchema: expect.objectContaining({
            required: expect.arrayContaining(['confirmHighRisk', 'content', 'to_name', 'to_uid']),
          }),
        }),
      )
      expect(toolList.find((tool) => tool.name === 'boss_helper_chat_list')).toEqual(
        expect.objectContaining({
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              pendingReplyOnly: expect.any(Object),
            }),
          }),
        }),
      )
      expect(toolList.find((tool) => tool.name === 'boss_helper_config_update')).toEqual(
        expect.objectContaining({
          inputSchema: expect.objectContaining({
            properties: expect.objectContaining({
              confirmHighRisk: expect.any(Object),
            }),
          }),
        }),
      )

      const bootstrapGuideCall = await server.client.request('tools/call', {
        arguments: {},
        name: 'boss_helper_bootstrap_guide',
      })
      const bootstrapGuide = (bootstrapGuideCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(bootstrapGuide).toEqual(
        expect.objectContaining({
          ok: true,
          readiness: expect.objectContaining({
            bridgeOnline: true,
            relayConnected: true,
            extensionIdConfigured: true,
            ready: true,
          }),
          summary: expect.objectContaining({
            nextAction: 'continue',
            ready: true,
            stage: 'ready',
          }),
        }),
      )
      expect(bootstrapGuide.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'bridge', status: 'ready' }),
          expect.objectContaining({ id: 'relay', status: 'ready' }),
          expect.objectContaining({ id: 'extension-id', status: 'ready' }),
          expect.objectContaining({ id: 'boss-page', status: 'ready' }),
          expect.objectContaining({ id: 'page-ready', status: 'ready' }),
        ]),
      )

      const contextCall = await server.client.request('tools/call', {
        arguments: {
          include: ['resume', 'jobs', 'events', 'stats'],
          jobsLimit: 1,
        },
        name: 'boss_helper_agent_context',
      })

      const context = (contextCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(context.ok).toBe(true)
      expect(context.agentProtocolVersion).toBe(1)
      expect(context.readiness).toEqual(
        expect.objectContaining({
          bossPageFound: true,
          bridgeOnline: true,
          pageControllable: true,
          pageInitialized: true,
          pageSupported: true,
          ready: true,
          relayConnected: true,
          suggestedAction: 'continue',
        }),
      )
      expect(context.summary).toEqual(
        expect.objectContaining({
          currentRunId: 'run-1',
          hasActiveRun: true,
          hasResume: true,
          jobsVisibleCount: 1,
          pendingReviewCount: 1,
          remainingDeliveryCapacity: 118,
          recentRunState: 'running',
          riskLevel: 'medium',
          riskWarningCount: 2,
          resumableRun: true,
          todayDelivered: 2,
        }),
      )
      expect(context.workflow).toEqual(
        expect.objectContaining({
          stage: 'review-loop',
          candidateFocus: null,
          eventFocus: {
            terminalTypes: ['limit-reached', 'batch-error', 'batch-completed'],
            watchTypes: ['job-pending-review', 'limit-reached', 'batch-error', 'batch-completed'],
          },
          goal: '优先完成待审核闭环',
          recommendedTools: expect.arrayContaining(['boss_helper_jobs_review', 'boss_helper_jobs_detail']),
        }),
      )
      expect(context.sections.resume.data).toEqual(
        expect.objectContaining({
          userId: 'user-1',
        }),
      )
      expect(context.sections.readiness.data).toEqual(
        expect.objectContaining({
          ready: true,
          suggestedAction: 'continue',
        }),
      )
      expect(context.sections.stats.data.run.current).toEqual(
        expect.objectContaining({
          runId: 'run-1',
          state: 'running',
        }),
      )
      expect(context.sections.stats.data.risk).toEqual(
        expect.objectContaining({
          level: 'medium',
          delivery: expect.objectContaining({
            limit: 120,
            remainingToday: 118,
            usedToday: 2,
          }),
          warnings: expect.arrayContaining([
            expect.objectContaining({ code: 'same-company-filter-disabled' }),
          ]),
        }),
      )
      expect(context.sections.jobs.data.jobs).toHaveLength(1)

      const analyzeJobsContextCall = await server.client.request('tools/call', {
        arguments: {
          include: ['jobs', 'plan'],
        },
        name: 'boss_helper_agent_context',
      })
      const analyzeJobsContext = (analyzeJobsContextCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(analyzeJobsContext.workflow).toEqual(
        expect.objectContaining({
          stage: 'analyze-jobs',
          candidateFocus: {
            inspectFirst: [
              {
                brandName: 'Beta',
                encryptJobId: 'job-2',
                hasCard: true,
                jobName: 'Fullstack Engineer',
                reason: 'loaded-card',
                status: 'wait',
              },
              {
                brandName: 'Acme',
                encryptJobId: 'job-1',
                hasCard: false,
                jobName: 'Frontend Engineer',
                reason: 'list-order',
                status: 'pending',
              },
            ],
            loadedCardCount: 1,
            visibleCount: 2,
          },
          planFocus: {
            firstAction: 'inspect-manual-review',
            inspectFirst: [
              {
                decision: 'needs-manual-review',
                encryptJobId: 'job-1',
                jobName: 'Frontend Engineer',
                stage: 'ai-filtering',
              },
            ],
            scope: {
              source: 'selected-current-job',
              targetJobIds: ['job-1'],
            },
            summary: {
              missingInfoCount: 0,
              needsExternalReviewCount: 0,
              needsManualReviewCount: 1,
              readyCount: 0,
              scopedCount: 1,
              skipCount: 0,
            },
          },
          eventFocus: null,
        }),
      )
      expect(analyzeJobsContext.sections.plan).toEqual(
        expect.objectContaining({
          scope: {
            source: 'selected-current-job',
            targetJobIds: ['job-1'],
          },
          data: expect.objectContaining({
            summary: expect.objectContaining({
              needsManualReviewCount: 1,
              scopedCount: 1,
            }),
          }),
        }),
      )

      const runReportCall = await server.client.request('tools/call', {
        arguments: {},
        name: 'boss_helper_run_report',
      })
      const runReport = (runReportCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(runReport).toEqual(
        expect.objectContaining({
          ok: true,
          code: 'run-report',
          run: expect.objectContaining({
            runId: 'run-1',
            state: 'running',
          }),
          summary: expect.objectContaining({
            selectedRunId: 'run-1',
          }),
          reviewAudit: expect.objectContaining({
            externalReviewCount: 1,
            pendingReviewCount: 1,
          }),
        }),
      )
      expect(runReport.decisionLog).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'business',
            outcome: 'skipped',
            reasonCode: 'ai-filtering',
            source: 'log',
          }),
          expect.objectContaining({
            category: 'risk',
            outcome: 'skipped',
            reasonCode: 'duplicate-same-company',
            source: 'log',
          }),
        ]),
      )

      const planPreviewCall = await server.client.request('tools/call', {
        arguments: {
          jobIds: ['job-1'],
        },
        name: 'boss_helper_plan_preview',
      })
      const planPreview = (planPreviewCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(planPreview).toEqual(
        expect.objectContaining({
          ok: true,
          command: 'plan.preview',
          data: expect.objectContaining({
            code: 'plan-preview',
            data: expect.objectContaining({
              summary: expect.objectContaining({
                needsManualReviewCount: 1,
              }),
            }),
          }),
        }),
      )

      const refreshCall = await server.client.request('tools/call', {
        arguments: {},
        name: 'boss_helper_jobs_refresh',
      })
      const refresh = (refreshCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(refresh).toEqual(
        expect.objectContaining({
          ok: true,
          command: 'jobs.refresh',
          data: expect.objectContaining({
            code: 'jobs-refresh-accepted',
            data: expect.objectContaining({
              targetUrl: 'https://www.zhipin.com/web/geek/jobs',
            }),
          }),
        }),
      )

      const currentJobCall = await server.client.request('tools/call', {
        arguments: {},
        name: 'boss_helper_jobs_current',
      })
      const currentJob = (currentJobCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(currentJob).toEqual(
        expect.objectContaining({
          ok: true,
          command: 'jobs.current',
          data: expect.objectContaining({
            code: 'jobs-current',
            data: expect.objectContaining({
              selected: true,
              job: expect.objectContaining({
                encryptJobId: 'job-1',
                postDescription: '负责前端页面开发',
              }),
            }),
          }),
        }),
      )

      const chatListCall = await server.client.request('tools/call', {
        arguments: {
          pendingReplyOnly: true,
        },
        name: 'boss_helper_chat_list',
      })
      const chatList = (chatListCall.result?.structuredContent ?? {}) as Record<string, any>
      expect(chatList).toEqual(
        expect.objectContaining({
          ok: true,
          command: 'chat.list',
          data: expect.objectContaining({
            code: 'chat-list',
            data: expect.objectContaining({
              pendingReplyCount: 1,
              total: 1,
              totalConversations: 2,
              conversations: [
                expect.objectContaining({
                  conversationId: 'uid:2',
                  latestRole: 'boss',
                  needsReply: true,
                }),
              ],
            }),
          }),
        }),
      )

      const resources = await server.client.request('resources/list')
      const resourceUris = ((resources.result?.resources ?? []) as Array<{ uri: string }>).map((resource) => resource.uri)
      expect(resourceUris).toEqual(
        expect.arrayContaining([
          'boss-helper://guides/autonomy-workflow',
          'boss-helper://guides/review-loop',
          'boss-helper://runtime/bridge-context',
        ]),
      )

      const runtimeResource = await server.client.request('resources/read', {
        uri: 'boss-helper://runtime/bridge-context',
      })
      const runtimeContents = runtimeResource.result?.contents as Array<{ text: string }>
      const runtimeContext = JSON.parse(runtimeContents[0].text) as Record<string, any>
      expect(runtimeContext.agentProtocolVersion).toBe(1)
      expect(runtimeContext.summary).toEqual(
        expect.objectContaining({
          nextAction: 'continue',
          ready: true,
          stage: 'ready',
        }),
      )
      expect(runtimeContext.readiness).toEqual(
        expect.objectContaining({
          bridgeOnline: true,
          extensionIdConfigured: true,
          relayConnected: true,
        }),
      )
      expect(runtimeContext.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'bridge', status: 'ready' }),
          expect.objectContaining({ id: 'page-ready', status: 'ready' }),
        ]),
      )
      expect(runtimeContext.recommendedTools).toContain('boss_helper_agent_context')
      expect(runtimeContext.recommendedTools).toContain('boss_helper_jobs_current')

      const prompts = await server.client.request('prompts/list')
      const promptNames = ((prompts.result?.prompts ?? []) as Array<{ name: string }>).map((prompt) => prompt.name)
      expect(promptNames).toEqual(
        expect.arrayContaining(['boss_helper_targeted_delivery', 'boss_helper_review_closure']),
      )

      const targetedPrompt = await server.client.request('prompts/get', {
        arguments: {
          constraints: '上海，优先稳定团队',
          goal: '寻找 Vue 前端岗位',
          keywords: 'vue,typescript,chrome extension',
        },
        name: 'boss_helper_targeted_delivery',
      })

      const promptText = ((targetedPrompt.result?.messages ?? []) as Array<{ content: { text: string } }>)[0].content.text
      expect(promptText).toContain('寻找 Vue 前端岗位')
      expect(promptText).toContain('boss_helper_agent_context')
      expect(promptText).toContain('boss_helper_jobs_review')

      expect(server.bridge.requests).toEqual(
        expect.arrayContaining([
          'GET /health',
          'GET /status',
          'GET /agent-events?',
          'POST /command:readiness.get',
          'POST /command:readiness.get',
          'POST /command:readiness.get',
          'POST /command:logs.query',
          'POST /command:plan.preview',
          'POST /command:plan.preview',
          'POST /command:chat.list',
          'POST /command:jobs.current',
          'POST /command:jobs.refresh',
          'POST /command:resume.get',
          'POST /command:jobs.list',
          'POST /command:stats',
        ]),
      )
    } catch (error) {
      throw server.throwWithStderr(error)
    } finally {
      await server.close()
    }
  })
})
