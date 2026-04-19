#!/usr/bin/env node

// @ts-check

import { writeStderrLine } from './shared/logging.mjs'
import { runMcpServer } from './mcp/server.mjs'
import { bootstrapAgentEnvironment, parseBootstrapArgs } from './agent-bootstrap.mjs'

function shouldAutoBootstrap() {
  return process.env.BOSS_HELPER_AGENT_MCP_AUTO_BOOTSTRAP !== 'false'
}

function parseMcpArgs(argv) {
  const bootstrapArgv = []
  let autoBootstrap = shouldAutoBootstrap()

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--no-bootstrap') {
      autoBootstrap = false
      continue
    }
    if (token === '--bootstrap') {
      autoBootstrap = true
      continue
    }

    bootstrapArgv.push(token)
  }

  return {
    autoBootstrap,
    bootstrapOptions: parseBootstrapArgs(bootstrapArgv),
  }
}

const mcpOptions = parseMcpArgs(process.argv.slice(2))
let bootstrapPromise = null

if (mcpOptions.autoBootstrap) {
  bootstrapPromise = bootstrapAgentEnvironment(mcpOptions.bootstrapOptions)
    .then((result) => {
      writeStderrLine(`boss-helper mcp bootstrap ready: relay=${result.relayUrl}`)
      if (result.pageReady !== true) {
        writeStderrLine('boss-helper mcp bootstrap waiting for page readiness: login or risk handling may still be required')
      }
      return result
    })
    .catch((error) => {
      writeStderrLine(`boss-helper mcp bootstrap failed: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    })
}

runMcpServer({
  bootstrapPromise,
})
