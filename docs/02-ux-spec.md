---
title: "Pi Click Sidebar 02 — UX and visual specification"
module: "pi-click-sidebar dock, rail and branch modal"
author: "pi (ux)"
date: 2026-11-06
status: Pending
priority: P1
scope: "[Backlog]"
source: "docs/01-feasibility.md"
---

# 02. UX specification

## 1. Principles

1. **The conversation is the product.** Nothing may permanently cover it. That is why dock mode wins
   over a floating panel: it takes width from the transcript and the transcript wraps, instead of
   hiding text behind an opaque rectangle.
2. **Data is glanceable, actions are deliberate.** Counts and branch are read-only text; every write is
   a labelled click or a single key, never a hover, never a timer.
3. **One result line, always in the same place.** Every git action reports exactly one line in the same
   row: what ran, whether it worked, how long it took. No toasts, no scrolling log, no modal for
   success.
4. **Never colour alone.** Success is `✓` + word; failure is `✗` + word. Colour reinforces, it does not
   carry meaning (CVD, 256-colour terminals, light themes).
5. **Flat cyberpunk, no shadows.** A terminal has no elevation model. The look comes from cyan accents,
   hairline borders, monospace density and glyphs — not from gradients, backgrounds or blink.

## 2. Anatomy

### 2.1 Dock (fullscreen, primary)

Width 34 columns in the diagram; rules in §3.

```text
╭────────────────────────────────╮
│ PROJECT                        │
│ acme-web                       │
│ ~/Projects/acme/web            │
│                                │
│ CHANGES              2 files   │
│ +70 −8   ✚2 ✖0                 │
│                                │
│ BRANCH                         │
│ feat/new-sidebar               │
│ ↑1 ↓3 · pushed 12s ago         │
│                                │
│ f fetch   p pull    u push     │
│ s switch  n new     r refresh  │
│                                │
│ ✓ pull · up to date · 0.8s     │
│                                │
│ MODEL                          │
│ deepseek-v4 · med              │
│ ctx 38% · ↑12k ↓3.4k           │
╰────────────────────────────────╯
```

Reading order is fixed and never reorders under the cursor: **Project → Changes → Branch + actions →
Result → Model**. An action never moves the row it will report into; that is the difference between a
status surface and a log.

Section rules:

| Section | Content | Truncation |
|---|---|---|
| `PROJECT` | Repo basename (bold), then the path with `~` substitution | Path: middle ellipsis, keep the first and last segment (`~/…/gonkar/ryg`) |
| `CHANGES` | `N files` right-aligned on the label row; `+INS −DEL` and `✚untracked ✖deleted` below | Numbers never truncated; the label yields first |
| `BRANCH` | Branch name bold; upstream state below (`↑ahead ↓behind`, last fetch age, `no upstream`) | Branch: right ellipsis at 26 cols; full name on the branch modal |
| actions | Two rows of key + verb pairs, `f p u / s n r` | Fixed, never truncated |
| result | One line, same slot for idle/running/ok/fail | Middle truncation of git's message to fit |
| `MODEL` | `id · thinking`, then `ctx %` and session tokens | Model id right-ellipsis at 20 |

### 2.2 Overlay fallback (fullscreen, dock unavailable)

Same component, `nonCapturing: false` when opened deliberately, anchored `top-right`, `margin: 1`,
`maxHeight: 80%`, `width: 36`. It is opened with `alt+g`, closed with `esc` or `alt+g`. Header line says
`Click Sidebar · esc to close` so it is never confused with the dock. While open it covers the transcript's
right columns — that trade is the documented reason it is the fallback, not the default.

### 2.3 Rail fallback (regular mode / `tuiMode: "regular"`)

One line above the editor. Clicking any segment opens the overlay fallback.

```text
 acme-web  ~/Projects/acme/web  ⎇ feat/new-sidebar  ✚2 +70 −8  ds-v4·med  alt+g
```

Segments are separate `MouseRegion`s: project → focus Project, branch → open the branch modal, changes →
open the changes list overlay, model → no action (informative). All truncation is width-driven from the
right; the project path is what disappears first.

## 3. Width rules

Fixed columns, not percentage. A percentage dock on a 240-column terminal would be 55 columns of
mostly-empty labels; on 90 columns it would be 20 and unusable. The content is fixed-width data
(branch names, counts, ids), so the lane is sized by content:

