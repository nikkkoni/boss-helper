import type { UseAgentQueriesOptions } from './agentQueryShared'
import { useAgentChatQueries } from './useAgentChatQueries'
import { useAgentJobQueries } from './useAgentJobQueries'
import { useAgentMetaQueries } from './useAgentMetaQueries'

export function useAgentQueries(options: UseAgentQueriesOptions) {
  return {
    ...useAgentMetaQueries(options),
    ...useAgentChatQueries(options),
    ...useAgentJobQueries(options),
  }
}