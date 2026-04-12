# BossHelper Architecture Analysis

> Generated: 2026-04-12 | Source: ~20,400 lines across 110+ source files | Version: 0.4.4

## 1. Project Overview

BossHelper is a browser extension for the BOSS Zhipin (zhipin.com) job platform, automating job filtering, AI-based evaluation, and one-click resume delivery. Built with WXT + Vue 3 + Pinia, targeting Chrome/Firefox/Edge (MV3).

### Technology Stack

| Layer | Technology |
|---|---|
| Extension Framework | WXT 0.20 (Vite-based) |
| UI | Vue 3.5 + Element Plus 2.13 (namespace `ehp`) |
| State | Pinia 3.0 |
| Language | TypeScript 5.9 + Vue JSX |
| HTTP | Axios (host page), `fetch` (extension), `openapi-fetch` (typed API) |
| AI/LLM | OpenAI SDK 4.x, `fetch-event-stream`, `partial-json` |
| Chat Protocol | protobufjs (`chat.proto` runtime parsing + typed helper interfaces) |
| Testing | Vitest 4.1 (unit, 80% coverage) + Playwright (E2E) |
| Lint/Format | oxlint + oxfmt (Rust-based) |
| Build Targets | Chrome MV3, Firefox MV2, Edge MV3 |

---

## 2. Project Structure

