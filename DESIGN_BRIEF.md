# Axiom — Design Brief

> Codename `swarmlearn` during early development. The user-facing product is
> called **Axiom**; folder, package, and backend identifiers still use the
> codename.

A self‑contained reference for redesigning the UI/UX. You should not need to
read source code to begin. File paths are provided for when you do.

---

## 1. What the product is, in one paragraph

Axiom is a **collaborative explanation engine**. The user drops a topic
into a queue. Seven AI "teachers" — each with a distinct persona, role, color,
and pacing — independently watch the queue, self‑select what to respond to,
read each other's answers, and stigmergically spawn follow‑up sub‑topics.
Every interaction is recorded as INTENT → PROMISE → COMPLETE messages in a
shared "Intent Space" (Spacebase1) so the swarm's reasoning is observable. An
eighth background worker, the **Cartographer**, builds a knowledge graph of
typed concepts and surprising cross‑topic links once a topic is fully
answered. The result is two ways to see your curiosity: a live queue+activity
view of the work in progress, and a map of how your mind moves through ideas.

Tag line in the UI: **"Where curiosity builds itself."**

---

## 2. The user's mental model

```
I am curious about something.
   ↓ drop into queue (no waiting)
Seven minds notice and choose what they care about.
   ↓ they think out loud, in different voices
They build on what each other said. They sometimes spawn new questions.
   ↓ when a topic is fully answered
A cartographer maps it into a graph of fields, concepts, and surprising links
   ↓
I can browse the queue, watch agents work in real time,
or zoom out to the map of everything I've explored.
```

There is **no chat metaphor**. There are no "messages from the AI". The
interaction is **drop and walk away**, then **return to read what arrived**.
The product feels closer to a science notebook + ant colony + library card
catalogue than a chatbot.

---

## 3. The seven teacher personas (canonical — do not invent new ones)

Each teacher has a stable id, name, role, avatar initials, and a color used
across the entire UI (badge, dot, card accent, agent activity row).

| id | name | role | avatar | color (hex) | bg | border |
|---|---|---|---|---|---|---|
| `anchor` | Dr. Foundations | The Definer | DF | `#5B4FE8` | `#F0EFFE` | `#C4BFFA` |
| `analogy` | Sam Bridges | The Analogist | SB | `#0D9E75` | `#E1F5EE` | `#9FE1CB` |
| `historian` | Prof. Roots | The Historian | PR | `#C8860A` | `#FEF3DA` | `#FAC775` |
| `challenger` | Dr. Devil | The Challenger | DD | `#D03030` | `#FEECEC` | `#F09595` |
| `connector` | Mx. Links | The Connector | ML | `#1A6FC4` | `#E6F1FB` | `#85B7EB` |
| `practical` | Alex Applies | The Practitioner | AA | `#2D7D46` | `#EAF5ED` | `#97C459` |
| `quiz` | Dr. Recall | The Examiner | DR | `#6B5E45` | `#F5F0E8` | `#D3C9B5` |

**Roles drive copy and behaviour, not just visuals.** Anchor defines from
first principles in 3–4 sentences. Analogist gives one vivid surprising
analogy in 2–3 sentences. Historian tells a "who got it wrong first" story.
Challenger is Socratic and ends with one open question. Connector links to
2–3 adjacent fields. Practical gives one concrete actionable use. Examiner
writes one brilliant exam question + a hint about what a great answer
reveals.

The colors above are the brand. Field/Concept nodes in the graph borrow them
secondarily.

Source of truth: [`backend/app/teachers.py`](backend/app/teachers.py),
mirrored to the frontend via `/api/teachers`.

---

## 4. The Cartographer (eighth background worker)

Not a teacher. Not visible in the agent activity panel. Runs on a 6‑second
tick. After any topic reaches `done`, it asks Anthropic for a small JSON map
of the surrounding intellectual landscape (≤3 fields, ≤3 concepts, ≤3
cross‑topic links) and stores it as graph nodes + edges. It also auto-creates
`spawned` edges from topic spawn lineage. See `/api/graph` and
[`backend/app/services/cartographer.py`](backend/app/services/cartographer.py).

---

## 5. Information architecture

The whole app is one SPA at `/`. Two views, switched by a pill toggle in the
top bar:

