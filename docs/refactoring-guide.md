# BossHelper Refactoring Guide

> **This is the entry point.** Hand this file to the next agent to start refactoring.

## Quick Context

BossHelper is a browser extension (WXT + Vue 3 + Pinia) that automates job application on zhipin.com. ~20K lines of TypeScript across 110+ source files.

## Documents

| Document | Purpose | When to Read |
|---|---|---|
| **This file** | Entry point, quick orientation | First |
| [architecture-analysis.md](./architecture-analysis.md) | Full architecture, module map, data flow, identified issues | When you need to understand any subsystem |
| [refactoring-tasks.md](./refactoring-tasks.md) | All refactoring tasks with steps, files, and acceptance criteria | When you're ready to execute |

## Architecture at a Glance

```
3-Layer Extension:
  background.ts (service worker) ← agent relay, cookies, fetch proxy
  content.ts (isolated world)    ← message bridge, script injection
  main-world.ts (page context)   ← Vue Router hook, UI mount, page modules

Core Systems:
  useApplying/     ← Job pipeline engine (16 filter/greeting steps)
  message/agent.ts ← Agent protocol (16 commands, 16 events)
  stores/          ← Pinia state (conf, jobs, log, user, agent, signedKey)
  useWebSocket/    ← Chat protocol (protobuf + MQTT)
  site-adapters/   ← Multi-site abstraction (currently zhipin only)
  scripts/         ← Node.js agent infrastructure (bridge, CLI, MCP server)
```

## Top 4 Issues to Fix

1. **`useDeliveryControl.ts`** — God object (~300 lines). Split into controller + window bridge + assembly layer.
2. **`message/agent.ts`** — Protocol monolith (~600 lines). Split into commands/events/types/guards/validation.
3. **`filterSteps.ts`** — 13 filters in one file (~500 lines). Group by concern: dedup, keyword, range, status.
4. **Dual protobuf schema** — `handler.ts` + `type.ts` define the same structure independently. Merge to single `.proto` source.

## Execution Order

```
Wave 1: Structure splits (agent.ts, filterSteps, useDeliveryControl, utils.ts)
Wave 2: Naming & cleanup (store naming, exports, dead code, storage migration)
Wave 3: Protobuf unification
Wave 4: Test coverage & docs
```

Each task is independent within its Wave. All use barrel re-exports for backward compatibility.

## Key Commands

```bash
pnpm dev              # Dev server (Chrome)
pnpm build:chrome     # Production build
pnpm test             # Unit tests (vitest)
pnpm test:e2e         # E2E tests (playwright)
pnpm lint             # Lint (oxlint)
pnpm format           # Format (oxfmt)
pnpm typecheck        # Type check (vue-tsc)
```

## Rules for Refactoring

1. **No behavior changes.** Refactoring only. Functional changes go in separate PRs.
2. **Run `pnpm test` after every task.** No regressions.
3. **Use barrel re-exports** when splitting files. Existing imports must not break.
4. **Don't touch host page integration** (`useVue.ts`, selectors, WebSocket hooks) unless specifically tasked. These are fragile.
5. **Verify with `pnpm typecheck`** after file moves or renames.

## Start Here

1. Read [refactoring-tasks.md](./refactoring-tasks.md) Task 1.1 (split `agent.ts`)
2. It's the lowest risk, highest value task — purely splitting types into sub-files with barrel re-export
3. Then proceed through Wave 1 tasks in order
