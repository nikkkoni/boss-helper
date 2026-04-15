# Boss Helper

## Fast Map

- Single-package `pnpm` repo. CI uses Node `20.19.0` and `pnpm` 9.
- Runtime chain is `bridge HTTP/SSE -> relay page -> extension background -> page controller`; external automation never talks to the Boss page directly.
- Key entrypoints:
  - `src/entrypoints/background.ts`: validates relay origin/token and forwards external commands.
  - `src/entrypoints/main-world.ts`: selects the site adapter, mounts Vue, and runs page modules.
  - `src/pages/zhipin/hooks/useDeliveryControl.ts`: page-side command hub for `start`, `resume`, `jobs.*`, `config.update`, and `chat.send`.
  - `scripts/agent-bridge.mjs` and `scripts/mcp/`: transport layers, not the place for Zhipin business logic.

## Boundaries

- Supported live routes are only `/web/geek/job`, `/web/geek/job-recommend`, and `/web/geek/jobs`.
- DOM and route-shape changes usually belong in `src/utils/selectors.ts` and `src/site-adapters/zhipin/adapter.ts`; do not push Zhipin-specific logic into `src/message/` or `scripts/`.
- Pipeline and delivery behavior lives under `src/composables/useApplying/services/` and `src/pages/zhipin/hooks/`.

## Commands

- Install: `pnpm install`
- Minimum local gate: `pnpm lint && pnpm check && pnpm test -- --run`
- CI order for risky changes: `pnpm lint`, `pnpm check`, `pnpm test:coverage`, `pnpm build:chrome`, `pnpm exec playwright test`, `pnpm build:firefox`, `pnpm build:edge`
- Single Vitest file: `pnpm test -- tests/use-delivery-control.test.ts`
- E2E requires `.output/chrome-mv3`; run `pnpm build:chrome` first, then `pnpm exec playwright test tests/e2e/readiness.spec.ts` or `pnpm test:e2e`
- Bridge and relay checks: `pnpm agent:doctor` and `pnpm agent:cli status`

## Live Automation

- If a task touches MCP, bridge, relay, or CLI automation, read `docs/llm-agent-mcp.md` and `docs/bridge-mcp-deployment.md` first.
- `pnpm agent:mcp` only starts the stdio MCP server. It does not start the bridge or open the relay page.
- `pnpm agent:start -- --extension-id <id>` is the fastest local bootstrap; on macOS it opens the relay in `Google Chrome` by default.
- `opencode.json` assumes the local bridge is on `127.0.0.1:4317/4318`; using other ports breaks the repo-local `boss_helper` MCP until that config or env is updated.
- A connected relay is not enough; use `boss_helper_bootstrap_guide` or `boss_helper_agent_context` before page actions. `readiness.get` is mainly for lower-level debugging.
- Prefer the read-only flow `boss_helper_bootstrap_guide` or `boss_helper_agent_context` -> `boss_helper_plan_preview` -> `start`.
- When `suggestedAction=refresh-page`, prefer `boss_helper_jobs_refresh`; it reloads the current supported jobs page without changing search params.
- External `start`, `resume`, `chat.send`, and `config.update` that enables or edits enabled `aiReply` require `confirmHighRisk=true`. Blocked `start` and `resume` responses include a `preflight` summary.

## Tests, Generated Files, Docs

- Vitest defaults to `environment: 'node'`; DOM and component tests need `// @vitest-environment jsdom`.
- Playwright E2E uses fixtures from `tests/e2e/helpers/zhipin-fixture.ts`, not the live Boss site.
- `src/types/openapi.d.ts` is generated; use `pnpm openapi` (expects `http://localhost:8002/openapi.json`) instead of hand-editing it.
- The bridge token is baked into the extension build in `wxt.config.ts`. If `.boss-helper-agent-token` or `BOSS_HELPER_AGENT_BRIDGE_TOKEN` changes, rebuild the extension and restart the bridge and relay.
- If you change agent commands, bridge endpoints, MCP tools, or chat protocol/schema, update `README.md`, `docs/bridge-mcp-deployment.md`, and `docs/llm-agent-mcp.md`.
- Never commit `.boss-helper-agent-token`, `.boss-helper-agent-cert.json`, `.boss-helper-agent-bridge.log`, `.boss-helper-agent-bridge.pid`, or `.env*`.