```
SwarmLearn
├── Queue view (default)
│   ├── Queue rail (left, 260px)         — topic list
│   ├── Main area
│   │   ├── EmptyState (no topic selected)
│   │   └── TopicDetail (topic selected)
│   └── Agent activity rail (right, 260px, xl+ only)
└── Graph view
    └── KnowledgeGraphPage (full‑width within main area; rails still visible)
```

Top bar elements (left → right):
- Mobile hamburger (md− only) — opens the queue rail as a drawer.
- Wordmark `swarm` + colored `learn`.
- Subtitle (md+): *"Where curiosity builds itself."*
- **Tab pill: Queue / Graph** (md+).
- Live · Intent Space badge (clickable, opens binding dialog).
- Observatory link (md+) — opens the live Intent Space tree in a new tab.
- Mobile activity-panel button (xl− only).
- Theme toggle.

There is also a **modal**: the Space Binding Dialog (claim a Spacebase1 space
by URL). Hidden until the user clicks the simulated/live badge or the
sidebar's Intent Space block.

---

## 6. Screen‑by‑screen breakdown

### 6.1 Queue rail — `QueueList`

Sticky left column (240–260px). Header: tiny eyebrow `CURIOSITY QUEUE`, plus
`+` button to start a new topic.

Each row is a button containing:
- A status dot (8px) with a colored, optionally pulsing class:
  - `queued` zinc‑400, no pulse
  - `claimed` blue‑500, no pulse
  - `responding` amber‑500, **pulsing** (animate-ping)
  - `done` emerald‑500
  - `capped` zinc‑600
- Topic text (line clamp 2)
- `n/7` count of completed teacher responses
- Sub-row in 10px muted: `<status> · <relative time> [· branch icon trace]`

When the topic source is `agent-trace` (i.e. a stigmergic spawn), a small
purple branch icon + "trace" label is shown.

Empty state: dashed border tile + `Inbox` icon + copy *"Drop a topic — agents pick them up on their own."*

Footer block in the rail: a small "Intent Space" panel with a status dot
(emerald = live, amber = simulated) and an "Open Observatory →" link.

### 6.2 EmptyState

Centered. Sparkles icon. Big serif heading **"A swarm that watches your queue"**.
Subhead: *"Drop topics whenever curiosity strikes. Agents pick them up on
their own, building on each other and stigmergically spawning new traces in
the shared Intent Space."*

Composer with placeholder *"Drop a topic — agents will find it."* Submit
button labelled `Add` with right‑arrow icon. A row of suggestion chips:
*"How does the immune system work?", "What is entropy?", "How do black holes
form?", "What is the prisoner's dilemma?", "How does CRISPR work?", "What is
stoicism?"*.

Below the composer, an avatar grid of all seven teachers.

### 6.3 TopicDetail

Sticky compact composer at the top (so the user can keep dropping topics
without leaving the topic).

Then header:
- "Topic" badge (outline)
- If `source = agent-trace`: a colored "spawned by Mx. Links" chip using the
  spawning teacher's color.
- Mono `intent <id>…` (truncated, optional).
- Right-aligned "Watch in Observatory →" link if connected.

Big serif H1 with the topic text.

Then a 2‑column grid of `TeacherCard`s. Order: arrived first → still
thinking. Each card:
- Top accent gradient line in the teacher color.
- Avatar circle in teacher color, name (sans), role (in teacher color).
- StatusPill: thinking (animated dot, "Thinking"), error ("Error" warning),
  done ("intent xxxxxxxx" success).
- Body: skeleton lines while thinking; markdown article (serif, prose) when
  done; warning text when errored.

Below the cards, when child‑spawned topics exist, a "Spawned traces" section
listing them as small cards with a `from <agent>` chip + their text + status.
Click to navigate.

### 6.4 Agent activity rail — `AgentActivityPanel`

Sticky right column (xl+ only; mobile drawer otherwise). Header: `Activity`
icon + `AGENT ACTIVITY` eyebrow.

One row per worker (always 7, always in the canonical teacher order):
- Avatar circle in teacher color (with animate‑ping when status = `working`)
- Teacher name + status (right-aligned, color tone: zinc=`sleeping`,
  sky=`scanning`, amber=`working`)
- Role line (10px, muted)
- Last picked topic title (line clamp 2; placeholder "no pick yet")
- Footer line: `poll Xs ago` and `calls/cap` (e.g. `12/200`)

