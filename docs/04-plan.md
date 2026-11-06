---
title: "Pi Click Sidebar 04 — Slices, gates and handoff"
module: "pi-click-sidebar delivery"
author: "pi (planning)"
date: 2026-11-06
status: Pending
priority: P1
scope: "[Backlog]"
source: "docs/03-architecture.md"
---

# 04. Plan

Eight slices, each independently verifiable. S0 decides the shape of S4; nothing else depends on it.
Total ≈ 21 h of focused work, which is why the order matters: S1–S3 already deliver value (branch,
changes, model, actions) before the risky layout work starts.

| # | Slice | Est. | Blocks |
|---|---|---|---|
| S0 | `SPIKE-DOCK` feasibility | 1 h | S4 (done, PASS: `01-feasibility.md` §6.1) |
| S1 | Package skeleton, config, theme, static panel | 2 h | S2–S7 |
| S2 | Git read layer + parser + ViewModel + tests | 3 h | S3–S6 |
| S3 | Rail (regular mode) + keymap | 2 h | — |
| S4 | Dock lane + reconciliation + fallback switch | 4 h | S5 mouse targets |
| S5 | `fetch` / `pull` / `push` with guards and result line | 4 h | — |
| S6 | Branch modal: switch + create + dirty guard | 3 h | — |
| S7 | Docs, changelog, packaging, handoff | 2 h | — |

## S0 — `SPIKE-DOCK`

Throwaway extension, ≤80 lines, no git code. Executes `01-feasibility.md` §6.

**Acceptance:** the four pass criteria in `01-feasibility.md` §6 observed live, and the result appended
to that document (pass, or fail with the observed frame evidence).

**Result (2026-11-06): PASS.** Criteria 1–3 observed from captured frames at 160×45 and 80×30; criterion
4's `tuiMode` round trip is `NOT_RUN` (the `/settings` value could not be cycled from a scripted pty) and
stays with the operator's live session. Evidence table, the measured wrapper-loss/reconcile sequence and
four design corrections: `01-feasibility.md` §6.1–6.2. Dock mode is therefore supported; `S4′` is not
needed.

**Verification**

```bash
pi -e .spike               # temporary, never committed to the package
PI_TUI_WRITE_LOG=/tmp/pi-spike.log pi -e .spike
```

**Fail path:** record it, mark dock mode `unsupported` for 1.5.0, replace S4 with S4′ below. No
per-version hack is written.

**S4′ (only if S0 fails)** — overlay fallback hardening instead of the dock: `nonCapturing` hide/show,
persisted visibility per session, `visible(w,h)` guard, and the rail promoted to the primary display.
1.5 h.

## S1 — Package skeleton

`package.json` (manifest from `03-architecture.md` §10), `tsconfig.json`, `themes/click-sidebar-cyber.json`
(dark.json copy with `accent`/`borderAccent` = `okhsl(190 95% 55%)`), `src/config.ts`, `src/result.ts`,
`extensions/click-sidebar.ts` wiring a `/sidebar` command that renders a **static** panel through
`host/overlay.ts`.

**Acceptance**

- `pi -e .` starts with **zero** extension warnings and `/sidebar` draws the
  panel; `esc` closes it.
- Config file is created on first run with defaults; a corrupted file falls back and warns once.
- `click-sidebar-cyber` appears in `/settings → Theme` and selecting it turns the dock accents cyan.
- `npx tsc --noEmit` and `node --test src` exit 0.

**Verification**

```bash
npx tsc --noEmit && node --test src
pi -e .      # then: /sidebar, /settings, /reload
```

## S2 — Read layer

`git/exec.ts`, `git/status.ts` (porcelain-v2 parser, pure), `git/refs.ts`, `view/model.ts`,
`view/copy.ts`, plus the test suites in `03-architecture.md` §9. Panel renders real data.

**Acceptance**

