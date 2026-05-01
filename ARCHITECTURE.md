# Axiom — Technical architecture & behavior

Plain reference for rebuilding or operating the system. No visual design specification.

## What it is

A **single-page web app** backed by **FastAPI**. Users submit learning “topics” (questions). Seven LLM-backed **teachers** (workers) cooperate through a shared **intent space** ([Spacebase1](https://spacebase1)): they claim topics, reply, and may spawn child intents that become **child topics**. A **cartographer** job extracts **fields/concepts** into a SQLite-backed **graph** API. The browser loads data via REST and stays warm with **SSE** (`/api/events`).

## Stack

| Layer | Technology |
|--------|------------|
| Frontend | React 19, Vite 8, TanStack React Query, `@microsoft/fetch-event-source` |
| Backend | Python 3.10+, FastAPI, SQLAlchemy async, aiosqlite |
| DB | SQLite file `backend/swarmlearn.db` (path from `database_url` in settings) |
| LLM | Anthropic API (`anthropic` package) for teacher replies and graph extraction |
| External | Spacebase1 HTTP station (intents, promises, completes, scans) |

## Processes to run

1. **API**: `uvicorn app.main:app --host 127.0.0.1 --port 8000` from `backend/` (activate `.venv` first).
2. **Frontend**: `npm run dev` (or `npx vite`) in repo root; Vite **proxies** `/api` → `http://127.0.0.1:8000` (`vite.config.js`).

Browser uses the Vite origin (e.g. `http://127.0.0.1:5173`); API is not called cross-origin if everything goes through the proxy.

## Backend layout (logical)

```
app/main.py          — FastAPI app, CORS, lifespan
app/config.py        — Settings from env / .env (Anthropic key, DB URL, Spacebase origin, CORS, per-teacher poll intervals)
app/db.py            — Async engine, sessions
app/models.py        — Topic, AgentResponse, WorkerState, IntentEvent, GraphNode, GraphEdge, SpaceBinding
app/events.py        — In-memory SSE broker + short replay buffer
app/graph_filters.py — Exclude process-trace topics from graph output; helper for cartographer
app/teachers.py      — Static list of seven Teacher definitions
app/routers/         — teachers, space, agents_control, topics (includes /api/events SSE), graph
app/services/
  spacebase.py       — Session, claim, post_intent, scan — Spacebase1 integration
  space_watcher.py   — Polls space; builds in-memory SpaceSnapshot (intents, promises, completes, tree)
  agent_worker.py    — One async loop per teacher: pick topic, Anthropic, post to space, DB updates, spawn children
  cartographer.py    — Polls `done` topics without `cartographed_at`; calls extract_graph; writes graph_nodes/edges
  anthropic.py       — `call_teacher`, `extract_graph`
```

**Lifespan startup** (`main.py`): `init_db` → start `SpaceWatcher` → start 7× `AgentWorker` → start `Cartographer`. Shutdown stops them in reverse.

## Data model (short)

- **Topic**: id, text, status (`queued` → … → `done` / `capped`), `source` (`user-queue` | `agent-trace`), optional `parent_topic_id`, `depth`, `cartographed_at`.
- **AgentResponse**: one row per (topic, teacher) run: status, text, teacher ids, links to space message ids.
- **WorkerState**: last poll, picked topic, errors, daily call counts per teacher.
- **GraphNode / GraphEdge**: derived map (topic / field / concept nodes; typed edges: `extends`, `relates`, `surprising`, `spawned`).
- **SpaceBinding**: claimed space id, tokens, observatory URL, etc.

## Core runtime behavior

### SpaceWatcher

- On an interval (`watcher_interval_s`), lists messages from the bound space and nested intent spaces, builds a **SpaceSnapshot** in memory.
- Workers read this snapshot instead of each scanning Spacebase1 independently.

### AgentWorker (×7)

- Each teacher has its own asyncio task and **interval** (`AGENT_INTERVAL_<id>` overrides in settings).
- **Tick**: update `WorkerState` → choose an eligible **Topic** from DB + snapshot semantics (priorities differ per teacher in code) → if paused (`runtime_pause`), skip → optionally call **Anthropic** → post **PROMISE** / **COMPLETE** style traffic through `spacebase` → upsert **AgentResponse** → may insert **spawn** topics (`agent-trace`) under caps (`topic_max_children`, `topic_max_depth`).
- Emits SSE events (`topic.claimed`, `topic.responded`, `topic.spawned`, `agent.scanning`, etc.) via **broker**.
- Respect **daily caps** (`worker_daily_cap`).

### Cartographer

- Finds topics with `status == done"` and `cartographed_at IS NULL`.
- Builds text from stored **AgentResponses**, calls **`extract_graph`** (Anthropic) → persists **GraphNode** / **GraphEdge**.
- **`_sync_spawned_edges`**: materializes parent→child `spawned` edges from `Topic.parent_topic_id` (skips “process trace” intents that are filtered from the graph UI).
- Skips noisy **agent-trace** rows that match historian/connector boilerplate (“Pattern noticed:”, “Explore further:”) by marking them cartographed without graph extraction (`graph_filters`).
- Publishes `graph.updated` for SSE consumers.

### Graph API (`GET /api/graph`)

- Reads nodes/edges, joins topics, **filters out** process-trace-only topic nodes, drops orphan field/concepts, attaches **`explored`** (cartographed topic) per topic node, attaches response **weight** hints for sizing.

Frontend applies **overview** vs **focus** subgraph filters in JS (`knowledgeGraphViewModel.js`) — documented there in comments.

### Space / claim (`routers/space`)

- **POST /api/space/claim** — runs signup flow via Spacebase SDK, persists binding, exposes **observatory_url** etc. Frontend dialog triggers this.
- **GET /api/space/status** — binding + paused flags for UI.

### Agents pause (`agents_control`)

- Writes a shared flag consumed by workers and cartographer (`runtime_pause`) — broadcast `agents.paused` on change.

### SSE `/api/events` (defined under `topics` router)

- Subscribes to **broker**, sends replay buffer then live events (`text/event-stream`).
- Frontend **invalidates React Query caches** on event types (`topic.*`, `graph.updated`, `agent.*`, `agents.paused`) so polling is supplementary.

## Frontend layout (logical)

```
main.jsx → ThemeProvider, QueryClientProvider, App
App.jsx
  — React Query: teachers, topics, agents-state, space-status, topic detail, graph (when graph view active)
  — SSE: subscribeGlobalEvents → invalidate queries on events
  — view state: "queue" | "graph"; currentId selects topic detail vs empty landing
AppShell.jsx
  — Left rail: QueueList (topics, bindings, Boards / Knowledge graph switch)
  — Main: TopicDetail | EmptyState composer | KnowledgeGraphPage
  — Right (wide): AgentActivityPanel
  — TopBar: mobile rails, pause agents, optional observatory
lib/api.js — fetch wrappers; fetchEventSource to /api/events
```

Routing is **state only** (`view`), not React Router URLs.

## Recreation checklist (minimal)

1. Clone repo; `npm install` in `swarmlearn/`; `python -m venv .venv && pip install -e .` or install from `backend/pyproject.toml`.
2. Set **`ANTHROPIC_API_KEY`** in `backend/.env`. Optional: `DATABASE_URL`, CORS, Spacebase overrides.
3. Run migrations — app uses **`init_db`** on startup (SQLite create-all style for dev); production may need migrations if you change models.
4. **Claim a space** from the UI (or implement equivalent) so Spacebase session exists — otherwise watchers/logins fail.
5. Start backend then frontend as above.

## Failure modes you will see without full stack

- No Spacebase session: watcher errors, intents may not flow; SSE may still connect; REST may return partial data.
- No Anthropic key: workers cartographer/teachers fail logged errors.
- SSE blocked: UI falls back to polling intervals declared in `App.jsx`.

## Related files for deep dives

- Teacher prompts / ids: `backend/app/teachers.py`
- Spawn caps and eligibility: `agent_worker.py` (`_teacher_specific_pick`, caps)
- Extract graph schema: `anthropic.extract_graph`
- Frontend graph semantics: `src/components/knowledgeGraphViewModel.js`, `KnowledgeGraph.jsx`
