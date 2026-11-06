---
title: "Pi Click Sidebar 03 — Architecture and contracts"
module: "pi-click-sidebar package internals"
author: "pi (architecture)"
date: 2026-11-06
status: Pending
priority: P1
scope: "[Backlog]"
source: "docs/01-feasibility.md"
---

# 03. Architecture

## 1. Shape

One package, four layers, one direction: `host → data → view`. The view never spawns a process; the
data layer never imports a pi-tui component; the host layer is the only place that knows about
`setLayoutRoot`, `setWidget` or overlays.

```text
extensions/click-sidebar.ts        wiring: flags, command, shortcut, session_start
  ├─ host/refresh.ts          one timer + Pi events → data refresh → requestRender
  ├─ host/dock.ts             fullscreen layout-root wrap  (only internal-API module)
  ├─ host/overlay.ts          fallback overlay host
  ├─ host/keymap.ts           focus, verb dispatch, esc
  ├─ git/*.ts                 argv contracts, parsing, guards   (pure where possible)
  └─ view/*.ts                ViewModel → lines, mouse regions, modal
```

## 2. File layout and budgets

250 LOC per file is the ceiling; the numbers below are targets, not entitlements.

```text
pi-click-sidebar/                    (repository root = package root)
├── package.json                    name, version, pi manifest, peerDependencies
├── package-lock.json               dev-only toolchain, so the gate is reproducible
├── tsconfig.json                   strict, noUncheckedIndexedAccess
├── README.md                       install, keys, modes, limits
├── CHANGELOG.md                    keep-a-changelog headings (pi reads it)
├── AGENTS.md                       repo contract: gate, invariants, integration branch
├── LICENSE
├── docs/                           this plan; ships no behaviour
│   ├── README.md
│   ├── 01-feasibility.md
│   ├── 02-ux-spec.md
│   ├── 03-architecture.md
│   └── 04-plan.md
├── themes/
│   └── click-sidebar-cyber.json    dark.json + cyan accent
├── schema/
│   └── config.schema.json          validates <agent-dir>/pi-click-sidebar.json
├── extensions/
│   └── click-sidebar.ts       ~90  entry point, no logic
└── src/
    ├── config.ts             ~230  defaults, read/validate, atomic write, describe
    ├── config.test.ts         ~99  defaults, clamping, corruption, first-run creation
    ├── result.ts              ~50  Result helpers
    ├── git/
    │   ├── exec.ts            ~70  runGit(): argv, timeout, killed→timeout, code
    │   ├── status.ts         ~140  porcelain-v2 parser (pure) + repo probe
    │   ├── refs.ts            ~70  branch list, name validation, existence
    │   └── actions.ts        ~150  fetch/pull/push/switch/create + guards
    ├── view/
    │   ├── model.ts          ~120  status + session → ViewModel (pure)
    │   ├── copy.ts            ~73  every user-visible string
    │   ├── text.ts            ~52  visibleWidth helpers: ellipsis, padding, spread
    │   ├── sidebar.ts        ~211  dock/overlay component
    │   ├── rail.ts            ~80  one-line widget (regular mode)
    │   └── branch-modal.ts   ~150  select + input overlay
    └── host/
        ├── dock.ts           ~120  probe, wrap, reconcile
        ├── present.ts         ~25  pick the host: dock, else overlay
        ├── overlay.ts         ~43  show/hide the panel as an overlay
        ├── refresh.ts         ~90  timer, backoff, event wiring
        └── keymap.ts          ~50  focus and verb dispatch
```

Components are **factory functions returning objects** (`{render, handleMouse?, handleInput?,
invalidate, dispose?}`), never classes: pi-tui only requires the shape.

## 3. Result pattern

Every boundary returns the project's typed result. Nothing throws across a layer.

```ts
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: GitError };
export type Result<T> = Ok<T> | Err;

export type GitErrorCode =
  | "not-a-repo" | "git-missing" | "timeout" | "dirty-tree" | "diverged"
  | "operation-in-progress" | "invalid-ref" | "branch-exists" | "rejected" | "unknown";

export type GitError = {
  code: GitErrorCode;
  /** Already user-facing English, one line, <= 60 chars when possible. */
  message: string;
  /** First meaningful line of stderr, untruncated, for the error detail overlay. */
  detail?: string;
};
```

`view/*` consumes `Result` and never inspects `stderr`; `02-ux-spec.md` §7 owns the copy.

## 4. Git contracts

All calls go through `runGit(args, {cwd, timeoutMs})` → `pi.exec("git", args, {cwd, timeout})`.
**argv arrays only**; no string interpolation, no shell. `killed === true` maps to `timeout`;
`code === 127` maps to `git-missing`.

