# Copilot instructions for boss-helper

## Build, lint, and validation commands

- Install dependencies: `pnpm install`
- Local extension dev:
  - Chrome: `pnpm dev`
  - Edge: `pnpm dev:edge`
  - Firefox: `pnpm dev:firefox`
- Type-check: `pnpm check`
- Lint: `pnpm lint`
- Auto-fix lint issues: `pnpm lint:fix`
- Format: `pnpm fmt`
- Check formatting only: `pnpm fmt:check`
- Build extension bundles:
  - Chrome: `pnpm build:chrome`
  - Edge: `pnpm build:edge`
  - Firefox: `pnpm build:firefox`
  - All browsers: `pnpm build`
- Package distributables: `pnpm zip`
- Agent bridge / CLI:
  - Start bridge and open relay page: `pnpm agent:start`
  - Start bridge only: `pnpm agent:bridge`
  - Inspect bridge / relay state: `pnpm agent:doctor`
  - Send a command through the CLI wrapper: `pnpm agent:cli -- stats`

There is currently **no automated test script or single-test runner** in `package.json`. Do not invent `pnpm test` or single-file test commands for this repository.

Prefer `package.json` over `.github/workflows/main.yml` when looking for build commands. The workflow still references `pnpm run build:noTsc`, but that script does not exist.

## High-level architecture

- This repo is a **WXT browser extension** plus a **local companion bridge/CLI** for agent automation. The extension itself does **not** listen on a local HTTP port; the local server in `scripts/agent-bridge.mjs` does.
- `src/entrypoints/content.ts` is the content-script entrypoint. It registers the content/background message bridge, loads shared styles, and injects `main-world.js` into the page.
- `src/entrypoints/main-world.ts` runs in the page context so it can hook Boss 直聘's own Vue/router state. It routes supported job pages to `src/pages/zhipin` and mounts the top-level Vue UI (`src/App.vue`) once per page.
- `src/pages/zhipin/components/Ui.vue` is the main in-page control surface. On mount it initializes config, user/cookie state, model state, job list sync, pager state, and the window agent bridge.
- `src/pages/zhipin/hooks/useDeliveryControl.ts` is the **page-side automation boundary**. It exposes the command handler used by the external agent flow (`start`, `pause`, `resume`, `jobs.list`, `jobs.detail`, `config.update`, chat commands, logs, stats) and emits structured agent events.
- `src/composables/useApplying/index.ts` defines the delivery pipeline order. Filters like duplicate-company, salary/company-size checks, card loading, activity checks, map distance, AI filtering, and greeting all run through that pipeline.
- `src/stores/jobs.ts` mirrors Boss page data into a reactive job list and lazily loads detailed card data by calling the page's own Vue methods. Changes to job selection/detail loading usually belong here, not in the background script.
- `src/message/background.ts`, `src/message/contentScript.ts`, and `src/message/index.ts` standardize cross-context communication with `comctx`. Background owns browser-only operations like cookies, notifications, and cross-origin fetch.
- `scripts/agent-launch.mjs`, `scripts/agent-bridge.mjs`, and `scripts/agent-cli.mjs` implement the local automation surface described in the README: CLI/HTTP -> relay page -> extension background/content -> page controller.

## MCP servers

- A **Playwright MCP server** is a good fit for this repo when a task needs browser-level verification instead of code-only reasoning.
- Use it for changes that affect Boss page DOM hooks, the in-page Vue panel in `src/pages/zhipin`, the relay page served by `scripts/agent-bridge.mjs`, or end-to-end command flow across relay -> extension -> page controller.
- It is especially useful when touching selectors in `elmGetter`, websocket/chat capture behavior, page navigation/paging, or any feature where the extension must stay attached to a live Boss page.

## Key conventions

- **Storage key prefixes matter.** Extension storage keys use `local:`, `session:`, `sync:`, or `managed:` prefixes. In `src/message/contentScript.ts`, unprefixed keys are normalized to `sync:` automatically. Most long-lived app state in this repo uses explicit `local:*` keys.
- **Route config changes through the config store.** Runtime config updates should go through `useConf().applyRuntimeConfigPatch()` and, for external agent updates, `validateConfigPatch()` in `src/stores/conf/validation.ts`. Avoid ad hoc mutation of persisted config blobs.
- **Delivery state is page-scoped, not background-scoped.** `useCommon()` holds the batch lock/stop/state flags, `useStatistics()` provides the stats snapshots used by the agent API, and `useLog()` is the source for `logs.query`.
- **Job status and agent state names are shared contracts.** Job pipeline status uses `pending | wait | running | success | error | warn`. Agent state uses `idle | running | pausing | paused | completed | error`. Keep those enums aligned when extending UI, logs, or agent responses.
- **Pipeline ordering is intentional.** The delivery pipeline in `src/composables/useApplying/index.ts` does cheap filters first, then lazy-loads the card, then runs heavier checks such as amap distance and AI filtering. When adding a new filter, place it in the pipeline deliberately and consider cache implications.
- **Pipeline cache is per-user in practice.** `src/composables/usePipelineCache.ts` caches non-error pipeline results, and `src/composables/useApplying/index.ts` keys cache managers by current user ID. Delivery/cache changes should account for user switching.
- **Chat history comes from intercepted websocket traffic.** `src/pages/zhipin/hooks/useChatStream.ts` patches websocket/send wrappers and reconstructs conversations from live frames; there is no separate polling layer for the chat agent commands.
- **Config UI metadata lives with the config schema.** `src/stores/conf/info.ts` holds labels, help text, and examples, while `config_level` gates which settings are exposed. If you add or rename config fields, update both the schema/defaults and the metadata/help text.
