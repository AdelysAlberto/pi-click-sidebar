---
title: "Pi Click Sidebar 01 — Feasibility, evidence and abort criteria"
module: "pi-click-sidebar host integration"
author: "pi (architecture)"
date: 2026-11-06
status: Done
priority: P1
scope: "[Backlog]"
source: "docs/README.md"
---

# 01. Feasibility

Everything below was read from the installed Pi **1.5.0** tree
(`<agent-dir>/install/releases/1.5.0/node_modules/@earendil-works/`), not from memory. Paths are
relative to that `node_modules` directory. Line numbers are from the installed build; they will drift
with a Pi upgrade, so the *names* (`setLayoutRoot`, `getMountedRoots`, `dispatchMouseToLayout`) are the
stable identifiers.

## 1. The question that decides the design

> Can the transcript shrink so that it wraps beside a right dock, instead of being covered by an
> overlay?

**Yes — but only by replacing the host's layout root, which is an internal extension point.**

It is not a theme. A theme in Pi is colour only (`coding-agent/docs/themes.md`: `colors`, `vars`,
`export`; no geometry). Width is decided by the layout tree, and the host owns that tree.

The mechanism is real and small:

```text
pi-tui/dist/tui-alt-screen.js:143   setLayoutRoot(component)      // public on ViewportTUI
pi-tui/dist/tui-alt-screen.js:150   render(width) => this.layoutRoot?.render(width) ?? super.render(width)
pi-tui/dist/tui-alt-screen.js:153   getMountedRoots() => this.layoutRoot ? [this.layoutRoot] : this.children
```

So a layout root is *the* thing rendered. Wrap it and the transcript reflows:

```ts
// HStack: [ existing host layout | sidebar lane ]
const wrapped = new HStack([
  { component: hostRoot, grow: 1, shrink: 1, minSize: 20 },
  { component: sidebar, basis: 34, grow: 0, shrink: 1, minSize: 24, maxSize: 48 },
]);
tui.setLayoutRoot(wrapped);
```

`HStack` is exported by pi-tui and its entries accept `basis | grow | shrink | minSize | maxSize |
visible(viewport)` (`pi-tui/dist/components/stack.d.ts`), which gives responsive behaviour for free:
`visible: viewport => viewport.width >= 96` hides the dock on a narrow terminal instead of squeezing
the transcript to nothing.

### What it costs

| Cost | Evidence | Mitigation |
|---|---|---|
| The host's root is not an extension-facing value. Reaching it needs `getMountedRoots()`, declared `protected` (`pi-tui/dist/tui.d.ts:324`), through a cast. | `tui.d.ts:324`, `tui-alt-screen.js:153` | Isolate in one module with a runtime capability probe; the rest of the package never sees the cast. |
| The host re-asserts `setLayoutRoot` on its own schedule and would silently discard the wrapper. | `interactive-mode.js:616` (mount), `:647` (`setLayoutRoot(undefined)` on mode switch), `:664` and `:709` (remounts); measured in §6.1 | Reconcile: after every wrap check `tui.getMountedRoots()[0] === wrapped`, and re-wrap when it is not. Runs on the existing refresh tick, not a second timer. |
| Fullscreen only. `TuiMainScreen` (regular mode) renders `children` vertically; there is no layout root and no horizontal axis. | `tui-alt-screen.js:143` vs `tui.js` `TuiBase`; `chat-viewport.js` is used only by the viewport layout | Fallback mode (§5). Default `tuiMode` is `fullscreen` (`docs/settings.md:97`), so this hits the common case. |
| Pi upgrade can move the symbols. | — | `engines`-style warning + soft failure: if the probe fails, the extension keeps working in fallback mode and says so once. Never crash the session. |

`layoutRoot` itself is `private` (`pi-tui/dist/tui-alt-screen.d.ts:44`), so the probe must not read it
directly. Use `getMountedRoots()` (protected, callable at runtime) as the single probe.

## 2. What the extension API actually exposes