- On a repo, the panel's numbers equal `git status --porcelain=v2 --branch` and `git diff --shortstat
  HEAD` read by hand in the same moment.
- Edge cases render instead of crashing: repo without commits (`diff HEAD` fails → `+0 −0` and counts
  only), detached HEAD, no upstream, worktree whose `--show-toplevel` differs from `ctx.cwd`, non-git
  directory, `git` absent from `PATH`.
- The parser has no `any`, no `!`, and its fixtures cover every line type it can meet.
- Measured: one tick ≤ 40 ms on a repo with >5 000 files (otherwise the interval doubles, §5 of the
  architecture).

**Verification**

```bash
node --test src && npx tsc --noEmit
cd <any-repo> && time git status --porcelain=v2 --branch >/dev/null
```

## S3 — Rail and keyboard

`view/rail.ts` (one line, `aboveEditor` widget, `MouseRegion` per segment) and `host/keymap.ts`
(`alt+g`, verb keys, focus in/out).

**Acceptance**

- In `--tui-mode regular`, the rail shows project, branch, counts and model, and stays one line at 80
  columns.
- Every action the rail exposes is reachable by keyboard alone.
- The rail never eats a keystroke meant for the editor.

**Verification**

```bash
pi --tui-mode regular -e ./.
```

## S4 — Dock lane

`host/dock.ts`: capability probe, `HStack` wrap, reconciliation, mode selection, `/sidebar mode ...`.

**Acceptance**

- In fullscreen, the transcript wraps at `columns - dockWidth` and never paints under the lane
  (`PI_TUI_WRITE_LOG` check, not only eyeballing).
- `/settings`, the session selector and `/model` open and close without the lane being lost.
- Resize 160 → 80 → 160: coherent at each size, dock hides below `dockMinTerminalWidth` and the rail
  takes over.
- Switching `tuiMode` at runtime downgrades to `overlay`, never throws.
- Disabling/unloading the extension restores the host layout root (`setLayoutRoot(hostRoot)` on
  `session_shutdown`) — no orphan wrapper.
- Clicks land on the right segment at the right column, including after a resize.

**Verification**

```bash
PI_TUI_WRITE_LOG=/tmp/pi-click-sidebar.log pi -e .
grep -c . /tmp/pi-click-sidebar.log        # frame evidence for the lane boundary
```

## S5 — Write actions

`git/actions.ts`: `fetch`, `pull`, `push`, guard chain, result line, confirm dialogs for the two
non-obvious cases (dirty tree with `push`, no upstream with `push`).

**Acceptance**

- `fetch` on a clean tree: one success line with elapsed tenths; matches `git fetch` run by hand.
- `pull --ff-only` on a diverged branch reports `✗ pull · diverged, fast-forward not possible` and
  leaves the tree byte-identical (`git rev-parse HEAD` and `git status` before/after).
- `pull`/`switch` with a dirty tree refuse and say why; nothing is stashed or discarded.
- `push` never passes `--force`; without upstream it asks before `-u origin <branch>`.
- Network failure (unplug network, or a bogus remote) surfaces `✗ fetch · …` within the timeout, not a
  hang. Timeout path verified with a deliberately slow remote.
- A running action disables the verb row and blocks a second invocation.

**Verification**

```bash
git -C <repo> status --porcelain; git -C <repo> rev-parse HEAD   # before and after each guard test
node --test src
```

## S6 — Branch modal

`view/branch-modal.ts`: base list (current pre-selected), name input, validation, switch/create,
dirty-tree hint.

**Acceptance**

- `switch` on a clean tree moves HEAD to the selected branch and the dock updates within one tick.
- `switch -c <name> <base>` creates the branch **from `<base>`**; verified with
  `git rev-parse --abbrev-ref HEAD@{1}` … or simply `git merge-base --is-ancestor <base> <new>`.
- Invalid names (`foo..bar`, `-x`, `a b`, empty) are rejected before any process runs, with the exact
  reason.
- An existing name is rejected with `branch-exists`; the input keeps its text.
- Dirty tree: submit is disabled, the hint names the file count, `esc` returns focus to the editor.
- The modal is keyboard-complete and the input keeps CJK/IME candidate positioning (`Focusable` +
  `CURSOR_MARKER` per `docs/tui.md`).

**Verification**

```bash
cd <repo> && git switch -c probe/base development && git switch development && git branch -D probe/base
npx tsc --noEmit
```

## S7 — Package and handoff

`README.md` (install, keys, modes, limits, the HTTPS-prompt caveat), `CHANGELOG.md` with `## [0.1.0]`,
schema file for the config, and the handoff checklist.

**Acceptance**

- `git clone https://github.com/AdelysAlberto/pi-click-sidebar` somewhere unrelated to any
  project, `pi install ./pi-click-sidebar`, restart,
  and the dock appears with no absolute path anywhere in the installed tree:

```bash
grep -rn "/Volumes/\|/Users/" <installed-package> || echo "no absolute paths"
```

- A second machine (or a fresh `$HOME`) with only `pi install git:…@v0.1.0` gets the same result.
- `pi list` shows the package; `pi remove` unloads it cleanly.
- README documents every shortcut, every config key, and the three modes.

**Verification**

```bash
grep -rn "/Volumes/\|/Users/" . || echo "no absolute paths"
pi install git:github.com/AdelysAlberto/pi-click-sidebar@v0.1.0 && pi list
```

## Out of scope for v1

Recorded so nobody half-implements them: `commit`, `stash`, merge/rebase conflict resolution, PR
creation or any forge API, multi-repo dashboards, submodule management, file-level staging, commit
history browsing, and any write triggered by the model instead of the operator.

## Risks

| # | Risk | Trigger | Response |
|---|---|---|---|
| R1 | Host layout root is an internal API and changes between Pi versions | S0 fails, or an upgrade breaks the probe | Fallback chain; soft failure with one warning; `/sidebar mode overlay` is a documented workaround |
| R2 | Two `git` processes per tick cost on huge repos | tick > 40 ms measured | Double the interval, throttle `--shortstat`, and report the measurement in the README |
| R3 | `pull --ff-only` annoys someone who wanted a merge | first complaint | Add `pullMode` config in v2, never silently rebase |
| R4 | Theme not selected → dock not cyan | colleague never opens `/settings` | Tokens keep it readable; `accentOverride` exists for the stubborn |
| R5 | HTTPS remote with no credential blocks 60 s | timeout in the result line | README states SSH or a credential helper; `GIT_TERMINAL_PROMPT` is not settable because `ExecOptions` has no `env` |
| R6 | Mouse clicks unused in regular mode | user runs `--tui-mode regular` | Keyboard path is complete by design |
| R7 | Someone reuses this folder inside another project's gate | copying `docs` into a repo with lint/test gates | The package carries its own `test`/`check` scripts; the host repo gate does not apply to it |

## Handoff checklist (colleague)

1. `pi install git:github.com/AdelysAlberto/pi-click-sidebar@v0.1.0` — no path editing, no copy-paste of files.
2. Restart Pi; confirm the dock appears on a git repo and the rail appears in regular mode.
3. `/settings → Theme → click-sidebar-cyber` for the cyan palette (optional; the dock is readable without
   it).
4. `/sidebar config` to see the resolved file path and values; edit and `/reload`.
5. Report `pi --version` with any bug: the layout-root probe is version-sensitive by design.
