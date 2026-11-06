# pi-click-sidebar

A clickable right-hand sidebar for [Pi](https://pi.dev): the session's project, git changes, branch
actions and model context, one glance away and never in front of the conversation.

```
╭────────────────────────────────╮
│ PROJECT                        │
│ acme-web                       │
│ ~/Projects/acme/web            │
│                                │
│ CHANGES                2 files │
│ +70 −8   ✚2 ✖0                 │
│                                │
│ BRANCH                         │
│ feat/new-sidebar               │
│ ↑1 ↓3                          │
│                                │
│ f fetch   p pull   u push      │
│ s switch  n new   r refresh    │
│                                │
│ ✓ pull · up to date · 0.8s     │
│                                │
│ MODEL                          │
│ deepseek-v4 · med              │
│ ctx 38%                        │
╰────────────────────────────────╯
```

## Install

```bash
pi install git:github.com/AdelysAlberto/pi-click-sidebar@v0.1.0
```

Restart Pi. Nothing else is required: `peerDependencies` are supplied by Pi, there is no build step and no
runtime dependency (Pi loads the TypeScript through jiti).

To try a local checkout without installing it: `pi -e ./pi-click-sidebar`.

## The four surfaces

`mode` decides which one carries the panel; `auto` is the default and follows the host.

| Surface | When `auto` picks it | What it looks like |
|---|---|---|
| `dock` | fullscreen **and** the host exposes a layout root **and** `columns ≥ dockMinTerminalWidth` | a lane on the right; the transcript reflows beside it and never paints underneath |
| `rail` | anything else: regular mode, an older host, or a narrow terminal | one line above the editor: project, path, branch, counts, model, `alt+g` |
| `overlay` | only when forced | the same panel as a 36-column overlay anchored top-right, opened with `alt+g`, covering the transcript's right columns while it is open |
| `off` | only when forced | the extension loads and does nothing |

`/sidebar mode <auto|dock|overlay|rail|off>` forces one for the current session; the config file stays the
source of truth and is not rewritten.

## Keys

`alt+g` is the only global key. It never steals a keystroke from the editor: the panel only receives input
while it has focus, and `esc` gives focus back to the editor (or to whatever had it before).

| Key | Where | Action |
|---|---|---|
| `alt+g` | anywhere | open/close the panel; with the dock up, move focus in or out |
| `f` `p` `u` | panel focused | `fetch`, `pull --ff-only`, `push` |
| `s` | panel focused | branch list: pick a base and switch |
| `n` | panel focused | new branch from the selected base |
| `r` | panel focused | refresh now |
| `d` | panel focused | changed-file list (not in 0.1.0, says so) |
| `?` | panel focused | key map, inline in the result slot |
| `j` `k` `↓` `↑` | panel focused | move the cursor |
| `enter` | panel focused | run what the cursor is on |
| `esc` | panel focused | leave the panel; in the modal, cancel |
| `↑` `↓` `tab` `enter` `esc` | branch modal | pick a base, move between list and name, submit, cancel |

Mouse: clicking a verb runs it, clicking the branch name opens the modal, clicking `CHANGES` reports the
file list, clicking the project path shows the absolute path. Regular mode leaves mouse input to the
terminal, which is why every one of those has a key.

## Configuration

`<agent-dir>/pi-click-sidebar.json`, created with the defaults on first run. The agent directory is
`$PI_CODING_AGENT_DIR`, else `~/.pi/agent`. `/sidebar config` prints the resolved path and every value in
effect.

| Key | Type | Default | Effect |
|---|---|---|---|
| `mode` | `auto` \| `dock` \| `overlay` \| `rail` \| `off` | `auto` | which surface carries the panel |
| `dockWidth` | 24–48 | `34` | lane width in columns, capped so the transcript keeps 24 |
| `dockMinTerminalWidth` | 80–200 | `96` | below this the dock hides and the rail takes over |
| `refreshIntervalMs` | 1000–30000 | `6000` | tick period |
| `shortstatEveryNTicks` | 1–10 | `3` | how often `git diff --shortstat HEAD` runs |
| `showFileList` | boolean | `false` | reserved for the changed-file list |
| `accentOverride` | `null` or `#rrggbb` | `null` | forces a concrete accent, bypassing the theme |
| `timeouts.read` | ms | `3000` | probe, status, refs |
| `timeouts.network` | ms | `60000` | fetch, pull, push |
| `timeouts.tree` | ms | `15000` | switch |

A bad file never blocks startup: an out-of-range number is clamped and reported, a wrong type keeps the
default, an unknown key is reported once, and invalid JSON falls back to the defaults with one warning.
`schema/config.schema.json` describes the same rules for editors.

## Theme

`click-sidebar-cyber` is a copy of Pi's `dark.json` with the accent moved to electric cyan
(`okhsl(212 96% 76%)`, which Pi resolves to `#20d2ed`). Pick it in `/settings → Theme`. The panel renders
with theme tokens only, so it stays readable under `system`, `dark` or `light` without it.

## What it does to your repository

Read-only: `rev-parse`, `status --porcelain=v2`, `diff --shortstat`, `for-each-ref`, `show-ref`,
`check-ref-format`, and reading the merge/rebase/cherry-pick markers.

Writes happen only when you press a key or click a verb, and never otherwise: no timer, no event and no
model request runs `fetch`, `pull`, `push` or `switch`.

- `pull` is `--ff-only`. A diverged branch is reported and left alone; nothing is merged or rebased.
- There is no `--force`, no `--force-with-lease`, no automatic stash and no rebase anywhere.
- `pull` and `switch` refuse a dirty tree and say how many files are involved; nothing is stashed.
- `push` asks before adding an upstream (`-u origin <branch>`) and before pushing with uncommitted files.

## Limits, stated up front

- **The dock depends on a host internal.** Wrapping the layout root is documented nowhere in Pi, and the
  probe is version-sensitive by design: if it fails, the rail takes over and the panel is still complete.
  `docs/upstream/tui-layout-root.md` proposes documenting it. Report `pi --version` with any dock bug.
- **HTTPS remotes without a credential block until the timeout.** Pi's `exec` exposes no `env`, so
  `GIT_TERMINAL_PROMPT=0` cannot be set: use an SSH remote or a credential helper.
- **The refresh tick costs two `git` processes.** Measured on 6 000 files with 800 dirty paths: probe plus
  status is 21.9 ms median, the tick that also runs `--shortstat` is 86.2 ms, which is why the interval
  defaults to 6 s and the deltas run every third tick. A slow tick never blocks a frame.
- **Regular mode has no dock.** There is no horizontal axis there; the rail is the whole feature in that
  mode, and the overlay on `alt+g`.
- **Not in 0.1.0:** commit, stash, conflict resolution, pull requests, multi-repo, submodules, file-level
  staging, history browsing.

## Development

```bash
npx tsc --noEmit                  # strict, noUncheckedIndexedAccess
node --test "src/**/*.test.ts"    # 83 tests, no extra dependency
```

The test runner takes a glob: on Node 24 `node --test src` tries to load the directory as a module.

### Releasing

```bash
npm run release:tag      # tag the version already in package.json
npm run release:patch    # or :minor / :major, which bump first
git push origin main --follow-tags
```

The script refuses a dirty tree and any branch but `main`, runs the gate, moves `## [Unreleased]` in
`CHANGELOG.md` into a dated heading, commits `chore(release): vX.Y.Z` and creates an annotated tag. It does
not push unless you pass `--push`: that is the one step worth doing by hand.

Layering is one direction, `host → data → view`: `extensions/` wires, `src/host/` knows Pi, `src/git/`
spawns and parses, `src/view/` formats. A view never spawns a process, and only `src/host/dock.ts` touches
the host layout root.

## License

MIT.