```
boss-helper/
├── src/
│   ├── entrypoints/           # 3 entry points (background, content, main-world)
│   ├── App.vue                # Root overlay UI component
│   ├── main.scss              # Global styles
│   ├── env.d.ts               # Environment type declarations
│   │
│   ├── components/            # Vue components
│   │   ├── chat/              #   Chat dialog
│   │   ├── conf/              #   Account config (User.vue)
│   │   ├── form/              #   Form controls (FormItem, FormSelect, FormSwitch, SalaryRange)
│   │   ├── icon/              #   Icon components + store icon
│   │   ├── llms/              #   LLM config UI (ConfigLLM, CreateLLM, LLMForm, Selectllm)
│   │   ├── Alert.ts           #   Alert utility
│   │   ├── Jobcard.vue        #   Job card display
│   │   └── SafeHtml.vue       #   DOMPurify wrapper
│   │
│   ├── composables/           # Vue composables
│   │   ├── useApplying/       #   *Core* job application pipeline engine
│   │   │   ├── index.ts       #     Entry: cache manager LRU, createHandle factory
│   │   │   ├── handles.ts     #     Wires 16 named StepFactory instances
│   │   │   ├── type.ts        #     Step, Pipeline, Handler types
│   │   │   ├── utils.ts       #     Barrel: parseFiltering/errorHandle + compatibility exports
│   │   │   ├── zhipinApi.ts   #     zhipin API calls (requestCard, sendPublishReq, etc.)
│   │   │   ├── rangeMatch.ts  #     Range parsing/matching helpers
│   │   │   └── services/      #     Pipeline sub-modules
│   │   │       ├── aiFiltering.ts       # LLM-based job scoring
│   │   │       ├── amapStep.ts          # Geocoding + distance calc
│   │   │       ├── chatPrompt.ts        # Bridge to chat UI for AI prompts
│   │   │       ├── filterSteps.ts       # Barrel for services/filters/*
│   │   │       ├── filters/             # Rule-based filter groups (dedup/keyword/location/range/status/amap)
│   │   │       ├── greeting.ts          # Message sending (template/AI/external)
│   │   │       ├── greetingSteps.ts     # Greeting pipeline steps
│   │   │       ├── pipelineCompiler.ts  # Compiles Pipeline -> before/after queues
│   │   │       ├── pipelineFactory.ts   # Assembles the default pipeline
│   │   │       ├── usageTracker.ts      # AI token/cost tracking
│   │   │       └── zhipinRateLimit.ts   # 1200ms min-interval gate
│   │   ├── useChat.ts         #   In-memory chat message store
│   │   ├── useChatMessageId.ts#   Monotonic ID generator for chat
│   │   ├── useModel/          #   LLM model management
│   │   │   ├── index.ts       #     Pinia store: model persistence, VIP merge
│   │   │   ├── openai.ts      #     OpenAI-compatible client (circuit breaker, batching)
│   │   │   ├── signedKey.ts   #     Server-side VIP LLM client
│   │   │   ├── type.ts        #     Abstract Llm base class + types
│   │   │   └── common.ts      #     Shared model config fields
│   │   ├── usePipelineCache.ts#   Per-job result cache (LRU, TTL, persistent)
│   │   ├── useVue.ts          #   Host page Vue 2 instance hooking
│   │   └── useWebSocket/      #   Chat protocol (protobuf + MQTT)
│   │       ├── index.ts       #     Entry: registers globals
│   │       ├── handler.ts     #     Runtime proto parser (`ChatProtobufHandler`, named export)
│   │       ├── mqtt.ts        #     MQTT packet codec (retained for chat stream decoding/tests)
│   │       ├── protobuf.ts    #     Message class (send via 3 transport channels)
│   │       └── type.ts        #     TypeScript interfaces aligned to `chat.proto`
│   │
│   ├── message/               # Cross-context messaging (comctx RPC)
│   │   ├── index.ts           #   Page-side proxy (InjectAdapter + ExtStorage)
│   │   ├── agent.ts           #   Barrel export for src/message/agent/*
│   │   ├── agent/             #   Agent protocol modules (commands/events/types/guards/validation)
│   │   ├── background.ts      #   Background RPC service (cookies, fetch, notify)
│   │   ├── contentScript.ts   #   Content script bridge + agent forwarding
│   │   └── window.ts          #   window.postMessage primitives
│   │
│   ├── pages/zhipin/          # Page-specific logic
│   │   ├── index.ts           #   Page entry: mounts UI, init chat stream
│   │   ├── hooks/             #   Agent command handlers & batch orchestration
│   │   │   ├── agentBatchLoop.ts       # Core pagination loop (pure logic)
│   │   │   ├── agentEvents.ts          # In-page pub/sub event bus
│   │   │   ├── agentNavigate.ts        # URL builder delegation
│   │   │   ├── agentQueryShared.ts     # Shared query options interface
│   │   │   ├── agentReview.ts          # External AI filter review queue
│   │   │   ├── useAgentBatchEvents.ts  # Batch lifecycle event emission
│   │   │   ├── useAgentBatchRunner.ts  # Batch orchestrator (start/pause/resume/stop)
│   │   │   ├── useAgentBatchState.ts   # Read-only state snapshots
│   │   │   ├── useAgentChatQueries.ts  # Chat command handlers
│   │   │   ├── useAgentJobQueries.ts   # Job/log command handlers
│   │   │   ├── useAgentMetaQueries.ts  # Config/resume/navigate handlers
│   │   │   ├── useAgentQueries.ts      # Composition root for queries
│   │   │   ├── useChatStream.ts        # WebSocket interception init
│   │   │   ├── useDeliver.ts           # Per-page job iteration (Pinia store)
│   │   │   ├── agentController.ts      # Command dispatch factory
│   │   │   ├── agentWindowBridge.ts    # Window bridge registration
│   │   │   ├── useDeliveryControl.ts   # Assembly layer for controller + bridge
│   │   │   └── usePager.ts            # Pagination (Pinia store, host Vue hooks)
│   │   ├── services/           #   Service layer
│   │   │   ├── agentBatchPayload.ts    # Start payload normalization
│   │   │   ├── chatStreamHooks.ts      # WebSocket monkey-patching
│   │   │   ├── chatStreamMessages.ts   # Protobuf decode -> chat store
│   │   │   └── deliverExecution.ts     # Single-job execution unit
│   │   └── shared/
│   │       └── jobMapping.ts           # Internal -> agent protocol mapping
│   │
│   ├── site-adapters/         # Multi-site abstraction layer
│   │   ├── index.ts           #   Registry & resolution
│   │   ├── type.ts            #   SiteAdapter<TJobItem, TJobDetail> interface
│   │   └── zhipin/
│   │       └── adapter.ts     #   Concrete zhipin.com adapter
│   │
│   ├── stores/                # Pinia stores
│   │   ├── agent.ts           #   Batch runtime state
│   │   ├── common.ts          #   Global delivery state flags
│   │   ├── conf/              #   Configuration management
│   │   │   ├── index.ts       #     Main store (load/save/migrate/template)
│   │   │   ├── info.ts        #     Default values + UI metadata
│   │   │   ├── shared.ts      #     Storage keys + sanitization
│   │   │   └── validation.ts  #     Agent config patch validation
│   │   ├── jobs.ts            #   Job list (hooks host Vue reactivity)
│   │   ├── log.tsx            #   Delivery log (typed error entries)
│   │   ├── logColumns.tsx     #   Log table column config (JSX)
│   │   ├── signedKey.ts       #   Backend auth (signed key, remote config)
│   │   ├── statistics.ts      #   Daily stats (auto-archive)
│   │   └── user.ts            #   User identity + multi-account switching
│   │
│   ├── types/                 # Type definitions
│   │   ├── bossData.d.ts      #   Ambient types for zhipin platform data
│   │   ├── deliverError.ts    #   Error class hierarchy (16 error types)
│   │   ├── formData.ts        #   Config schema (FormData, Statistics, etc.)
│   │   ├── pipelineCache.ts   #   Cache types
│   │   ├── mitem.d.ts         #   Template engine declaration
│   │   ├── openapi.d.ts       #   OpenAPI generated types
│   │   └── vueVirtualScroller.d.ts
│   │
│   ├── utils/                 # Utility modules
│   │   ├── amap.ts            #   AMap geocoding + distance API
│   │   ├── concurrency.ts     #   Concurrency limiter, task batcher, DOM scheduler
│   │   ├── deepmerge.ts       #   Deep merge + jsonClone (prototype-pollution safe)
│   │   ├── elmGetter.ts       #   DOM wait + MutationObserver utilities (`elmGetter`, named export)
│   │   ├── index.ts           #   UI helpers (notification, delay, loader, date format)
│   │   ├── jsonImportExport.ts#   Browser JSON file I/O
│   │   ├── logger.ts          #   Structured logger (clean console via iframe)
│   │   ├── monotonicId.ts     #   Monotonic ID generator
│   │   ├── parse.ts           #   JSON fence strip + partial parse
│   │   ├── request.ts         #   HTTP wrapper (fetch, background proxy, loader)
│   │   ├── retry.ts           #   Retry, circuit breaker, min-interval gate
│   │   ├── safeHtml.ts        #   DOMPurify wrappers (rich HTML + SVG)
│   │   ├── selectors.ts       #   CSS selector registry + route detection
│   │   └── storageMigration.ts#   Shared storage key migration helpers
│   │
│   └── assets/
│       └── chat.proto         #   Chat protobuf schema
│
├── scripts/                   # Node.js agent infrastructure
│   ├── agent-bridge.mjs       #   Localhost HTTP/HTTPS/SSE bridge
│   ├── agent-cli.mjs          #   CLI interface
│   ├── agent-launch.mjs       #   Process launcher
│   ├── agent-mcp-server.mjs   #   MCP compatibility entrypoint
│   ├── agent-orchestrator.mjs #   Multi-step orchestration
│   ├── agent-relay.html       #   Browser relay page (command forward + event uplink + keepalive)
│   ├── agent-security.mjs     #   Token generation + TLS cert management
│   ├── agent-security.d.mts   #   Type declarations
│   ├── mcp/                   #   MCP transport / catalog / handlers split modules
│   │   ├── bridge-client.mjs
│   │   ├── catalog.mjs
│   │   ├── context.mjs
│   │   ├── handlers.mjs
│   │   ├── prompt-definitions.mjs
│   │   ├── resource-definitions.mjs
│   │   ├── server.mjs
│   │   └── tool-definitions.mjs
│   ├── shared/                #   Shared Node-side helpers
│   │   ├── logging.mjs
│   │   ├── protocol.mjs
│   │   └── security.mjs
│   ├── types.d.ts             #   Shared type declarations
│   └── submit.sh              #   Web store submission
│
├── shared/
│   └── agentProtocol.js       #   Cross-runtime agent protocol version constant
│
├── tests/                     # ~80 test files
│   ├── setup/vitest.setup.ts
│   ├── helpers/               # Test utilities
│   ├── mocks/                 # WXT, message, logger mocks
│   ├── e2e/                   # Playwright E2E tests
│   └── *.test.ts              # Unit tests
│
├── public/                    # Static assets
│   └── _locales/              # i18n (en, zh_CN)
│
├── wxt.config.ts              # WXT/Vite build config
├── vitest.config.ts           # Test config
├── playwright.config.ts       # E2E config
├── package.json               # Dependencies & scripts
└── tsconfig.json              # TS config (extends WXT)
```

