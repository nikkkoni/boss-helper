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
      const toolNames = ((tools.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name)
      expect(toolNames).toContain('boss_helper_agent_context')

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
          bridgeOnline: true,
          pageControllable: true,
          relayConnected: true,
        }),
      )
      expect(context.summary).toEqual(
        expect.objectContaining({
          hasResume: true,
          jobsVisibleCount: 1,
          pendingReviewCount: 1,
          todayDelivered: 2,
        }),
      )
      expect(context.sections.resume.data).toEqual(
        expect.objectContaining({
          userId: 'user-1',
        }),
      )
      expect(context.sections.jobs.data.jobs).toHaveLength(1)

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
      expect(runtimeContext.readiness).toEqual(
        expect.objectContaining({
          bridgeOnline: true,
          relayConnected: true,
        }),
      )
      expect(runtimeContext.recommendedTools).toContain('boss_helper_agent_context')

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