| Need | API | Contract |
|---|---|---|
| Persistent line near the editor | `ctx.ui.setWidget(key, factory, {placement})` | Vertical only: `aboveEditor` / `belowEditor` (`docs/extensions.md` "Widgets, Status, and Footer"; `dist/core/extensions/types.d.ts:46-56`). |
| Replace header / footer / editor | `setHeader`, `setFooter`, `setEditorComponent` | Each replaces the host component; a custom footer must reimplement 264 lines of usage/context logic (`components/footer.js`). |
| Transient panel | `ctx.ui.custom(factory, {overlay:true, overlayOptions, onHandle})` | Full overlay control: `width`, `minWidth`, `maxHeight`, `anchor`, `offsetX/Y`, `row`, `col`, `margin`, `visible(w,h)`, `nonCapturing` (`pi-tui/dist/tui.d.ts:144-171`). |
| Live overlay without stealing the keyboard | `overlayOptions.nonCapturing` | Skipped by `getTopmostVisibleOverlay` (`pi-tui/dist/tui.js:566+`), so the editor keeps input. |
| Hide / show without destroying | `handle.setHidden(bool)`, `handle.focus()`, `handle.unfocus({target})` | `tui.d.ts:187-210`. |
| Click regions inside any component | `MouseRegion(child, handler)` | `pi-tui/dist/components/mouse-region.d.ts`; events carry `x`, `y`, `screenX/Y`, `width`, `height`. |
| Keyboard | `pi.registerShortcut(key, {...})`, `registerCommand(name, {...})` | `docs/extensions.md:1849`. |
| Shell | `pi.exec(command, args, {cwd, timeout, signal, maxBuffer})` → `{stdout, stderr, code, killed, truncated}` | `dist/core/exec.d.ts:7,23`; argv array, no shell string. |
| Model / thinking / context | `ctx.model`, `ctx.thinkingLevel`, `ctx.getContextUsage()`, `ctx.sessionManager` | `dist/core/extensions/types.d.ts:232-272`. |
| Import host modules from anywhere | Loader maps `@earendil-works/pi-*` to the host copy | `dist/core/extensions/loader.js:55-75`; declare them in `peerDependencies` with `"*"` (`docs/packages.md` "Declare dependencies"). |

## 3. Mouse: two different dispatch paths, both usable

| Path | Works for | Evidence |
|---|---|---|
| `dispatchMouseToOverlay` → hit test against rendered overlay rects | overlay panel | `pi-tui/dist/tui.js:539-564` |
| `dispatchMouseToLayout` → layout boxes, skipping containers | anything inside the layout root, **including the dock lane** | `pi-tui/dist/tui-alt-screen.js:648-660`, called at `:523` |
| Proof that non-overlay components receive clicks in the host | `BuiltInHeader.handleMouse` handles clicks on the logo | `interactive-mode.js:117-125` |

The built-in footer is **not** clickable: `components/footer.js` contains no `handleMouse`. The branch
name currently visible above the editor therefore cannot become a click target without replacing the
whole footer, which is why the dock/rail own the click surface (`02-ux-spec.md` §2).

## 4. Colour

- `dark.json` (56 tokens) is the base for the bundled theme:
  `dist/modes/interactive/theme/dark.json`.
- A theme is a package resource: `pi.themes` in `package.json`, or `themes/` in a conventional package
  (`docs/packages.md`). It becomes selectable; it does not replace the active theme automatically.
- Rendering therefore uses **tokens only** (`accent`, `border`, `borderMuted`, `text`, `muted`, `dim`,
  `success`, `error`, `warning`). If the colleague never selects the bundled theme, the dock still
  reads correctly under `system`, `dark` or `light`. Hardcoded cyan is a config flag, not the default:
  cyan text on a white background fails contrast.
- Concrete colours when a token must be used in the other slot come from `theme.colors[token]`
  (`pi-tui` `Color`: `indexed | rgb | oklch`).

## 5. Fallback chain

One data layer, three hosts, selected at runtime:

| Mode | When | Behaviour |
|---|---|---|
| `dock` | fullscreen **and** the layout-root probe succeeded | Right lane, transcript reflows, always visible. |
| `overlay` | fullscreen, probe failed or `columns < 96` | `nonCapturing` overlay anchored `top-right`, toggled by `alt+g`. Covers the transcript's right columns while open. Documented, not hidden. |
| `rail` | regular mode (`TuiMainScreen`) | One line in the `aboveEditor` widget: project, `⎇ branch`, changes, model. Click opens the overlay panel. |

Mode is chosen once per session and re-evaluated on the same reconciliation tick, so switching
`tuiMode` at runtime downgrades instead of breaking. `/sidebar mode <dock|overlay|rail|auto>` forces
one.

## 6. Spike before any module: `SPIKE-DOCK`

A throwaway extension, ≤80 lines, no git code, that answers one question: does wrapping the host root
in an `HStack` work with the installed build?

Steps:

1. `session_start` → `ctx.ui.setWidget("spike", factory)` to obtain the live `tui` object.
2. Probe: `typeof (tui as unknown as Renamed).setLayoutRoot === "function"` and
   `Array.isArray((tui as unknown as Renamed).getMountedRoots?.())`.
3. Take `hostRoot = roots[0]`, build `HStack([{component: hostRoot, grow: 1}, {component: probeLane,
   basis: 30}])`, call `setLayoutRoot(wrapped)`, `tui.requestRender()`.
4. Observe: transcript text wraps at `columns - 30` and never draws under the lane; the editor is 30
   columns narrower; scrolling still follows; selection and copy still work; `Ctrl+G`-style
   mode-independent UI (session selector, `/settings`) still renders.

Pass criteria (all four, observed by eye **and** by `PI_TUI_WRITE_LOG` capture):

- no line in the emitted frame contains transcript glyphs in the lane's columns;
- resizing the terminal to 80 and back to 160 keeps the two lanes coherent;
- opening `/settings` and closing it does not drop the lane;
- switching `tuiMode` and back either keeps the lane or cleanly falls back to `overlay`.

Fail → **abort dock mode**, keep `overlay` + `rail`. Then `docs/settings.md:97`'s default
(`fullscreen`) still gives the requested data through `02-ux-spec.md` §2.2. A failure here must be
reported as a finding, not worked around with a hack per Pi version.

### 6.1 Result — S0 executed 2026-11-06: **PASS** (criterion 4 partially observed)

Environment: Pi `1.5.0` (`~/.pi/agent/install/releases/1.5.0`), Node `v24.22.1`, macOS, terminal driven
through a pty of a fixed size so the frames are reproducible. Spike: `.spike/index.ts`, 79 lines,
gitignored, no git code. Capture: raw pty byte stream, replayed into a screen snapshot per phase; the
first run was cross-checked against `PI_TUI_WRITE_LOG=/tmp/pi-spike.log`, which showed the same geometry.

| # | Criterion (`§6`) | Result | Evidence in the captured frames |
|---|---|---|---|
| 1 | No transcript glyph inside the lane columns | **PASS** | 160×45: host root renders columns 0–129, lane 130–159. The lane band is an unbroken 30-column block on every row it owns; the only non-block glyphs inside it are the lane's own `#n w h` header. |
| 2 | Resize 80 → 160 keeps both lanes coherent | **PASS** | 80×30: host 0–49, lane 50–79, header `#2 w=30 h=30`. Back to 160×45: host 0–129, lane 130–159, header `#3 w=30 h=45`. Widths re-allocate on the same frame as the resize. |
| 3 | `/settings` opens and closes without dropping the lane | **PASS** | `#4` while `/settings` is open (inline list in the editor area), `#5` after `esc`; lane 130–159 in both. `/model` selector: `#7` open, `#8` closed, same geometry. |
| 4 | Switching `tuiMode` keeps the lane or falls back cleanly | **PARTIAL — see below** | The value could not be cycled from a scripted pty (see the note), so the round trip itself is **NOT_RUN**. The mechanism it exercises *was* measured: the host re-asserting its own layout root discards the wrapper, and the reconcile tick re-applies it. |

Criterion 4, measured at the call the host makes on every `tuiMode` switch
(`interactive-mode.js:610` `setLayoutRoot(this.fullscreenLayoutRoot)`, `:647` `setLayoutRoot(undefined)`):