---

## 3. Companion + Three-Layer Entry Point Architecture

```
┌─────────────────────────────────────────────────┐
│  External Caller                                 │
│  CLI / MCP / orchestrator / custom HTTP client   │
└──────────────┬──────────────────────────────────┘
               │ HTTP / HTTPS / SSE
┌──────────────▼──────────────────────────────────┐
│  Companion Bridge                               │
│  scripts/agent-bridge.mjs                       │
│  - /command, /batch                             │
│  - /events (bridge -> relay)                    │
│  - /agent-events (relay -> external watchers)   │
└──────────────┬──────────────────────────────────┘
               │ HTTPS session cookie + EventSource
┌──────────────▼──────────────────────────────────┐
│  Relay Page                                     │
│  scripts/agent-relay.html                       │
│  - Reads commands from /events                  │
│  - Calls chrome.runtime.sendMessage(...)        │
│  - Holds external event Port to extension       │
│  - Sends 20s keepalive for MV3 worker lifetime  │
└──────────────┬──────────────────────────────────┘
               │ chrome.runtime.sendMessage /
               │ chrome.runtime.connect
┌──────────────▼──────────────────────────────────┐
│  Layer 1: Background Service Worker             │
│  src/entrypoints/background.ts                  │
│  - Relay origin + token validation              │
│  - Tab discovery (findAgentTargetTab)            │
│  - External event port broadcasting             │
│  - Session storage init                         │
│  comctx RPC: BackgroundCounter                  │
│  (cookies, fetch proxy, notifications)          │
└──────────────┬──────────────────────────────────┘
               │ browser.tabs.sendMessage /
               │ browser.runtime.onMessage
┌──────────────▼──────────────────────────────────┐
│  Layer 2: Content Script (Isolated World)       │
│  src/entrypoints/content.ts                     │
│  - Agent message bridge registration            │
│  - Selector health checking                     │
│  - Injects main-world.js                        │
│  comctx RPC: ContentCounter                     │
│  (storage, background delegation)               │
└──────────────┬──────────────────────────────────┘
               │ window.postMessage (same origin)
┌──────────────▼──────────────────────────────────┐
│  Layer 3: Main World (Page JS Context)          │
│  src/entrypoints/main-world.ts                  │
│  - Hooks host Vue Router (afterEach)            │
│  - Loads page modules (adapter.loadPageModule)  │
│  - Mounts App.vue overlay UI                    │
│  - Installs Axios loader interceptors           │
│  comctx RPC: counter (InjectAdapter)            │
└─────────────────────────────────────────────────┘
```

