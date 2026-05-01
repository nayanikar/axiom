# Axiom — design system & colours

Content-first UI. **DM Sans** for UI and display; **Source Serif 4** for long-form reading (`prose-book`, `.font-book`).

**Warm editorial palette:** parchment surfaces, warm charcoal ink, terracotta accent — not neutral gray-on-white.

## Design tokens (CSS)

Defined in `src/index.css` (`:root` / `html.indigo`). Use Tailwind arbitrary values or these variables in components.

| Category | Token / variable | Notes |
|----------|------------------|--------|
| **Spacing scale** | `--space-1` … `--space-7` | 4, 8, 12, 16, 24, 32, 48px |
| **Radius** | `--radius-sm`, `--radius-md`, `--radius-lg` | 6, 10, 14px |
| **Shadow** | `--shadow-sm`, `--shadow-md` | Warm-tinted rail / sheets & dialogs |
| **Motion** | `--duration-fast` (150ms), `--duration-normal` (220ms), `--ease-out` | Match `prefers-reduced-motion` in `index.css` |
| **Focus** | `--focus-ring`, global `:focus-visible` | Accent outline; composer uses `.composer-field:focus-within` |
| **Type ramp** | `--text-xs` … `--text-xl` | Reference scale for copy |
| **Display / body** | `--font-display`, `--font-body` | DM Sans |
| **Book** | `--font-book` | Source Serif 4 |
| **Graph** | `--graph-topic-fill`, `--graph-edge`, `--graph-surprising` | SVG map on paper-toned canvas |

## Palette

| Role | Value |
|------|--------|
| Page background | `#f4efe6` (`--bg`) — warm parchment |
| Surfaces (cards, inputs) | `#fffcf7` (`--bg-raised`, `--surface-elevated`) — cream |
| Muted band / graph | `#e8e0d4` (`--bg-subtle`, `--surface-muted`) |
| Primary text | `#2c2824` (`--ink`) — warm charcoal |
| Secondary text | `#5e564e` (`--ink-mid`) |
| Muted text | `#7a7268` / `#9c9488` (`--ink-faint` / `--ink-ghost`) |
| Borders | `#d4ccc0` / `#c4bbb0` (`--border` / `--border-mid`) |
| Accent (links, primary, brand) | `#bc5c2e` (`--accent`) — terracotta |
| Accent hover | `#9e4d26` |
| Accent tint | `#f0dcd2` (`--accent-soft`) |

**Status** (unchanged semantics): queued gray, claimed blue, responding amber, done green, error red.

**Teachers:** earth-toned, distinct hues — see `src/index.css` `--teacher-*` (anchor aligns with terracotta family).

**Graph:** topic fill `--graph-topic-fill` (#3d3833), edges `--graph-edge`, surprising links `--graph-surprising` (#2f6f5e forest teal on paper).

## Theme

- Single class on `<html>`: **`indigo`** (via `ThemeProvider`, forced) — name is legacy; tokens are warm editorial.
- No dark mode in this rebuild.

## Layout (functional)

- Left rail: brand, Boards / Knowledge graph, topic list, Intent Space CTA — muted surface, border separation from center **stage**.
- Top bar: mobile menu, **Axiom** label (desktop), pause agents, observatory link when bound.
- Main: landing composer → topic detail with seven teacher blocks (~65ch reading width, sticky TOC on wide screens) → or full-width graph view.
- Right (wide): agent activity list.

## Intent Space (operator config)

| Setting | Value |
|---------|--------|
| Agent label | `intent2.0` |
| Space id | `space-6f75bcee-0efa-4d22-83c6-5b10117febd3` |

Claim once in-app (**Intent Space** dialog) with the full **HTTPS claim URL** from Spacebase1 (do not commit the URL or token). Defaults match this space in `backend/app/config.py` and `backend/.env.example`.

### Onboarding skill (operator)

```bash
mkdir -p ~/.claude/skills/spacebase1-onboard && curl -fsSL https://spacebase1.differ.ac/spacebase1-onboard.SKILL.md -o ~/.claude/skills/spacebase1-onboard/SKILL.md
```

```bash
mkdir -p ~/.codex/skills/spacebase1-onboard && curl -fsSL https://spacebase1.differ.ac/spacebase1-onboard.SKILL.md -o ~/.codex/skills/spacebase1-onboard/SKILL.md
```

## See also

- `ARCHITECTURE.md` — system behavior.
- `AXIOM_CURSOR_AGENT.md` — agent checklist for clean builds.
- `AI_SKILLS/ui-ux-pro-max-skill` — accessibility & interaction reference (contrast, focus, 44px targets, motion).
