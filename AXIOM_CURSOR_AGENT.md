# Cursor agent: clean Axiom build + Intent Space (intent2.0)

Use this checklist end-to-end. Goal: ship the repo as **Axiom**, wire **Spacebase1** to the prepared space, and leave no secrets in git.

**Colours & layout tokens:** [`AXIOM_DESIGN.md`](AXIOM_DESIGN.md).

---

## 0. Rules (non-negotiable)

- **Never commit** API keys, claim tokens, or full claim URLs. Only `backend/.env` (gitignored) or the operator’s secrets manager.
- Prefer **environment variables** for space identity overrides; defaults in `backend/app/config.py` may still say legacy names until you rewrite them for Axiom-only defaults.
- After edits: `npm run build` (frontend root) and smoke the API (`/api/health`, `/api/space/status`).

---

## 1. Prerequisites

| Requirement | Notes |
|-------------|--------|
| Node 20+ / npm | For Vite frontend |
| Python 3.10+ | For FastAPI backend |
| `ANTHROPIC_API_KEY` | Required for teachers + cartographer |
| Network | Spacebase1 origin reachable: `https://spacebase1.differ.ac` |

Install deps:

```bash
cd swarmlearn && npm ci
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e .
```

---

## 2. Install Spacebase1 onboarding skill (operator machine)

Skills help humans/agents perform claim + provisioning correctly. Fetch the same SKILL from upstream:

**Claude Code**

```bash
mkdir -p ~/.claude/skills/spacebase1-onboard && curl -fsSL https://spacebase1.differ.ac/spacebase1-onboard.SKILL.md -o ~/.claude/skills/spacebase1-onboard/SKILL.md
```

**Codex**

```bash
mkdir -p ~/.codex/skills/spacebase1-onboard && curl -fsSL https://spacebase1.differ.ac/spacebase1-onboard.SKILL.md -o ~/.codex/skills/spacebase1-onboard/SKILL.md
```

**Cursor (optional, mirror)**

```bash
mkdir -p ~/.cursor/skills/spacebase1-onboard && curl -fsSL https://spacebase1.differ.ac/spacebase1-onboard.SKILL.md -o ~/.cursor/skills/spacebase1-onboard/SKILL.md
```

Then open `SKILL.md` and follow it for claiming if you automate outside the app UI.

---

## 3. Prepared Intent Space (Axiom prod target)

| Field | Value |
|--------|--------|
| Product name | **Axiom** |
| Agent label (`agent_name`) | `intent2.0` |
| Space id | `space-6f75bcee-0efa-4d22-83c6-5b10117febd3` |
| Claim URL + token | **Operator-provided** — paste only into the in-app Intent Space dialog or a private `backend/.env`. Never commit. |

Defaults in `backend/app/config.py` and `backend/.env.example` match **space id** and **agent name** above.

## 4. Rebrand the codebase → Axiom (mechanical checklist)

Sweep and align **identity strings** — keep npm/Py internal package names as-is unless product owner asks for renaming packages (risky churn).

Minimum sweeps (many already done in-tree):

1. **`index.html`** — `<title>Axiom`, meta `author` / OG.
2. **`backend/app/main.py`** — `FastAPI(title="Axiom API", ...)`, logger `axiom`.
3. **`backend/pyproject.toml`** — `axiom-backend`, description.
4. **`package.json`** — `"name": "axiom"`.
5. **Rails / empty / graph** — wordmark **Axiom**, content-first copy.
6. **Docs** — `ARCHITECTURE.md`, `DESIGN_BRIEF.md` (prose) use **Axiom** where user-facing.

**`backend/.env.example`** — checked in with placeholders only.

---

## 5. Backend environment (`backend/.env`)

Create **`backend/.env`** (ignored by git) with **at minimum**:

```env
ANTHROPIC_API_KEY=

# Defaults used before/without DB binding fallback:
SPACE_ID=space-6f75bcee-0efa-4d22-83c6-5b10117febd3
AGENT_NAME=intent2.0

# Optional: SQLite path remains default swarmlearn.db unless DATABASE_URL overridden
```

**Claim workflow (pick one)**

1. **In-app**: Start API + Vite → Queue → Intent Space dialog → paste **full HTTPS claim URL** (from operator) and **`agent_name`** `intent2.0`.
2. **Skill-driven**: Follow `spacebase1-onboard` SKILL; ensure resulting binding matches the same space id and agent label.

After a successful claim, **`space_binding`** row in SQLite holds `space_id`, tokens, `observatory_url`, etc. Session restore uses that; `SPACE_ID` in env still helps first-run / docs.

---

## 6. Run stack (verification)

Terminal A (backend):

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal B (frontend):

```bash
cd swarmlearn && npm run dev -- --host 127.0.0.1 --port 5173
```

Checks:

| Check | Expected |
|--------|----------|
| `GET /api/health` | `{"ok":true}` |
| `GET /api/space/status` | After claim: `bound` info, `observatory_url` if provided |
| `GET /api/teachers` | Seven teachers JSON |
| Browser `http://127.0.0.1:5173` | Loads; SSE `/api/events` connects when backend healthy |
| `npm run build` | Succeeds |

If Spacebase session fails to restore, logs will show **`Failed to restore Spacebase1 session`** — reclaim or refresh binding; see `spacebase.py` restore path.

---

## 7. Optional “clean” rename (advanced)

Only do if explicitly requested:

- Rename npm `package.json` `"name"` and lockfile coherence.
- Rename Python distribution in `pyproject.toml` (`swarmlearn-backend` → `axiom-backend`).
- Rename default SQLite file key in `config.py` → `axiom.db` (requires DB path migration or fresh DB).

These are **high churn**; default is user-facing strings + env only.

---

## 8. Done criteria

- [ ] Axiom branding consistent in HTML + API title + visible UI strings.
- [ ] `intent2.0` + new `space_id` applied via `.env` and successful **claim**.
- [ ] Teachers run without Anthropic/config errors when a topic exists.
- [ ] `.env` never committed; claim URL/token only in secrets / local `.env`.
- [ ] `npm run build` green; `/api/health` green.

---

## 9. Reference architecture

Operational detail (workers, SSE, graph) lives in **`ARCHITECTURE.md`**. Extend that file if backend flows change materially.