| Phase | Transcript scrollbar column | Lane 130–159 | Lane frame |
|---|---|---|---|
| wrapped | 129 | present | `#1` |
| host re-asserted its root (+0.35 s) | 159 → transcript full width | gone | — |
| next reconcile tick (+1.2 s) | 129 | present | `#2` |

So the wrapper is genuinely fragile and the reconcile loop is genuinely required; the visual gap equals
the reconcile period, which in the product is the existing refresh tick, not a second timer.

**Why the `tuiMode` round trip is not observed here.** `/settings` lists `TUI mode` as
`fullscreen | regular`, but neither `enter` nor `space` cycled the value from a scripted pty; the list
kept showing `fullscreen`. The literal switch therefore needs a human terminal
(`docs/04-plan.md` S4 acceptance). The mechanism behind it is already covered by the table above.

### 6.2 Findings that change the design (verified, not inferred)

1. **The extension receives a stable TUI reference, not the renderer.** The widget factory is called as
   `content(this.ui, theme)`, and `this.ui` is `createInteractiveTuiReference(() => this.renderer)`, a
   `Proxy` that resolves every property against the *current* renderer and re-binds `this` per call
   (`interactive-mode.js:386`, `dist/modes/interactive/tui-renderer.js:44-77`). Consequence for
   `host/dock.ts`: the extension never has to rediscover the TUI after `switchTuiMode` — one reference
   held from the first `setWidget` keeps addressing the live renderer, including its new layout root.
   Reconciliation therefore only has to compare `getMountedRoots()[0]` with the wrapper.
2. **Wrapper loss is guaranteed, not hypothetical.** Every `mountInteractiveTui` re-asserts the host
   root, and `switchTuiMode` builds a **new** renderer object (`interactive-mode.js:638`). The wrapped
   `HStack` lives on the old one, so a mode switch drops the lane in one frame (measured above).
3. **A component is never told the height.** `render(width)` is the whole contract; the only place the
   viewport height appears is `visible(viewport)` on the stack entry, which is called during layout with
   `{width, height}` (`layout.js` `visibleStackEntries(node.entries, context.viewport)`). A lane that
   derives its height from `process.stdout.rows` is wrong twice: the value is `0` on a pty whose size was
   not set (the first spike attempt drew exactly one lane row), and it ignores the host's own row budget.
   `view/dock.ts` must size the lane from the captured viewport.
4. **A numeric `basis` avoids a second transcript render.** `layoutComponent` measures intrinsic width
   only when `entry.basis` is not a number, so a fixed-width lane costs one host render per frame
   instead of two (one to measure at full width, one at the allocated width).

Reproduction (throwaway, never committed):

```bash
# .spike/index.ts, 79 lines, answers the four criteria in §6
pi -e .spike                       # interactive: the operator's eyeball check
SPIKE_REASSERT=1 pi -e .spike      # + the host re-assert simulation used in the table above
```

The `PI_TUI_WRITE_LOG` route stays the documented one for `S4`; the captures above came from a pty
stream because the scripted run needs a *known* terminal size and a mid-session resize, and a
`PI_TUI_WRITE_LOG` frame does not carry its own dimensions.

## 7. Constraints carried into the design

1. **No absolute paths, ever.** Runtime inputs are `ctx.cwd` (project) and the agent dir
   (`PI_CODING_AGENT_DIR`, default `~/.pi/agent`, `docs/environment-variables.md:81`). Tilde display
   is computed, never stored.
2. **No `class`, no `this`.** pi-tui components are plain objects; all of ours are factory functions
   returning `{render, handleInput?, handleMouse?, invalidate}`.
3. **Writes are opt-in.** `pull`, `push`, `switch`, `switch -c` require an explicit click or key, never
   a timer, never a model request.
4. **argv only.** Every git call is `pi.exec("git", [ ...args ], {cwd})`. Branch names are validated
   with `git check-ref-format --branch` and rejected if they start with `-`.
5. **Soft failure.** Any probe, spawn or parse failure degrades one section of the dock; it never
   throws into Pi's session loop.
