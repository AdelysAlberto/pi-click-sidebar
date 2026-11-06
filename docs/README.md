---
title: "Pi Click Sidebar — plan index"
module: "pi-click-sidebar repository layout and decisions"
author: "pi (architecture + UX)"
date: 2026-11-06
status: Pending
priority: P1
scope: "[Backlog]"
source: "operator request, session 2026-11-06"
---

# Pi Click Sidebar

A Pi extension that adds a clickable right-hand sidebar with the session's project, git changes, branch
actions and model context. Fullscreen-only for the sidebar; overlay and rail fallbacks elsewhere.

Repository: `https://github.com/AdelysAlberto/pi-click-sidebar`.

## Status

`S0–S7 done, release pending`. `01-feasibility.md` §6 answered the one question it exists for: the host layout
root **can** be wrapped in an `HStack`, so dock mode is the primary shape and `S4` is a real dock, not the
overlay-only fallback. All four pass criteria are observed, including the `tuiMode` round trip.

S1–S7 ship the whole feature: the dock lane with reconciliation, the rail for regular mode, the overlay,
the git read layer with a porcelain-v2 parser, `fetch`/`pull --ff-only`/`push` behind the guard chain, the
branch modal, the bundled `click-sidebar-cyber` theme, and the config with runtime validation. Slice
results, measurements and deviations live in `04-plan.md`; the upstream proposal for the layout root is in
`upstream/tui-layout-root.md`.

## Documents

| File | Content |
|---|---|
| `01-feasibility.md` | What the installed Pi 1.5.0 API allows and forbids, with the file and line that proves it. Answers the "can the transcript reflow instead of being covered" question. Abort criteria for the risky part. |
| `02-ux-spec.md` | Anatomy, widths, states, keyboard and mouse map, the branch modal, copy deck, colour strategy. |
| `03-architecture.md` | Package tree, module boundaries, pure/testable core, exact git argv contracts, refresh policy, config, error taxonomy. |
| `04-plan.md` | Vertical slices with acceptance criteria, verification commands, risks, handoff checklist. |

The repository root is the package itself (`package.json`, `extensions/`, `src/`, `themes/`); these
documents live in `docs/` and never ship behaviour.

## Portability contract

Every path used to *locate* something is relative to the repository root, resolved by Pi at load time,
or resolved at runtime (`ctx.cwd`, agent dir). The only absolute literals in this repository are the
two prefixes inside the S7 detector command (`grep -rn "/Volumes/\|/Users/"`), which exist to catch a
violation, and the `/tmp` log paths used by verification commands. A document that hardcodes where the
code lives cannot be moved, and will not be shipped.

## Decisions taken by the operator (do not re-litigate)

| Topic | Decision |
|---|---|
| Shape | Right dock, reflowing the transcript if the host allows it; otherwise the fallback in `02-ux-spec.md` §2. |
| Git actions in v1 | `fetch`, `pull`, `push`, switch branch, create branch, dirty-tree guard. **No commit, no stash.** |
| Distribution | This git repository, installed with `pi install git:github.com/AdelysAlberto/pi-click-sidebar@<tag>`. |
| Colour | Bundled Pi theme whose accent is electric cyan. The extension renders with theme tokens only. |
| Pull semantics | `pull --ff-only`; a diverged branch is reported, never merged or rebased. |
