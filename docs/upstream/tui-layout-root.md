---
title: "Upstream proposal — document the TUI layout root"
module: "pi-click-sidebar / Pi docs/tui.md"
author: "pi (architecture)"
date: 2026-11-06
status: Pending
priority: P2
scope: "[Backlog]"
source: "docs/01-feasibility.md §6"
---

# Upstream proposal: document the TUI layout root

## Why

`pi-click-sidebar` puts a lane beside the transcript instead of over it. It can, because `TuiAltScreen`
renders a **layout root** rather than its children:

```text
pi-tui/dist/tui-alt-screen.js:143   setLayoutRoot(component)
pi-tui/dist/tui-alt-screen.js:150   render(width) => this.layoutRoot?.render(width) ?? super.render(width)
pi-tui/dist/tui-alt-screen.js:153   getMountedRoots() => this.layoutRoot ? [this.layoutRoot] : this.children
```

`getMountedRoots()` is declared `protected` (`pi-tui/dist/tui.d.ts:324`) and `layoutRoot` is `private`
(`tui-alt-screen.d.ts:44`), so a reader of `docs/tui.md` has no way to learn that the frame is a single
component they could wrap, or that wrapping it makes the transcript reflow. The document lists `HStack` and
`VStack` under "Compose built-in components" and says extensions receive a `TUI`, but stops there. Two
consequences follow, both observed in this repository's spike:

1. Extensions that need a persistent second column either rebuild the footer (264 lines of usage logic) or
   paint an overlay over the conversation. Both are worse than wrapping the root.
2. Whoever wraps it must discover, by reading the source, that the host re-asserts its own root on mount
   (`interactive-mode.js:610`) and on every `tuiMode` switch (`:647`, `:638`), which silently discards the
   wrapper. Reconciliation is mandatory and is nowhere written down.

## Proposal

Add a section to `docs/tui.md`, after "Compose built-in components":

> ### Wrap the layout root
>
> In `fullscreen` mode the frame is rendered from a single layout root. An extension can replace it with a
> stack that contains it, and the transcript reflows into the space that is left:
>
> ```ts
> import { HStack } from "@earendil-works/pi-tui";
>
> const roots = tui.getMountedRoots();      // [layoutRoot], or children in regular mode
> const hostRoot = roots[0];
> if (hostRoot === undefined) return;       // regular mode has no layout root
>
> tui.setLayoutRoot(
>   new HStack([
>     { component: hostRoot, grow: 1, shrink: 1, minSize: 24 },
>     { component: lane, basis: 34, shrink: 0, visible: (v) => v.width >= 96 },
>   ]),
> );
> ```
>
> - `setLayoutRoot(component)` replaces what the frame renders; `setLayoutRoot(undefined)` restores the
>   host's own root. Call it on `session_shutdown` if you wrapped it.
> - The host re-asserts its own root when it mounts and whenever `tuiMode` changes, discarding your
>   wrapper: re-check `tui.getMountedRoots()[0] === yourStack` on your next tick and wrap again. Expect a
>   one-frame gap while you do.
> - `mode` says which TUI you have: `fullscreen` has a layout root, `regular` does not, and mouse input
>   belongs to the terminal there.
> - A stack entry's `visible(viewport)` receives the frame's `{ width, height }`. A component is never told
>   the height, so this is where a full-height lane gets it.

## What it costs Pi

One section of `docs/tui.md` and, ideally, making `getMountedRoots()` public: the only thing an extension
needs that is currently `protected`. Everything in the mechanism already exists and is already used by the
host itself.

## Status

Filed here, not applied to the installed tree: this repository never edits `node_modules`. Tracked as a
proposal until Pi documents the integration point or changes it; `docs/01-feasibility.md` §6.2 records the
version this was measured against (1.5.0).
