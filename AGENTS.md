# Boss Helper

## Fast Map

- Single-package `pnpm` repo. CI uses Node `20.19.0` and `pnpm` 9.
- Runtime chain is `bridge HTTP/SSE -> relay page -> extension background -> page controller`; external automation never talks to the Boss page directly.
- Key entrypoints:
  - `src/entrypoints/background.ts`: validates relay origin/token and forwards external commands.
  - `src/entrypoints/main-world.ts`: selects the site adapter, mounts Vue, and runs page modules.
  - `src/pages/zhipin/hooks/useDeliveryControl.ts`: page-side command hub for `start`, `resume`, `jobs.*`, and `config.update`.
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
- Bridge lifecycle checks: `pnpm agent:doctor`, `pnpm agent:cli status`, and `pnpm agent:stop` when you need to shut bridge down

## Live Automation

- If a task touches MCP, bridge, relay, or CLI automation, read `docs/llm-agent-mcp.md` and `docs/bridge-mcp-deployment.md` first.
- `pnpm agent:mcp` no longer auto-bootstraps browser state by default; prefer a manually prepared real-browser chain, or pass `--bootstrap` only when you explicitly want it to open relay and Boss URLs.
- `pnpm agent:start` is the fastest local bootstrap for preparing bridge/build artifacts and opening relay/Boss URLs in a real browser, but it does not directly automate the Boss page.
- `opencode.json` assumes the local bridge is on `127.0.0.1:4317/4318`; using other ports breaks the repo-local `boss_helper` MCP until that config or env is updated.
- A connected relay is not enough; use `boss_helper_bootstrap_guide` or `boss_helper_agent_context` before page actions. `readiness.get` is mainly for lower-level debugging.
- Prefer the read-only flow `boss_helper_bootstrap_guide` or `boss_helper_agent_context` -> `boss_helper_plan_preview` -> `start`.
- When `suggestedAction=refresh-page`, prefer `boss_helper_jobs_refresh`; it reloads the current supported jobs page without changing search params.
- External `start` and `resume` require `confirmHighRisk=true`. Blocked `start` and `resume` responses include a `preflight` summary.

## Tests, Generated Files, Docs

- Vitest defaults to `environment: 'node'`; DOM and component tests need `// @vitest-environment jsdom`.
- Playwright E2E uses fixtures from `tests/e2e/helpers/zhipin-fixture.ts`, not the live Boss site.
- The bridge token is baked into the extension build in `wxt.config.ts`. The new bootstrap flow tracks the last built token and auto-runs `pnpm build:chrome` when needed; the extension still needs to be installed once into the real Chrome profile before relay events can connect.
- If you change agent commands, bridge endpoints, MCP tools, or chat protocol/schema, update `README.md`, `docs/bridge-mcp-deployment.md`, and `docs/llm-agent-mcp.md`.
- Never commit `.boss-helper-agent-token`, `.boss-helper-agent-cert.json`, `.boss-helper-agent-bridge.log`, `.boss-helper-agent-bridge.pid`, or `.env*`.
