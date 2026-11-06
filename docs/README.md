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

`Pending`. No code exists yet. `01-feasibility.md` §6 is the first thing to execute: a throwaway spike
that decides between dock mode and fallback mode before any module is written. Read `04-plan.md` for the
slice order.

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