When `working`, the row gets a subtle amber 1px ring.

### 6.5 Knowledge Graph page — `KnowledgeGraphPage` + `KnowledgeGraph`

Full main area. Eyebrow `KNOWLEDGE GRAPH`, big serif title:
*"A* map *of how your mind moves through ideas."* (the word `map` italic).
Subtitle: *"Every topic is a node. Every connection an edge you can follow into a new board. Hover to trace. Click to recenter."*

Then a bordered card (640px tall) hosting an SVG force‑directed graph.

- **Topic** nodes: filled circles in foreground color; radius scales with
  response count.
- **Field** nodes: outlined diamonds.
- **Concept** nodes: small filled circles, slightly muted.
- **Edges** (default): thin grey lines.
- **Surprising edges**: teal `hsl(170 60% 40%)`, slightly thicker.
- **Labels**: 11px sans by default; muted color for non-topic nodes.

Interactions:
- **Hover** a node → highlight its edges + 1‑hop neighbours; fade everything
  else to 25% opacity.
- **Click** a node once → pin selection. Selected topic node gets a black
  bordered label box (matches the screenshot reference). The simulation alpha
  bumps so layout settles around the focus.
- **Click again** on the selected topic → navigates to that topic's detail in
  the Queue view (`onSelectTopic(topic_id)` flips view + selects topic).

Floating overlays inside the card:
- Top‑right "Stats" panel: rows for `Nodes`, `Edges`, `Explored`. Numbers in
  monospace, labels muted.
- Bottom‑left "Legend" panel: Topic (filled circle), Field (diamond),
  Concept (small dot), Surprising (teal line).

Empty state (no nodes yet): centered muted message *"No topics charted yet —
drop a topic in the Queue and the Cartographer will map it once it's done."*

### 6.6 Space Binding Dialog (modal)

Triggered from the simulated/live badge or sidebar Intent Space tile. A
shadcn Dialog with a single field — Spacebase1 claim URL — and a "Bind space"
button. Surfaces backend errors inline (`404`, `claim failed`, etc.). When
already bound, shows the current space id, agent name, observatory link, and
an unbind option.

---

## 7. Existing design system (the parts to reuse, not rebuild)

- **Stack**: React 19 + Vite, Tailwind CSS v4, shadcn/ui (Radix‑based),
  framer‑motion for card transitions, lucide‑react icons, react‑markdown +
  remark‑gfm for response bodies, next‑themes for dark mode.
- **Layout**: `min-h-screen flex` shell. Side rails are `w-[260px] shrink-0`.
  Main area: `flex-1 overflow-y-auto`.