### Command Flow (External Caller -> Page Controller)

```
External Caller
  → bridge: POST /command (or /batch)
    → bridge queueCommand()
      → relay page: /events SSE "command"
        → relay page: handleCommand()
          → chrome.runtime.sendMessage(extensionId, { bridgeToken, ...request })
            → background.ts: onMessageExternal / forwardAgentRequest
              → browser.tabs.sendMessage(targetTab, request)
                → contentScript.ts: registerAgentMessageBridge
                  → window.postMessage (BossHelperAgentBridgeRequest)
                    → main-world: useDeliveryControl.registerWindowAgentBridge
                      → controller.handle(request)
                    → window.postMessage (BossHelperAgentBridgeResponse)
                  ← contentScript.ts: forward response
                ← browser.tabs.sendMessage response
              ← background.ts: return response to relay page
          → relay page: POST /responses
        ← bridge: resolve pending response
  ← bridge HTTP response
```

### Event Flow (Page -> External Watchers)

```
Page: emitBossHelperAgentEvent(event)
  → registerWindowAgentBridge listener
    → window.postMessage (BossHelperAgentEventBridgeMessage)
      → contentScript.ts: registerAgentMessageBridge
        → browser.runtime.sendMessage (AGENT_EVENT_FORWARD)
          → background.ts: broadcast to all connected external event ports
            → relay page: runtime.connect(...eventPortName).onMessage
              → relay page: POST /agent-events
                → bridge: fan-out to /agent-events SSE subscribers
```

### Runtime Semantics

- `GET /health` and `GET /status` expose `relayConnected`, but this only means bridge currently has at least one relay page connected to `/events`. It does not prove the target Boss tab is ready, nor that the relay page's extension event port is healthy.
- relay page上的 `events: connected` 徽标表示 `agent-relay.html` 已通过 `chrome.runtime.connect(...)` 连上扩展 background 的外部事件端口。这和 `/status.eventSubscribers` 不是一个指标。
- `/status.eventSubscribers` 统计的是谁在订阅 bridge 的 `GET /agent-events` SSE，例如 orchestrator、MCP watcher 或外部脚本；它不统计 relay 页本身。
- relay page 现在会每 20 秒通过外部事件端口发送一次 keepalive，以降低 Chrome MV3 service worker 因空闲超时而周期性断开连接的概率。

