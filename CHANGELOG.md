# Changelog

Every release gets a heading in the form `## [x.y.z]`, because Pi reads package changelogs. `npm run
release:patch|minor|major` moves the Unreleased notes into a dated heading, bumps the version, runs the
gate, commits and tags.

## [Unreleased]

## [0.1.2] - 2026-11-06

### Fixed

- **The keyboard.** With the dock focused, keys the panel did not bind were dropped, so typing disappeared
  and the app looked frozen. Printable keys now reach the editor and focus comes back with them. The frame
  turns `borderAccent` when the panel holds the keyboard and shows `alt+g focus` when it does not.
- **A verb that would not stop.** `git fetch` to a remote that does not answer blocks for the whole network
  timeout; `esc` now cancels it, the progress line repaints once per second instead of five times, and a
  cancelled command reports `cancelled` instead of pretending it timed out.
- **A cancellation race.** A cancel arriving before the network command started was lost, because the abort
  listener was attached after the signal had fired. `exec.ts` refuses to spawn an already-cancelled command.
- **The branch modal's buttons.** The button row index was measured after the hint row, so clicks landed one
  row off and the hint row submitted. `tab` now cycles the base list, the name field and the buttons;
  `left`/`right` picks a button, the armed one is drawn inverse, both are clickable, and the hints fit.

## [0.1.1] - 2026-11-06

### Fixed

- `/sidebar mode` drew two lanes: the command re-mounts the surface, and a second mount wrapped the existing
  wrapper. Mounting is idempotent now, with a test that drives the module against a fake viewport TUI.
- The config file written on first run carries `$schema`, pointing at the published schema. The parser
  treats it as a known key instead of reporting it as unknown.
- `scripts/release.ts` installs the dev toolchain when run in a fresh clone, and rewrites only the
  `## [Unreleased]` heading rather than the same words inside the explanatory prose.

## [0.1.0]

First release.

### The sidebar

- **Dock** in fullscreen: the host layout root is wrapped so the transcript reflows beside a 34-column
  lane instead of being covered. The wrapper is re-applied on every refresh tick, because the host
  re-asserts its own layout root on mount and on every `tuiMode` switch.
- **Rail** in regular mode and whenever the dock is not available: one line above the editor with project,
  path, branch, change counts and model, fitted by a fixed truncation ladder.
- **Overlay** on `alt+g` when forced, or on demand in every mode.
- `/sidebar mode <auto|dock|overlay|rail|off>` forces a surface for the session.

### Data

- One read of the tree per tick: `rev-parse --show-toplevel`, `status --porcelain=v2 --branch -z`,
  and a throttled `diff --shortstat HEAD`, run concurrently.
- Porcelain-v2 parser covering ordinary, renamed, unmerged, untracked and ignored records, plus the
  initial oid, detached head, absent upstream and divergence headers.
- Divergence is decided from `ahead`/`behind` and "up to date" from comparing `HEAD`, so the verdict does
  not depend on the language git prints in.
- Change counts in at most three significant digits (`12.4k`), so the numeric column does not jitter.

### Actions

- `fetch`, `pull --ff-only`, `push` behind a guard chain: repository probe, operation markers, dirty tree,
  then the argument questions. One action at a time, with a progress line and a single result line.
- Branch modal: base list with the current branch pre-selected, name field, and `switch -c <name> <base>`
  that creates from the chosen base without moving the working tree first.
- Invalid branch names are refused before any process runs, with the reason; an existing name is reported
  as `branch-exists` and the text is kept for editing.
- No `--force`, no `--force-with-lease`, no automatic stash, no rebase.

### Configuration and theme

- `pi-click-sidebar.json` in the agent directory, created atomically with the defaults on first run,
  validated field by field at runtime, with `schema/config.schema.json` describing the same rules.
- `/sidebar config` prints the resolved path and every value in effect.
- Bundled `click-sidebar-cyber` theme: Pi's `dark.json` with the accent at `okhsl(212 96% 76%)`, which
  resolves to electric cyan `#20d2ed`.

### Known limits

- The dock depends on an undocumented host internal; a failed probe degrades to the rail with a warning.
- HTTPS remotes without a stored credential block until the network timeout, because `exec` exposes no
  `env` to disable the prompt.
- The changed-file list (`d`) and file-level detail are not in this release.

[Unreleased]: https://github.com/AdelysAlberto/pi-click-sidebar/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/AdelysAlberto/pi-click-sidebar/releases/tag/v0.1.2
[0.1.1]: https://github.com/AdelysAlberto/pi-click-sidebar/releases/tag/v0.1.1
[0.1.0]: https://github.com/AdelysAlberto/pi-click-sidebar/releases/tag/v0.1.0