- **Color tokens** (CSS variables, light/dark):
  `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`,
  `--primary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
  `--border`, `--input`, `--ring`. Used as `bg-background`,
  `text-foreground`, etc.
- **Teacher‑specific tokens** (per‑element CSS vars set inline by
  `teacherStyle()`): `--teacher-color`, `--teacher-bg`, `--teacher-border`.
  Use these instead of hard‑coding teacher hex values inside JSX.
- **Typography**:
  - Sans (default) for UI chrome.
  - Serif via `prose font-serif` for response bodies (gives them an
    "essay/letterpress" feel that distinguishes them from chat bubbles).
  - Tailwind tracking utilities; `tracking-[0.18em]`/`[0.22em]` for the
    all‑caps eyebrows that sit above headings.
- **Status pulses**: amber `animate-ping` for in‑flight work; matches
  `responding` topics in the queue and `working` agents in the panel.
- **Dark mode**: `class="dark"` on `html`. The theme toggle in the top bar.
  All components must look correct in both. The graph SVG uses
  `currentColor` so its strokes adapt; teal "surprising" stays the same.
- **Border radii**: `rounded-xl` for cards, `rounded-2xl` for hero
  containers/composer.
- **Spacing rhythm**: 4px base; eyebrows at `text-[10px]`; body 14px; H1s
  `text-3xl`/`text-4xl` serif.

---

## 8. Data shapes (what the UI actually receives)

These are the JSON contracts the frontend reads. A designer doesn't need to
build them, but the field names map directly to UI affordances.

### `GET /api/teachers`
```ts
[{ id, name, role, avatar, color, bg, border }]  // 7 entries, always
```

### `GET /api/topics`
```ts
[{
  id, text, root_intent_id, status, source,
  parent_topic_id, spawned_by_teacher_id, depth, created_at,
  response_count,                  // 0..7
  responding_teacher_ids: string[],
  done_teacher_ids: string[]
}]
```

### `GET /api/topics/{id}`
```ts
{
  id, text, root_intent_id, status, source,
  parent_topic_id, spawned_by_teacher_id, depth, created_at,
  responses: [{ teacher_id, status, text, intent_id, error,
                started_at, finished_at }],
  children: [...same shape as list summary]
}
```

### `GET /api/agents/state`
```ts
[{
  teacher_id, worker_agent_id,
  status: "sleeping" | "scanning" | "working",
  last_poll_at, last_picked_topic_id, last_picked_at, last_error,
  calls_today, interval_s, daily_cap
}]
```

### `GET /api/graph`
```ts
{
  nodes: [{ id, type: "topic"|"field"|"concept", label,
            topic_id?, source_topic_id?, weight }],
  edges: [{ id, from, to,
            edge_type: "spawned"|"extends"|"relates"|"surprising",
            source_topic_id }],
  stats: { nodes, edges, explored }
}
```

### `GET /api/space/status`
```ts
{ connected, simulated, space_id, agent_name, observatory_url, origin }
```

### `GET /api/events` (server‑sent events)
A single global stream with `event:` lines:
- `topic.created`, `topic.claimed`, `topic.responding`, `topic.responded`,
  `topic.spawned`, `topic.capped`
- `agent.scanning`, `agent.working`, `agent.idle`, `agent.error`
- `graph.updated`

The frontend invalidates React Query caches on each event; designers don't
need to touch this layer.

---

## 9. State coverage (every screen has these — design for all of them)

| Screen | Empty | Loading | Active | Many | Error |
|---|---|---|---|---|---|
| Queue rail | dashed tile + copy | n/a (instantly populated) | one row pulsing | scrolls; status dots vary | row gets red dot + truncated error subtitle (currently muted; ripe for design) |
| TopicDetail | n/a (only renders when selected) | skeleton cards | mixed (some thinking, some done) | 7 cards in 2-col grid + "Spawned traces" | error pill on individual cards |
| Activity rail | always renders 7 sleeping rows | n/a | mixed statuses, ping on working | always 7 | per‑row `last_error` exists but we don't surface it well |
| Graph | "No topics charted yet" | "Loading the map…" | force layout settles | 30+ nodes still legible? | network error → React Query default; graph keeps last good state |
| EmptyState | this *is* an empty state | n/a | n/a | n/a | n/a |
| TopBar | always | always | live status badge color shifts | n/a | binding error surfaced inside dialog |

---

## 10. Specific UX problems worth a redesigner's attention

These are the seams you can pull on. Not all of them need fixing; pick by
impact.

1. **The mental model isn't obvious in 5 seconds.** A first‑time user lands
   on the EmptyState, types a topic, then waits ~10 seconds for anything
   visible. We tell them "agents pick them up" but they don't *see* that
   happening. Possible fix: a hero‑sized animation of seven dots that
   actually starts moving the moment they submit, mirroring the activity
   panel.

2. **Topic queue doesn't show *who* picked what.** Right now we render an
   `n/7` count. We could show seven tiny coloured marks (one per teacher)
   that fill in as each completes — the queue row becomes a glanceable
   "fingerprint" of which voices have spoken.

3. **Activity panel is informative but visually dense.** Seven rows × 5 data
   points each. Hard to scan at a glance. Worth exploring: a compact "stoplight"
   row (just status dots + name) that expands on hover/click into the full
   detail.

4. **Spawn relationships are invisible in the queue.** A spawned topic shows
   a tiny "trace" pill but doesn't reveal *which* topic it was spawned from
   without clicking through. A nested/indented queue or a small arrow back
   to parent could help.

5. **The Knowledge Graph is the most "delightful" view but most users will
   never see it** because the toggle is small and the EmptyState doesn't
   mention it. Consider promoting it: a "see the map" CTA in the EmptyState
   once the user has 2+ done topics, or an inline mini‑graph in TopicDetail.

6. **Topic detail is page‑height heavy.** Seven full markdown articles stack
   vertically (well, in a 2‑col grid). On mobile that's a long scroll. Could
   benefit from teacher‑filter chips at the top, or "Read more" collapsing.

7. **Status vocabulary is mixed.** Topics use `queued/claimed/responding/done/capped`,
   agents use `sleeping/scanning/working`, responses use `responding/done/error`.
   These could be reconciled or made more visually consistent.

8. **No trail of "what the user just dropped".** Submit, and the rail jumps —
   but there's no toast, no confirmation. A subtle "Added to queue" feedback
   moment would help.

9. **Graph is light on affordances.** No way to filter by edge type, no way
   to expand only a sub‑graph, no zoom/pan. These are explicit non‑goals for
   v1 but worth designing in.

10. **Dark mode is functional, not designed.** It's just token swaps. The
    teacher colors hold up; the teal "surprising" edge in the graph holds
    up. But the empty‑state hero feels flat in dark mode.

---

## 11. Non‑goals / things NOT to redesign

- **The seven personas, their roles, their colors, their names.** These are
  brand. The visual treatment can change; the identities can't.
- **The queue + activity + graph trichotomy.** This is the architecture.
- **The chat metaphor.** Do not introduce chat bubbles, "send" arrows, or
  "AI is typing…". The product intentionally rejects this.
- **Real‑time streaming text.** Responses arrive whole when COMPLETE fires.
  No token‑by‑token streaming UI is needed (or available).
- **Authentication / multi‑user.** Single‑user app for now.
- **The Spacebase1 protocol surface** (INTENT/PROMISE/COMPLETE). The
  Observatory link is the canonical view of that data; we don't reinvent it.
- **Server-side anything.** All design work is in `src/`.

---

## 12. File map (when you do open the code)

Frontend (all in `src/`):

| File | Purpose |
|---|---|
| `App.jsx` | Top‑level orchestration, view switching, SSE subscription |
| `main.jsx` | Bootstraps React Query, theme, tooltip, sonner toasts |
| `index.css` | Tailwind v4 entry + theme token definitions |
| `lib/api.js` | Fetch helpers + global SSE subscriber |
| `lib/teacherTokens.js` | `teacherStyle(t)` → CSS vars per teacher |
| `lib/utils.js` | `cn()` class merger |
| `components/AppShell.jsx` | 3‑pane responsive shell + drawers |
| `components/TopBar.jsx` | Wordmark, view tabs, status, theme toggle |
| `components/QueueList.jsx` | Left rail (topics + intent space block) |
| `components/AgentActivityPanel.jsx` | Right rail (7 worker rows) |
| `components/EmptyState.jsx` | First-load hero |
| `components/Composer.jsx` | Topic input (full + compact variants) |
| `components/TopicDetail.jsx` | Center pane when topic selected |
| `components/TeacherCard.jsx` | Single teacher response card |
| `components/KnowledgeGraphPage.jsx` | Graph view header, stats, legend |
| `components/KnowledgeGraph.jsx` | SVG + d3‑force simulation |
| `components/SpaceBindingDialog.jsx` | Spacebase1 claim modal |
| `components/ThemeProvider.jsx`, `ThemeToggle.jsx` | Dark mode plumbing |
| `components/ui/*` | shadcn primitives (Button, Card, Badge, Dialog, …) |

Backend (read‑only context for designers):

| File | Purpose |
|---|---|
| `backend/app/teachers.py` | The seven personas (color hex source of truth) |
| `backend/app/services/agent_worker.py` | Stigmergic worker per teacher |
| `backend/app/services/space_watcher.py` | Spacebase1 snapshot |
| `backend/app/services/cartographer.py` | Graph extractor |
| `backend/app/routers/topics.py` | Topic CRUD + SSE event publishing |
| `backend/app/routers/graph.py` | Graph endpoint |

---

## 13. How to run it locally (so you can poke at it)

```bash
# backend
cd backend && ./run.sh
# frontend
npm install && npm run dev
# open http://127.0.0.1:5173
```

Drop three topics fast (the Composer accepts Enter‑to‑submit). In ~60–90s
you'll have a populated queue, agents working, and a charted graph. The
existing playwright check `node scripts/human-test.mjs` walks the same
end‑to‑end flow and saves screenshots in `test-screenshots/`.
