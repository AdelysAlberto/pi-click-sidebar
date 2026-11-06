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

**Result (2026-11-06): PASS, four of four criteria.** Observed from captured frames at 160×45 and 80×30,
plus the `fullscreen → regular → fullscreen` round trip through `/settings` (status line, the TUI
reference's own `mode` reading, and the lane returning). Evidence table, the measured
wrapper-loss/reconcile sequence and four design corrections: `01-feasibility.md` §6.1–6.2. Dock mode is
supported; `S4′` is not needed.

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
(dark.json copy with `accent`/`borderAccent` = `okhsl(212 96% 76%)`, the literal that resolves to electric cyan `#20d2ed`; the earlier `okhsl(190 95% 55%)` measured `#109792`, a teal), `src/config.ts`, `src/result.ts`,
`extensions/click-sidebar.ts` wiring a `/sidebar` command that renders a **static** panel through
`host/overlay.ts`.

**Acceptance**

- `pi -e .` starts with **zero** extension warnings and `/sidebar` draws the
  panel; `esc` closes it.
- Config file is created on first run with defaults; a corrupted file falls back and warns once.
- `click-sidebar-cyber` appears in `/settings → Theme` and selecting it turns the dock accents cyan.
- `npx tsc --noEmit` and `node --test "src/**/*.test.ts"` exit 0.

**Result (2026-11-06): done.** Observed from a captured frame at 160×45: the panel draws top-right at 36
columns with the header, PROJECT (name plus middle-ellipsised path), CHANGES, the action rows, an empty
result slot and MODEL filled from the live session; `esc` closes it; no `click-sidebar` warning appears on
a healthy config. A corrupted config produced exactly one `Warning:` line and the defaults, and
`/sidebar config` printed the path plus four value lines. `click-sidebar-cyber` showed up in
`/settings → Theme` with `pi -e .`, and selecting it moved the accent run to `38;2;32;210;237` (`#20d2ed`).

Three deviations, all recorded where they belong: the accent literal in this slice was wrong (see
`02-ux-spec.md` §8); the gate command `node --test src` does not walk a directory on Node 24 (see
`AGENTS.md` §0); and the config dump is one newline-joined notification because Pi replaces a status line
when another info notification follows it, which would have left only the last line visible.

**Verification**

```bash
npx tsc --noEmit && node --test "src/**/*.test.ts"
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
node --test "src/**/*.test.ts" && npx tsc --noEmit
cd <any-repo> && time git status --porcelain=v2 --branch >/dev/null
```

**Result (2026-11-06): done.** Numbers checked against the hand-read commands on a repository with one
deleted, one modified, one staged and one untracked path: `git status --porcelain=v2 --branch` gave 3
tracked entries plus 1 untracked, `git diff --shortstat HEAD` gave `3 files changed, 3 insertions(+), 2
deletions(-)`, and the panel read `CHANGES 3 files`, `+3 −2 ✚1 ✖1`. The six edge cases were each captured
from a live session: no commits (`main`, `0 files`, `+0 −0`), detached (`(detached) f251ef6`), no upstream,
non-git directory (`not a git repository`), a subdirectory of a repository (root path, not the cwd), and a
`git` shim exiting 127 (`git not found in PATH`).

Measured with the real `exec.ts` on 6 000 files and 800 dirty paths: probe + status is 21.9 ms median
(27.0 max), inside the 40 ms budget. The tick that also runs `diff --shortstat HEAD` costs 86.2 ms median,
so per §5 of the architecture the default `refreshIntervalMs` doubled to 6000 and the three reads now run
concurrently. Reading the tree never blocks a frame: the panel keeps rendering the previous model.

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

**Result (2026-11-06): done.** Captured from a live regular-mode session at 80×30 and 150×45: one line,
`cs-dirty  …/cs-dirty  ⎇ main  ✚1 +3 −2  deepseek-flash·medium  alt+g` at 80 (70 columns used) and the
same with the untruncated path at 150 (79 columns). `alt+g` opened the panel with its PROJECT section and
`esc` closed it, which is the whole rail action set, so the keyboard path is complete. Typing `hello` in
the editor landed in the editor and left the rail untouched: the widget never sees editor input.

Two behaviour corrections came out of the live run and are now the shipped rule: the ladder drops and
shrinks in the order the UX spec states (the path goes first), and the first refresh tick runs immediately
instead of after one interval, because a panel that waits shows an empty model.

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

**Result (2026-11-06): done.** Captured at 160×45 with `dockWidth` 34: the transcript box ends at column
125 and the lane occupies 126–159, one panel frame, one top and one bottom row. `/settings` and `/model`
opened and closed with the lane intact. Resizing to 80×30 removed the lane and the rail appeared; back to
160×45 restored the lane at 126. Clicks land on the segment the coordinate names: `f fetch` reported
"fetch arrives in slice 5", the `CHANGES` label reported the file list, the branch name reported the modal,
and the same click worked after a resize to 120 columns with the lane at 86 (x=89 is `f fetch` there).
`/reload` left exactly one lane at column 126, which is the observable proof that `session_shutdown`
restored the host root instead of orphaning a wrapper: a stale wrapper would nest and narrow the host twice.

The runtime `tuiMode` switch was exercised both ways through `/settings`. The host switched, the extension
kept running, and no exception reached the session; regular mode showed the rail and fullscreen brought the
dock back. Reading that switch from the byte stream is noisy because regular mode reprints the transcript,
so the operator's live confirmation is still worth having for this one criterion.

Deviations recorded: the lane width is `config.dockWidth` capped by the terminal instead of the percentage
in `02-ux-spec.md` §3, and the command handler moved to `host/commands.ts` when the entry point reached the
250-line ceiling.

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
node --test "src/**/*.test.ts"
```

**Result (2026-11-06): done**, against a local bare remote (no network needed except for the timeout case).

| Criterion | Observed |
|---|---|
| `fetch` on a clean tree reports one success line | `✓ fetch · main → origin/main · 0.6s`, and `origin/main` moved to the same commit a manual `git fetch` produced |
| `pull --ff-only` on a diverged branch | `✗ pull · diverged, fast-forward not possible`; `HEAD` unchanged (`a0e33d7…`) and `git status` byte-identical |
| dirty tree refuses | `✗ pull · 1 uncommitted file`, `git stash list` empty, the file still there |
| `push` asks before `-u origin <branch>` | dialog `No upstream branch. Push with -u origin feat/noupstream?`; cancel → `✗ push · cancelled, nothing was pushed` and no remote branch; accept → `✓ push · origin/feat/noupstream` and `git branch -vv` shows the upstream. No `--force` in any argv |
| network failure surfaces in time | origin pointed at an unroutable host with `timeouts.network` 4000 → `✗ fetch · timed out after 4s`, no hang |
| a running action blocks a second one | second `f` while fetching → notice `fetch is still running`, verbs dimmed and unhittable |

Two corrections the slice forced, both in the architecture: divergence is decided from `ahead`/`behind`
instead of git's prose, and `up to date`/`fast-forward` from comparing `HEAD`, because git localises its
messages and `exec` has no `env` to force `LC_ALL`.

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

**Result (2026-11-06): done**, against the local repository from Slice 5.

| Criterion | Observed |
|---|---|
| switch moves HEAD and the dock updates | modal on `main`, arrow to `feat/noupstream`, enter → `HEAD` is `feat/noupstream` and the lane shows it within one tick |
| `switch -c <name> <base>` starts from the base | with `feat/noupstream` selected, `probe/base` was created and its tip is that same commit (`git log --graph -3 probe/base` → `3b7b004 four`) |
| invalid names rejected before any process | `foo..bar` → `cannot contain ..`, no ref created; the same for `-x`, `a b`, `/start/`, `x.lock`, an empty name |
| an existing name is `branch-exists` and keeps the text | typing `main` → `branch main already exists`, input still `main` |
| dirty tree disables submit | untracked file present → `1 uncommitted file · commit or discard first`, enter creates nothing |
| keyboard complete, `esc` returns focus | arrows, `tab`, `enter`, `esc`; after `esc` the typed text landed in the editor (`❯ hola`) |

One correction: closing the modal returned focus to the lane, not the editor, because the lane was what had
focus before the overlay opened. `openBranches` now blurs the lane after the modal resolves.

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