| Purpose | argv | Timeout | Writes | Notes |
|---|---|---|---|---|
| Repo probe | `rev-parse --show-toplevel` | 3 s | no | failure → `not-a-repo`, project section shows the dim line |
| Status | `status --porcelain=v2 --branch -z` | 3 s | no | one process gives branch, oid, upstream, ahead/behind and per-file state |
| Line deltas | `diff --shortstat HEAD` | 3 s | no | expensive relative to status → throttled (§5) |
| Branches | `for-each-ref --format=%(refname:short)%09%(committerdate:unix) refs/heads` | 3 s | no | sorted by commit date desc in TypeScript |
| In-progress op | `rev-parse --git-dir` + `fs.existsSync(gitDir/MERGE_HEAD, REBASE_HEAD, CHERRY_PICK_HEAD)` | 3 s | no | read-only FS access, no parsing of git internals |
| Validate name | `check-ref-format --branch <name>` | 3 s | no | non-zero → `invalid-ref` |
| Name exists | `show-ref --verify --quiet refs/heads/<name>` | 3 s | no | `code 0` means exists → `branch-exists` |
| Fetch | `fetch --prune` | 60 s | network | no refspec: never touches local branches |
| Pull | `pull --ff-only` | 60 s | network + tree | `--ff-only` is not configurable in v1: a diverged branch reports `diverged`, it never merges or rebases |
| Push | `push` (or `push -u origin <branch>` after an explicit confirm when there is no upstream) | 60 s | network | never `--force`, never `--force-with-lease` |
| Switch | `switch <branch>` | 15 s | tree | dirty guard first |
| Create | `switch -c <name> <base>` | 15 s | tree + ref | base is the selected ref; the tree is never moved to the base first |

Guards, evaluated in this order before any tree-changing command:

1. repo probe, 2. in-progress operation (merge/rebase/cherry-pick → `operation-in-progress`),
3. dirty tree (`status` non-empty → confirm dialog; v1 has no auto-stash, so the confirm offers
   `cancel` and `continue` where git itself is safe — `switch` and `pull` are refused, `fetch` and
   `push` are not tree-changing and proceed), 4. argv-specific validation (ref format, existence).

`GIT_TERMINAL_PROMPT` cannot be set: `ExecOptions` exposes `signal`, `timeout`, `cwd`, `maxBuffer`
(`dist/core/exec.d.ts:7-19`) and no `env`. A push over HTTPS with no stored credential will block
until the 60 s timeout and report `timeout`. The README says: use an SSH remote, or authenticate with a
credential helper.

## 5. Refresh policy

One timer for the whole extension. A second timer is a bug, not a layout choice.

```text
tick (default 3000 ms)
  ├─ if a tick is still in flight → skip (reentrancy guard)
  ├─ reconcile dock (§01 §1)               cheap, no process
  ├─ git status                            always
  ├─ git diff --shortstat HEAD             every 3rd tick, or right after an event
  └─ requestRender()                       only when the ViewModel changed (deep compare on a
                                           small frozen object), so idle ticks cost no frames
```

Event-driven refresh, wired once in `host/refresh.ts`: `session_start`, `turn_end`,
`tool_execution_end`, `user_bash`, `model_select`, `session_compact`, plus every completed git action.
Events set `dirty = true`; the next tick does the work. No work is done while an action is running.

Cost, stated honestly: two `git` processes every 3 s on a large repository. The mitigation is the
throttled `--shortstat` (the status command is the cheap one) and the change check before rendering.
The interval is config (`refreshIntervalMs`), and the first measurable thing after Slice 2 is the
per-tick wall time on a big repo; if it exceeds 40 ms, the interval doubles before anything else is
touched.

Backoff: three consecutive failures → 15 s interval, one dim `⏸ stale` marker; the first success
restores the configured interval. Shutdown: `session_shutdown` and the component's `dispose()` both
clear the timer; `dispose()` is idempotent.

## 6. Configuration

`<agent-dir>/pi-click-sidebar.json`, written on first run with defaults, validated field by field.

```json
{
  "mode": "auto",
  "dockWidth": 34,
  "dockMinTerminalWidth": 96,
  "refreshIntervalMs": 3000,
  "shortstatEveryNTicks": 3,
  "showFileList": false,
  "accentOverride": null,
  "timeouts": { "read": 3000, "network": 60000, "tree": 15000 }
}
```

