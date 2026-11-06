# pi-click-sidebar

A Pi extension that adds a clickable right-hand sidebar with the session's project, git changes, branch
actions and model context.

> **Status: `Pending`.** No extension code exists yet. This repository currently contains the design
> and the delivery plan. The first slice is a throwaway spike that decides whether the host allows the
> transcript to reflow beside the sidebar or the fallback layout is used.

## What it will do

- A right lane in fullscreen mode, 24–48 columns, holding **Project** (repo and path), **Changes**
  (files, `+ins −del`, untracked/deleted), **Branch** (name, upstream, ahead/behind), the **actions**
  and **Model** (id, thinking level, context usage).
- Clickable actions: `fetch`, `pull --ff-only`, `push`, switch branch, create branch, refresh. Every
  action reports one result line in a fixed slot: `✓ pull · up to date · 0.8s`.
- Guards before anything touches the tree: not a repo, operation in progress, dirty tree, invalid ref,
  branch exists.
- Fallbacks: an overlay panel, then a one-line rail above the editor, so the feature never depends on
  one Pi version's internals.
- A bundled Pi theme, `click-sidebar-cyber`, with an electric cyan accent. The extension itself renders
  with theme tokens only.

## Read before touching code

| File | Why |
|---|---|
| `docs/04-plan.md` | Slice order, acceptance criteria and the command that proves each one. |
| `docs/01-feasibility.md` | What the Pi 1.5.0 extension API allows, with file and line evidence, and the abort criteria for the risky part. |
| `docs/03-architecture.md` | Module boundaries, git argv contracts, refresh policy, configuration. |
| `docs/02-ux-spec.md` | Anatomy, widths, states, keyboard and mouse map, copy deck. |
| `AGENTS.md` | Repository invariants and the completion gate. |

## Install (after the first release)

```bash
pi install git:github.com/AdelysAlberto/pi-click-sidebar@v0.1.0
```

`peerDependencies` are supplied by Pi; there is no build step and no runtime dependency.

## Limits, stated up front

- The sidebar requires fullscreen mode (`tuiMode` defaults to `fullscreen`). Regular mode gets the rail.
- The dock reflows the transcript only if the host's layout root can be wrapped; that is an internal,
  version-sensitive extension point, which is why the fallback chain exists and why the probe fails
  soft.
- `pull` is fast-forward only. A diverged branch is reported, never merged or rebased.
- Pushing over HTTPS with no stored credential blocks until the command timeout: Pi's `exec` exposes no
  `env`, so use an SSH remote or a credential helper.