---

## 4. Core Subsystem Analysis

### 4.1 Job Application Pipeline (`src/composables/useApplying/`)

The heart of the extension. A two-phase pipeline architecture:

**Pipeline Structure (from `pipelineFactory.ts`):**
```
Phase 1 (before): Filter & Evaluate
  1. communicated         # Skip already-contacted (cheap, no network)
  2. sameCompanyFilter    # Skip duplicate companies (dedup set)
  3. sameHrFilter         # Skip duplicate HRs (dedup set)
  4. jobTitle             # Keyword include/exclude (regex)
  5. company              # Company name filter (regex)
  6. salaryRange          # Range matching (supports H/D/M/K units)
  7. companySizeRange     # Range matching
  8. goldHunterFilter     # Skip headhunters
  9. [Guard: loadCard]    # Network call - only if all above pass
     ├── activityFilter   # Recruiter last active time
     ├── hrPosition       # HR title whitelist/blacklist
     ├── jobAddress        # Address keyword filter
     ├── jobFriendStatus  # Already friends check
     ├── jobContent       # Job description keywords (neg lookahead)
     ├── [Guard: resolveAmap]
     │   └── amap         # Distance/duration limits
     ├── aiFiltering      # LLM scoring (internal or external)
     └── greeting         # Message composition (AI/template/external)

Phase 2 (after): Post-Application Actions
  - Send greeting message via WebSocket (protobuf)
```

**Resilience Stack:**
- Circuit breaker on OpenAI calls (3 failures → 20s cooldown)
- Retry with exponential backoff (800ms base, 2x, max 5s, 2 retries)
- Request deduplication + 15s TTL cache (AI calls)
- Rate limiter for zhipin API (1200ms min interval)
- Pipeline result cache (LRU, per-processor TTL: AI 7d, amap 5d, basic 3d)
- Concurrency limiter (AI: max 1, DOM batch: max 1)

### 4.2 Agent System (`src/pages/zhipin/hooks/`, `src/message/agent/`)

**State Machine:**
```
idle → running → pausing → paused → (resume) → running → completed
                                                       → error
       ↑         (stop) ──────────────────────→ idle
```

**Command Set (16 commands):**
`start`, `pause`, `resume`, `resume.get`, `stop`, `stats`, `navigate`,
`chat.list`, `chat.history`, `chat.send`, `logs.query`,
`jobs.list`, `jobs.detail`, `jobs.review`, `config.get`, `config.update`

**Event Types (16 event types):**
State changes, batch lifecycle, job outcomes (succeeded/filtered/failed/pending-review),
rate limiting, limit reached, chat sent.

**Current Architecture:** `useDeliveryControl.ts` is now a thin assembly layer that wires
`useAgentBatchRunner`, `useAgentQueries`, `agentController.ts`, and `agentWindowBridge.ts`.

**Protocol Versioning:** `AGENT_PROTOCOL_VERSION` now lives in `shared/agentProtocol.js`,
and is reused by extension-side messaging plus Node bridge/MCP scripts.

**MCP Layer Status (2026-04-12):** the MCP stack is no longer just a thin transport wrapper.
`scripts/mcp/` now provides a catalog-driven layer with:

- low-level tool wrappers for bridge commands and event watching
- a higher-level context aggregator via `boss_helper_agent_context`
- reusable `resources` / `prompts` for autonomy workflow and external review closure

The recommended external control loop is now:

1. observe via `health` / `status` / `agent_context`
2. decide via `jobs.list` / `jobs.detail` / `resume.get`
3. execute via `start` / `stop` or `jobs.review`
4. observe again via `events_recent` / `wait_for_event`

However, the architecture still stops short of full unattended automation. The remaining gaps are
not basic transport, but higher-level runtime capabilities:

- cold-start bootstrap and environment self-checks
- page/account risk diagnostics
- structured recoverable error semantics
- dry-run / planning without side effects
- run session checkpointing and resumability
- guardrails and auditability for unattended execution

The implementation roadmap and handoff constraints for these gaps are tracked in [`../todo.md`](../todo.md).

