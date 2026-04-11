# Boss Helper

## Project Shape

- This repo is a browser extension plus a local companion stack: `bridge -> relay -> extension background -> Boss page controller`.
- External automation does not talk to the extension directly. The supported path is `MCP -> bridge HTTP/SSE -> relay page -> extension -> page controller`.
- Key entrypoints:
  - `src/entrypoints/background.ts`
  - `src/pages/zhipin/hooks/useDeliveryControl.ts`
  - `scripts/agent-bridge.mjs`
  - `scripts/mcp/`

## Build And Verification

- Install: `pnpm install`
- Typecheck: `pnpm check`
- Lint: `pnpm lint`
- Unit tests: `pnpm test`
- Agent-chain checks: `pnpm agent:doctor` and `pnpm agent:cli -- status`

## MCP And Relay Rules

- If a task mentions external agents, MCP, bridge, relay, OpenCode, CLI automation, or Boss Helper orchestration, read `docs/llm-agent-mcp.md` and `docs/bridge-mcp-deployment.md` before editing code.
- Do not assume `pnpm agent:mcp` starts the bridge. It only exposes stdio MCP tools.
- Before any page-level action, prefer this readiness sequence:
  1. `boss_helper_health`
  2. `boss_helper_status`
  3. `boss_helper_agent_context`
- Preferred workflow is observe first, then `boss_helper_navigate` / `boss_helper_jobs_list` / `boss_helper_jobs_detail`, and only then `boss_helper_start`.
- If external AI review is enabled, close the `job-pending-review -> boss_helper_jobs_review` loop instead of bypassing it.

## Editing Conventions

- Keep changes within existing boundaries: `src/pages/zhipin/`, `src/site-adapters/`, `src/composables/useApplying/`, `src/message/`, and `scripts/`.
- If you change agent commands, payloads, event types, bridge endpoints, or MCP tools, update `README.md`, `docs/bridge-mcp-deployment.md`, and `docs/llm-agent-mcp.md`.
- Do not commit generated local files such as `.boss-helper-agent-token`, `.boss-helper-agent-cert.json`, `.boss-helper-agent-bridge.log`, `.boss-helper-agent-bridge.pid`, or `.env*`.