```text
laneWidth = clamp(28, round(0.22 * columns), 44)   // computed at wrap time
visible   = columns >= 96                          // below that, the rail/overlay takes over
```

| Terminal width | Dock | Behaviour |
|---|---|---|
| ≥ 160 | 44 | Full layout, path on two lines if needed |
| 120 | 28–34 | Nominal layout |
| 96–119 | 28 | Action rows stack into three lines |
| < 96 | — | Dock hidden, `rail` keeps branch + changes |

Height: content-driven, 24 rows nominal. When `rows < 30`, sections collapse in reverse priority —
drop `MODEL`, then `PROJECT`, then split `CHANGES` labels — leaving Branch + actions + result. The dock
never scrolls in v1: a scrolling sidebar is a document, and this is a status surface.

All lines pass through `truncateToWidth()`; the component measures with `visibleWidth()` and never
assumes `String.length` equals columns (the glyphs `⎇ ✚ ✖ ↑ ↓ ✓ ✗ ⏵` are narrow in most terminals but
not all).

## 4. States

| State | Dock | Result line |
|---|---|---|
| Not a git repo | Project only, single dim line `not a git repository` | — |
| Detached HEAD | `BRANCH` shows `(detached) <short-sha>` in `warning` | — |
| Operation in progress (merge/rebase/cherry-pick) | `⚠ merge in progress` chip under branch, actions that would fight it disabled | `✗ pull · merge in progress` |
| Dirty tree | `✚N ✖N` in `warning`; `pull`/`switch`/`new` show `requires clean tree` when focused | `✗ switch · 2 uncommitted files` |
| Action running | The pressed verb row shows `⏵ verb…` and the result slot shows elapsed tenths | `⏵ fetching… 3.2s` |
| Success | Result in `success` for 6 s, then the last result stays dimmed | `✓ push · origin/feat/new-sidebar · 1.4s` |
| Failure | Result in `error`, stays until the next action; first meaningful stderr line | `✗ pull · diverged, fast-forward not possible` |
| Data stale (> 3 missed ticks) | Counts dim, `⏸ stale` appended to the branch row | previous line dimmed |
| `git` missing | Project + a single `git not found in PATH` line | `✗ fetch · git not found` |

## 5. Interaction map

Keyboard is complete on its own; the mouse is an accelerator, never the only path
(`docs/tui.md`: regular mode leaves mouse input to the terminal).

| Key | Scope | Action |
|---|---|---|
| `alt+g` | global shortcut | Toggle dock visibility / open-close the overlay |
| `j` / `k`, `↓` / `↑` | dock or overlay focused | Move the action cursor |
| `enter` | focused | Run the selected action |
| `f` `p` `u` | focused | `fetch`, `pull`, `push` |
| `s` | focused | Open the branch list (switch) |
| `n` | focused | Open the new-branch modal |
| `r` | focused | Force refresh |
| `d` | focused | Toggle the changed-file list section |
| `esc` | focused / modal | Leave focus, or close the modal |
| `?` | focused | Show the key map inline in the result slot |

Dock focus: `tui.setFocus(dockComponent)` on `alt+g` when the dock is already visible, `setFocus`
back to the editor on `esc`. The dock is display-only until focused, so typing in the editor is never
interrupted.

| Mouse | Target | Action |
|---|---|---|
| click | `⎇ branch name` | Open the branch modal (switch + create) |
| click | action verb | Run it |
| click | `CHANGES` label | Toggle the changed-file list |
| click | project path | Copy the absolute path to the clipboard via `ctx.ui.notify` confirmation |
| wheel | changed-file list | Scroll inside the section, never the transcript |

## 6. Branch modal

One overlay, two stacked blocks, because the operator's real question is *"where does the new branch
start?"* — the base is shown before the name is typed.

```text
╭─ new branch ──────────────────────────────╮
│ base                                      │
│ > feat/new-sidebar            (current)   │
│   development                             │
│   main                                    │
│                                           │
│ name                                      │
│ ┌───────────────────────────────────────┐ │
│ │ feat/                                 │ │
│ └───────────────────────────────────────┘ │
│ ⚠ 2 uncommitted files. COMMIT FIRST       │
│                                           │
│            [ switch ]  [ cancel ]         │
╰───────────────────────────────────────────╯
```

