// @ts-check

import { createAgentContextService } from './context.mjs'
import { createPromptDefinitions } from './prompt-definitions.mjs'
import { createResourceDefinitions } from './resource-definitions.mjs'
import { createToolDefinitions } from './tool-definitions.mjs'

/** @param {ReturnType<import('./bridge-client.mjs').createBridgeClient>} bridgeClient */
export function createMcpCatalog(bridgeClient) {
  const contextService = createAgentContextService(bridgeClient)
  const tools = createToolDefinitions({ bridgeClient, contextService })
  const resources = createResourceDefinitions({ contextService })
  const prompts = createPromptDefinitions()

  return {
    prompts,
    promptMap: new Map(prompts.map((prompt) => [prompt.name, prompt])),
    resources,
    resourceMap: new Map(resources.map((resource) => [resource.uri, resource])),
    tools,
    toolMap: new Map(tools.map((tool) => [tool.name, tool])),
  }
}