| Key | Type | Default | Effect |
|---|---|---|---|
| `mode` | `"auto" \| "dock" \| "overlay" \| "rail" \| "off"` | `"auto"` | `auto` follows the probe; `off` loads the extension and does nothing |
| `dockWidth` | 24–48 | `34` | Fixed lane width in columns |
| `dockMinTerminalWidth` | 80–200 | `96` | Below this the dock hides and the rail takes over |
| `refreshIntervalMs` | 1000–30000 | `3000` | Tick period |
| `shortstatEveryNTicks` | 1–10 | `3` | Throttle for `diff --shortstat` |
| `showFileList` | boolean | `false` | Start with the changed-file section expanded |
| `accentOverride` | `null \| "#rrggbb"` | `null` | Forces a concrete accent, bypassing the theme; documented contrast risk |
| `timeouts.*` | ms | table above | Per class of command |

Unknown keys are ignored with a single `ctx.ui.notify(..., "warning")` per session. An unreadable or
invalid file falls back to defaults and says so once; it never blocks startup. `/sidebar config` prints
the resolved values and the file path, so a colleague can see what is actually in effect.

The file has no `$schema` key: an editor cannot validate JSON without a URL, and inventing one before
the schema is published is a lie. The schema ships at `schema/config.schema.json`, and S7 adds the
`$schema` line only after the repository is public and the raw URL exists. Validation is enforced by
`src/config.ts` at runtime regardless of what an editor does.

## 7. Paths — the portability contract

| Need | Source | Forbidden |
|---|---|---|
| Project directory | `ctx.cwd` | any literal path, `process.cwd()` |
| Agent directory | `process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent")` | a hardcoded `~/.pi/agent` string |
| Config file | `path.join(agentDir, "pi-click-sidebar.json")` | a path relative to the extension file |
| Bundled theme | package resource via `pi.themes` | reading `import.meta.dirname/../themes/...` at runtime |
| Host packages | `peerDependencies: {"@earendil-works/pi-*": "*", "typebox": "*"}` | `dependencies` (duplicate class instances, `docs/packages.md`) |
| Display of home | `os.homedir()` + replacement for `~` | stored `~` substitution |

`import.meta.dirname` is allowed only for diagnostics (printing where the package lives), never to
resolve a resource.

## 8. TypeScript rules

- No `any`, no `@ts-ignore`, no non-null assertions on values that can be missing.
- The one structural cast lives in `host/dock.ts`:

```ts
type LayoutRootHost = {
  setLayoutRoot?: (c: Component | undefined) => void;
  getMountedRoots?: () => readonly Component[];
};
const host = tui as unknown as LayoutRootHost;
```

  Everything else consumes `probeDockSupport(tui): DockSupport` returning
  `{ supported: true; wrap(root: Component): boolean } | { supported: false; reason: string }`.
- `strict: true`, `noUncheckedIndexedAccess: true`. Parser code indexes `string[]` constantly; the flag
  turns a class of crash into a compile error.
- Runtime type stripping only (Node ≥ 22.19, Pi's own floor). No decorators, no `enum`, no namespaces.

## 9. Tests

`node --test` with `node:assert/strict`, no extra dependency. Only pure modules are tested; nothing in
`git/exec.ts`, `host/*` or the components is unit-tested (they need a terminal and a repo, and the
slice gates cover them by hand).

| Suite | Fixtures |
|---|---|
| `git/status.test.ts` | clean repo; 2 modified + 1 untracked; staged-only; deleted; renamed (`2 ...`); unmerged (`u ...`); detached header; no upstream; ahead/behind values |
| `view/model.test.ts` | width 28/34/44 line budgets; middle-ellipsis of a long path; branch right-ellipsis at 26; number formatting (`0`, `999`, `12.4k`, `1.2M`); stale marker; every `GitErrorCode` produces a result line |
| `view/copy.test.ts` | no string contains a newline or a tab; every key used by the model exists |
| `config.test.ts` | defaults; unknown key warning; out-of-range clamping; corrupt JSON → defaults; first-run creation; `PI_CODING_AGENT_DIR` resolution |

## 10. Package manifest

```json
{
  "name": "pi-click-sidebar",
  "version": "0.1.0",
  "description": "Clickable right sidebar for Pi: project, git changes, branch actions and model context",
  "type": "module",
  "engines": { "node": ">=22.19.0" },
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/click-sidebar.ts"],
    "themes": ["./themes/click-sidebar-cyber.json"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  },
  "scripts": {
    "test": "node --test \"src/**/*.test.ts\"",
    "check": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "@types/node": "^22.0.0"
  }
}
```

No `dependencies`. No build step: Pi loads TypeScript through jiti (`docs/extensions.md:211`).
