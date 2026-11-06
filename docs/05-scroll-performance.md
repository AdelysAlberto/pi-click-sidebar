---
title: "Pi Click Sidebar 05 — Scroll regression and width cache thrashing"
module: "pi-click-sidebar host layout"
author: "pi"
date: 2026-11-06
status: Manual
priority: P1
scope: "[MVP]"
source: "User report of slow transcript scrolling in a long Pi session"
---

# Scroll regression

## Verified cause

The dock wraps Pi's fullscreen root in an `HStack`. Before this fix, the transcript entry had no
numeric `basis`. On each frame, Pi 1.5.0's `dist/layout.js` measured its intrinsic width by calling
`hostRoot.render(terminalWidth)`, then measured height and laid it out at `terminalWidth - dockWidth`.
At 160 columns with a 34-column lane, the document received widths **160, 126, 126** on every frame.

Pi's Markdown component caches rendered lines for one width (`dist/components/markdown.js`,
`cachedWidth`). The repeated width changes evicted that cache even when only the scroll position
changed. This adds history-dependent work on the interactive path. The report's context percentage
is not itself a measure of rendered history or proof of the cause in that particular terminal.

## Fix and regression checks

- `src/host/dock.ts`: `basis: 0` on the host entry, with `grow: 1`. Remaining width is assigned
  without rendering the whole host at full width. No host code or dependencies changed.
- `src/host/dock-performance.test.ts`: use Pi's real `renderLayoutFrame`, `VStack` and `ScrollView`.
  Assert only the allocated transcript width is used during scrolling, after resize and after root
  reconciliation; preserve scrolling, the primary scroll view, editor placement and lane placement.
- `src/host/present.ts`: non-dock modes restore the host root. Previously `/sidebar mode off`, `rail`
  and `overlay` still mounted the dock wrapper, invalidating an on/off diagnostic comparison.
  `src/host/present.test.ts` covers restoration and switching back to auto.

The three new tests failed before the fix and passed after it. Timing is not a test assertion:
width invariants are deterministic, whereas a millisecond threshold would depend on the machine.

## Reproducible benchmark

```bash
node scripts/bench-dock.ts
```

Node v24.22.1, local pi-tui 1.5.0, viewport 160×45, 34-column lane, eight scrolling frames after
one warm-up frame. Generated text uses the real Pi Markdown renderer; no terminal writes, git IO,
model requests or private session contents. The benchmark compares the native root, a reproduction
of the old wrapper and the actual `mountDock` implementation.

Observed in this investigation:

| Paragraphs | Native ms/frame | Old dock ms/frame | Fixed dock ms/frame | Old/fixed Markdown rebuilds |
|---|---|---|---|---|
| 200 | 0.04 | 1.42 | 0.48 | 16 / 0 |
| 1,000 | 0.01 | 3.59 | 0.35 | 16 / 0 |

A separate initial synthetic single-width-cache fixture with 20,000 lines measured 8.76 → 0.34
ms/frame. That fixture was diagnostic, not a claim about the operator's real session or terminal FPS.
The checked-in benchmark above uses actual Markdown rather than that simplified cache.

The fixed path still invokes the document at the allocated width twice per frame: once to measure
height and once during layout traversal. Pi's cache can now serve both calls. Side-by-side compositing
also loses Pi's full-width paint fast path, so the dock is not free and these results do not establish
performance parity with native Pi.

## Live validation not yet established

This investigation measured layout and Markdown, not the operator's Herdr tab, terminal output latency,
or their approximately 300k-token session. No live acceptance criterion is claimed from unit tests.

Load this working copy with `pi -e .` and resume a long session. Compare the same history region with
`/sidebar mode auto` and `/sidebar mode off`; repeat after 160 → 80 → 160 resizing. Confirm smooth
scrolling, correct selection, editor focus and exactly one lane when re-enabled. The mode comparison
must use this fix because older code did not actually detach the dock for non-dock modes.