### 4.3 Store Architecture (`src/stores/`)

```
                    ┌──────────────┐
                    │  signedKey   │──→ useModel (merge VIP models)
                    │  (auth+API)  │──→ user (shared user ID)
                    └──────────────┘
                          │
┌──────────┐       ┌──────▼───────┐       ┌───────────┐
│  agent   │       │    conf      │◄─────►│   user    │
│ (runtime)│       │  (config)    │ bridge │ (identity)│
└──────────┘       │  info.ts     │pattern │ (resume)  │
                   │  shared.ts   │       │ (cookies) │
                   │  validation  │       └───────────┘
                   └──────────────┘
                          │
                   ┌──────▼───────┐       ┌───────────┐
                   │    jobs      │──────→│    log    │
                   │ (host Vue    │       │ (results) │
                   │  hook)       │       │ logColumns│
                   └──────────────┘       └───────────┘
```

**Cross-Store Bridge:** `registerUserConfigSnapshotGetter` avoids circular dependency between `conf` and `user` stores.

**Storage Key Convention:** Keys prefixed with `local:`, `session:`, `sync:`, `managed:` are routed through the `comctx` storage abstraction to different browser storage backends. Legacy `sync:` → `session:` key migration is now centralized in `src/utils/storageMigration.ts`.

### 4.4 Host Page Integration

The extension deeply hooks into zhipin.com's internal Vue 2 instance:

- **`useVue.ts`**: `getRootVue()` finds root Vue via `__vue__` DOM property; `useHookVueData()` replaces property descriptors to mirror reactive state; `useHookVueFn()` extracts methods.
- **`jobs.ts`**: Hooks `vueJobList` and `vueJobDetail` from host Vue.
- **`usePager.ts`**: Hooks `pageVo` data and page change methods.
- **`main-world.ts`**: Hooks into Vue Router `afterEach` to react to SPA navigation.
- **`chatStreamHooks.ts`**: Monkey-patches `WebSocket.send()` and attaches `onmessage` listeners on 3 transport targets (`socket`, `ChatWebsocket`, `GeekChatCore`).

### 4.5 WebSocket/Chat Protocol

Single-schema protobuf approach:
1. **`chat.proto`** is the only schema source
2. **`handler.ts`** lazily parses the raw `.proto` once and exposes shared encode/decode helpers
3. **`type.ts`** only keeps lightweight TypeScript interfaces for decoded/encoded payloads

`Message.send()` and chat stream decoding now both reuse the same runtime protobuf type, avoiding schema drift. The send path still tries 3 transport channels: `GeekChatCore` → `ChatWebsocket` → error.

### 4.6 LLM Integration

**Dual-path architecture:**
1. **Self-hosted** (`openai.ts`): OpenAI-compatible API with structured output, circuit breaker, retry, and request batching
2. **Server-side VIP** (`signedKey.ts`): Delegates to boss-helper backend via signed API key

**AI features:**
- Job filtering with JSON Schema structured output (positive/negative scoring)
- Greeting message generation
- Resume-aware prompting (resume uploaded to backend)
- Usage tracking (tokens, cost per model)

---

## 5. Key Architectural Patterns

| Pattern | Usage |
|---|---|
| Two-phase pipeline (before/after) | `useApplying` - filter then greet |
| Guard steps (nested pipeline) | Expensive ops (card load, amap) only run if cheap filters pass |
| comctx RPC proxy | Cross-context method calls across 3 extension layers |
| Host Vue hooking | Property descriptor replacement to mirror reactive state |
| Adapter pattern | `SiteAdapter` interface for multi-site support (currently zhipin only) |
| Factory pattern | `StepFactory` functions, `createHandle`, `createDuplicateFilter` |
| LRU eviction | Pipeline cache (10K entries), cache managers (8 per user) |
| Circuit breaker | OpenAI calls (3 failures → 20s cooldown) |
| Request batching | AI calls deduped by prompt hash + 15s TTL |
| Monotonic IDs | Chat message ordering within same millisecond |
| Bridge pattern | `registerUserConfigSnapshotGetter` for cross-store dependency |
| Data migration | Versioned `FORM_DATA_MIGRATIONS` with ordered transforms |
| Error hierarchy | Factory-generated error classes mapped to log states |
| Sensitive data isolation | amap key in session storage, user ID stripped before persist |

---

