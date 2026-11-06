# Changelog

Every release gets a heading in the form `## [x.y.z]`, because Pi reads package changelogs. `npm run
release:patch|minor|major` moves `## [Unreleased]` into a dated heading, bumps the version, runs the gate,
commits and tags.

## [Unreleased]

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

[Unreleased]: https://github.com/AdelysAlberto/pi-click-sidebar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AdelysAlberto/pi-click-sidebar/releases/tag/v0.1.0