- The base list is `git for-each-ref refs/heads` sorted by last commit date, current branch marked
  `(current)` and pre-selected.
- `switch` (no name) runs `git switch <base>`.
- `switch` with a name runs `git switch -c <name> <base>` — the new branch is created **from the chosen
  base without moving the working tree first**, which is what makes the previous behaviour wrong.
- Validation before submit: `git check-ref-format --branch <name>`; reject a name that already exists
  (`git show-ref --verify`), reject an empty name, reject a name starting with `-`.
- Dirty tree, no name: `switch` is disabled and the hint reads `2 uncommitted files · commit or discard
  first`. No stash is performed in v1.
- `enter` submits, `esc` cancels, `tab` moves between list and input.

## 7. Copy deck

All strings in English, in one module, no interpolation inside literals that must be translated later.

| Slot | String |
|---|---|
| Sections | `PROJECT`, `CHANGES`, `BRANCH`, `MODEL` |
| Counts | `{n} files`, `{n} file`, `+{ins} −{del}`, `✚{untracked}`, `✖{deleted}` |
| Upstream | `no upstream`, `↑{ahead} ↓{behind}`, `pushed {age}`, `fetched {age}` |
| Actions | `fetch`, `pull`, `push`, `switch`, `new`, `refresh` |
| Progress | `⏵ {verb}… {tenths}s` |
| Success | `✓ {verb} · {detail} · {tenths}s` |
| Failure | `✗ {verb} · {reason}` |
| Errors | `not a git repository`, `git not found in PATH`, `requires clean tree`, `diverged, fast-forward not possible`, `timed out after {n}s` |

`age` is `now`, `{n}s`, `{n}m`, `{n}h`, `{n}d`. Never a date, never a timezone.

## 8. Colour

Rendering uses the **active** theme's tokens only. The bundled theme `click-sidebar-cyber` is a copy of
`dark.json` with the accent moved to electric cyan, so the intended look is one `/settings` choice away
and a colleague on `system` still gets a readable dock.

| Token | Used for | Bundled theme value |
|---|---|---|
| `accent` | Section titles, focused verb | `okhsl(212 96% 76%)`, which Pi's parser resolves to `#20d2ed` (electric cyan) |
| `borderAccent` | Focused border | same cyan |
| `border` / `borderMuted` | Dock frame, separators | inherited from `dark.json` |
| `text` | Values (branch name bold, counts) | `okhsl(234 3% 89%)` |
| `muted` | Labels, key hints | `okhsl(229 6% 67%)` |
| `dim` | Stale, timestamps, disabled | `okhsl(229 8% 56%)` |
| `success` | `✓` result | `okhsl(159 59% 67%)` |
| `error` | `✗` result, dirty warning text | `okhsl(20 72% 67%)` |
| `warning` | Dirty counts, in-progress operation, detached head | `okhsl(83 88% 67%)` |

Rules:

- The literal above is the one that actually produces electric cyan. `okhsl(190 95% 55%)`, the value
  this document asked for originally, resolves to `#109792` through Pi's own `parseColor` (verified with
  `colorToHex(parseColor("okhsl(190 95% 55%)"))`): a muted teal, not cyan. OKHSL hue 190 is not the same
  hue as an OKLCH 190, and `#22d3ee` measures `okhsl(212 96% 76%)`, so the theme uses that literal.
- Cyan is an **accent**, never a background. `.style(text, {bg})` is used only for the focused verb cell
  with `selectedBg`, so the dock stays flat.
- On the `light` theme the same tokens resolve to darker variants automatically; nothing in the render
  path hardcodes a cyan literal. A config flag `accentOverride` exists for someone who insists on cyan
  everywhere, and it also switches `appearance` handling off — documented as a contrast risk.
- No blink, no inverse on data, no colour-only deltas: `+70` is green *and* prefixed `+`.

## 9. Density

- Border to content: 1 column of padding; 2 columns between a number and its label.
- Sections separated by exactly one blank line. No blank line at the top or bottom of the frame.
- Numbers: 3 significant digits max, `12.4k` / `1.2M`, right-aligned in a fixed 6-column field so the
  column does not jitter while streaming.
- Verb rows use lower-case verbs with an upper-case key glyph, never emoji.