## 6. External Dependencies & Integrations

| System | Purpose | Integration Point |
|---|---|---|
| BOSS Zhipin (zhipin.com) | Target platform | Vue hooks, DOM selectors, API calls, WebSocket |
| OpenAI-compatible LLM | Job filtering, greeting | `openai.ts` via `fetch` |
| boss-helper backend | VIP LLM, remote config, resume | `signedKey.ts` via `openapi-fetch` |
| AMap (Gaode Maps) | Geocoding, distance | `amap.ts` REST API |
| Browser Extension APIs | Storage, cookies, notifications, tabs | via WXT `#imports` |
| protobufjs | Chat message encoding | Shared `.proto` runtime parse + object encode/decode |
| mitem | Template compilation | Greeting message variables (`{{ card.jobName }}`) |

---

## 7. Data Flow Summary

```
[User opens zhipin.com]
  → content.ts injects main-world.js
    → main-world.ts hooks Vue Router
      → pages/zhipin/index.ts mounts UI
        → useDeliver + useAgentBatchRunner ready

[User/Agent triggers "start"]
  → useAgentBatchRunner.startBatch()
    → executeAgentBatchLoop() (pagination)
      → for each page:
        → useDeliver.jobListHandle() (per-job iteration)
          → executeDeliverJob():
            → compiledPipeline.before[] (filter chain)
              → cheap filters → loadCard → expensive filters → AI → greeting
            → adapter.applyToJob() (sendPublishReq)
            → compiledPipeline.after[] (send greeting)
          → handleDeliverSuccess/Failure()
          → finalizeDeliverIteration() (cache, delay)
        → goNextPage()
```

---

## 8. Identified Architectural Issues

### Critical

1. **`useDeliveryControl.ts` is a god object** - 已于 2026-04-11 拆为 assembly/controller/window bridge 三层。

2. **Dual protobuf schema** - 已于 2026-04-11 收敛为 `chat.proto` 单一来源；`handler.ts` / `protobuf.ts` / 聊天流解析共享同一 runtime type。

3. **Pinia store / composable identity confusion** - 已于 2026-04-11 部分收敛：全局 store `useCommon` / `useStatistics` 已迁入 `src/stores/`，页面级 `useDeliver` / `usePager` 保留在 `hooks/` 并补充 Pinia store 注释；`useModel` 仍保持历史命名。

4. **Agent protocol file is massive** - 已于 2026-04-11 拆为 `src/message/agent/` 多文件协议模块。

### Significant

5. **Host Vue hooking is fragile** - Property descriptor replacement on `__vue__` instances breaks if zhipin.com changes their Vue version or component structure. The selector health system partially mitigates this.

6. **Module-level singletons scattered** - `activeAdapter`, `activeSelectorRegistry`, `cacheManagers`, `lastIssuedId`, `aiLimiter`, `aiBatcher`, `activeLoaderStops` etc. are module-level mutable state. Makes testing and reasoning harder.

7. **Mixed error handling languages** - Error messages are split between Chinese and English. Some user-facing, some developer-facing - the boundary is unclear.

8. **`useApplying/utils.ts` is overloaded** - 已于 2026-04-11 拆出 `zhipinApi.ts` 与 `rangeMatch.ts`。

9. **`filterSteps.ts` is too large** - 已于 2026-04-11 改为 `services/filters/` 分组结构。

10. **Autonomy layer is still fragmented** - MCP transport has already been split into `scripts/mcp/*`, but higher-level autonomy logic is still divided across bridge semantics, MCP tools/resources, and `agent-orchestrator`. The repo still lacks an MCP-native bootstrap / dry-run / checkpoint layer for unattended operation.

### Minor

11. **Legacy storage key migration** - 已于 2026-04-11 抽到 `src/utils/storageMigration.ts`，`conf` / `signedKey` / `useModel` 通过声明式配置复用。

12. **`mqtt.ts` is unused** - 2026-04-11 重新核对后确认仍被聊天流解析与协议测试使用，问题转为“注释过时”并已修正。

13. **Inconsistent export patterns** - 已于 2026-04-11 收敛：`ChatProtobufHandler` 与 `elmGetter` 改为 named export；`jobs.ts` / `log.tsx` 的 dual export 保留但补充了使用场景文档。

14. **Coverage thresholds are moderate** - 80% lines/functions, 75% branches. Given the complexity, higher would be appropriate for the pipeline engine.
