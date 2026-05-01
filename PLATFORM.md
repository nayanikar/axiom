# Axiom — Platform overview

Single reference for **what the product does**, **how it is built**, and **how it runs**. Visual and UX specifics are **at the end** and in the linked design docs.

> **Codename:** repository folders and some identifiers still use `swarmlearn`. The product name in the UI is **Axiom**.

---

## 1. Features

### For the learner

- **Topic queue** — Submit a question or topic once; no chat session required. Topics move through statuses from queued to done (or capped).
- **Seven teachers** — Distinct LLM-backed roles (e.g. foundations, analogy, history, challenge, connection, practice, recall) each contribute a “chapter” to the same topic. You read their output like a short book, not a thread.
- **Stigmergic coordination** — Teachers watch a shared **Intent Space** ([Spacebase1](https://spacebase1.differ.ac)): intents, promises, and completes make work observable and coordinated without a single orchestrator chat.
- **Spawned follow-ups** — Agents may create **child topics** (agent traces) linked to a parent, within configured depth/child caps.
- **Live activity** — Optional rail shows what agents are doing; the UI stays fresh with **SSE** plus polling.
- **Knowledge graph** — After a topic finishes, a **cartographer** extracts fields, concepts, and links into a navigable graph. Overview and focus modes; hover to isolate branches; open a topic board from the graph.
- **Intent Space binding** — Operators can **claim** a Spacebase1 space from the app so agents post to a real space; otherwise the app can run in a simulated/local mode depending on configuration.

### For operators

- Pause/resume agents globally.
- Space status, observatory link (when bound), and claim / bind flow via dialog.
- SQLite persistence for topics, responses, graph, and binding metadata.

---

## 2. Architecture

### Stack

| Layer | Technology |
|--------|------------|
| Frontend | React 19, Vite 8, TanStack React Query, Tailwind CSS v4, `@microsoft/fetch-event-source` (SSE) |
| Backend | Python 3.10+, FastAPI, SQLAlchemy (async), aiosqlite |
| Database | SQLite (`database_url` in settings; default file under `backend/`) |
| LLM | Anthropic API — teacher content and graph extraction |
| External | Spacebase1 HTTP station (when bound) |

### Process model

- **Single FastAPI process** hosts REST + SSE. On startup it initializes the DB, then launches background **asyncio** tasks:
  - **SpaceWatcher** — Polls the bound space and builds an in-memory snapshot for workers.
  - **Seven AgentWorkers** — One loop per teacher: pick eligible topics, call Anthropic, update DB, post to Spacebase when connected, emit SSE, optionally spawn child topics.
  - **Cartographer** — Finds finished topics not yet mapped; calls graph extraction; writes nodes/edges; emits `graph.updated`.

### Backend layout (high level)

| Area | Role |
|------|------|
| `app/main.py` | App factory, lifespan, CORS |
| `app/config.py` | Settings (env / `.env`) |
| `app/models.py` | Topics, agent responses, worker state, graph, space binding, … |
| `app/events.py` | In-memory SSE broker + short replay |
| `app/routers/` | REST + SSE endpoint (`/api/events` streams `text/event-stream`) |
| `app/services/spacebase.py` | Spacebase1 session, claim, intents |
| `app/services/space_watcher.py` | Snapshot builder |
| `app/services/agent_worker.py` | Per-teacher worker loops |
| `app/services/cartographer.py` | Graph extraction pipeline |
| `app/services/anthropic.py` | LLM calls |

### Frontend layout (high level)

| Area | Role |
|------|------|
| `App.jsx` | React Query data + `subscribeGlobalEvents` → cache invalidation; `view`: queue vs graph; `currentId` for selected topic |
| `AppShell.jsx` | Rails: queue list, main stage, agent panel; mobile sheets |
| `QueueList`, `TopicDetail`, `TeacherCard` | Queue navigation and reading experience |
| `KnowledgeGraph` + `KnowledgeGraphPage` | Force-directed graph + page chrome |
| `lib/api.js` | HTTP helpers; SSE with bounded retry when the API stream is unavailable |

There is **no React Router URL tree** for views: navigation is component state.

### Data that matters

- **Topic** — Text, status, optional parent for traces, cartography flag.
- **AgentResponse** — Per (topic, teacher) outcome and content.
- **GraphNode / GraphEdge** — Topic / field / concept nodes; typed edges (`extends`, `relates`, `surprising`, `spawned`, …).
- **SpaceBinding** — Tokens and metadata after a successful claim.

Detailed schema and filters: see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 3. How the platform works (end-to-end)

1. **Submit** — User posts a new topic via the composer. It is stored and appears in the queue.
2. **Observe** — SpaceWatcher refreshes space state; each **AgentWorker** periodically selects work using DB + snapshot rules (priorities and caps are teacher-specific in code).
3. **Respond** — For a claimed topic, a worker may call **Anthropic**, write an **AgentResponse**, and record intent-space traffic when bound. SSE events (`topic.claimed`, `topic.responded`, …) invalidate the UI caches.
4. **Branch** — Under limits, workers can insert **child topics** linked to the parent; the queue and graph views show lineage where relevant.
5. **Finish** — When all seven contributions for a topic are done (or errors are handled), status becomes **done** (or capped).
6. **Map** — The **Cartographer** picks uncartographed done topics, runs **extract_graph**, persists **GraphNode** / **GraphEdge**, syncs spawn edges, and emits **graph.updated**.
7. **Browse** — User switches between **Boards** (queue + reading) and **Knowledge graph**; graph API returns data the frontend reduces to overview or neighborhood focus client-side.

**Development wiring:** Vite dev server proxies `/api` to `http://127.0.0.1:8000`. Run the API from `backend/` (see [ARCHITECTURE.md](ARCHITECTURE.md) or `npm run dev:api` from repo root).

**Without the full stack:** SSE may retry; REST may error or return partial data; Spacebase restore may log warnings if stored credentials expired — see [ARCHITECTURE.md](ARCHITECTURE.md) failure modes.

---

## 4. Design (visual & UX) — summary at the end

- **Design system:** CSS variables and Tailwind in `src/index.css` — spacing, radius, motion, warm **editorial** palette (parchment / cream surfaces, warm charcoal text, terracotta accent). Typography: **DM Sans** (UI), **Source Serif 4** (long reading / `prose-book`).
- **Accessibility:** Global `:focus-visible`, skip link, composer focus ring, sensible touch targets on critical controls; `prefers-reduced-motion` respected for animations.
- **Layout:** Three-column rhythm on large screens (queue rail, central stage, agent rail); mobile uses sheets for queue and agents. Knowledge graph uses token-driven SVG styling and interaction hints on the graph page.
- **Deep dives:**
  - Tokens and palette: [AXIOM_DESIGN.md](AXIOM_DESIGN.md)
  - Product narrative, mental model, IA, teacher copy roles: [DESIGN_BRIEF.md](DESIGN_BRIEF.md) (some legacy color examples there; live theme tokens are in `AXIOM_DESIGN.md` / `index.css`)
  - Build and secrets checklist: [AXIOM_CURSOR_AGENT.md](AXIOM_CURSOR_AGENT.md)

---

## Related documents

| Document | Focus |
|----------|--------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical behavior, modules, APIs, failure modes |
| [DESIGN_BRIEF.md](DESIGN_BRIEF.md) | UX/product design detail |
| [AXIOM_DESIGN.md](AXIOM_DESIGN.md) | Colors, tokens, layout notes |
