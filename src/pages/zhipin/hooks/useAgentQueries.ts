import type { UseAgentQueriesOptions } from './agentQueryShared'
import { useAgentJobQueries } from './useAgentJobQueries'
import { useAgentMetaQueries } from './useAgentMetaQueries'

export function useAgentQueries(options: UseAgentQueriesOptions) {
  return {
    ...useAgentMetaQueries(options),
    ...useAgentJobQueries(options),
  }
}
