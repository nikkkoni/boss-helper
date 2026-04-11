# BossHelper Refactoring Guide

> **This is the entry point.** Hand this file to the next agent to start refactoring.

## Quick Context

BossHelper is a browser extension (WXT + Vue 3 + Pinia) that automates job application on zhipin.com. ~20K lines of TypeScript across 110+ source files.

## Current Progress

- 2026-04-11: Wave 1 已完成，`message/agent.ts`、`filterSteps.ts`、`useDeliveryControl.ts`、`useApplying/utils.ts` 已按任务单拆分。
- 2026-04-11: Wave 2 已完成，`useCommon` / `useStatistics` 已迁入 `src/stores/`，`elmGetter` 与 `ChatProtobufHandler` 已统一为 named export，并抽出 `src/utils/storageMigration.ts` 复用存储迁移逻辑。
- 2026-04-11: Wave 3 已完成，聊天协议编码/解码统一改为 `chat.proto` 单一来源，`src/composables/useWebSocket/type.ts` 仅保留 TypeScript 接口，`AGENT_PROTOCOL_VERSION` 已通过 `shared/agentProtocol.js` 在扩展与 Node 脚本间共享。
- 当前入口仍保持 barrel 与兼容导出策略，现有 `@/message/agent`、`filterSteps.ts` 与页面级 `useDeliver` / `usePager` consumer import 不需要继续迁移。
- 下一步建议从 Wave 4 Task 4.1 开始，补齐拆分后模块测试并清理根目录文档。

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
  useApplying/     ← Job pipeline engine (filters/, zhipinApi.ts, rangeMatch.ts)
  message/agent.ts ← Barrel to message/agent/ protocol modules
  stores/          ← Pinia state (agent, common, conf, jobs, log, signedKey, statistics, user)
  useWebSocket/    ← Chat protocol (protobuf + MQTT)
  site-adapters/   ← Multi-site abstraction (currently zhipin only)
  scripts/         ← Node.js agent infrastructure (bridge, CLI, MCP server)
```

## Top 4 Issues to Fix

1. **`useDeliveryControl.ts`** — 已拆为 assembly + `agentController.ts` + `agentWindowBridge.ts`
2. **`message/agent.ts`** — 已改为 barrel，协议拆入 `src/message/agent/`
3. **`filterSteps.ts`** — 已改为 `services/filters/` barrel，按职责分组
4. **Dual protobuf schema** — 已统一为 `.proto` 单一来源，`type.ts` 仅保留接口定义，`Message` / 聊天流解析复用同一套 runtime type。

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

1. Read [refactoring-tasks.md](./refactoring-tasks.md) Task 4.1
2. Wave 1 到 Wave 3 已完成，接下来进入测试覆盖与文档清理
3. 保持当前 barrel、named export 与 shared constant 策略，并在补测后继续执行 `pnpm test`、`pnpm check`、`pnpm lint`
