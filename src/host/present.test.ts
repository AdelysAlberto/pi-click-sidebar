import assert from "node:assert/strict";
import { test } from "node:test";
import { createPresenter } from "./present.ts";
import type { PanelData } from "../view/sidebar.ts";

const theme = {
  fg: (_token: string, text: string) => text,
  bold: (text: string) => text,
  style: (text: string) => text,
} as never;

const config = {
  mode: "auto" as const,
  dockWidth: 34,
  dockMinTerminalWidth: 96,
  refreshIntervalMs: 6000,
  shortstatEveryNTicks: 3,
  showFileList: false,
  accentOverride: null,
  timeouts: { read: 3000, network: 60_000, tree: 15_000 },
};

const data: PanelData = {
  project: null,
  changes: null,
  branch: null,
  model: { id: "m", thinking: "off", contextPercent: null },
  result: null,
  running: null,
  stale: false,
  repository: "none",
};

function presenter() {
  return createPresenter({
    onCommand: () => {},
    onAction: () => {},
    onRailOpen: () => {},
    onBlur: () => {},
    config: () => config,
    getTheme: () => theme,
    forwardToEditor: () => {},
  });
}

test("a remounted rail replaces its repaint listener instead of adding one", () => {
  let renders = 0;
  let factory: ((tui: unknown, theme: unknown) => unknown) | undefined;
  const ctx = {
    ui: {
      setWidget: (_key: string, widget: unknown) => {
        if (typeof widget === "function") factory = widget as typeof factory;
      },
    },
  };
  const tui = { mode: "fullscreen", requestRender: () => (renders += 1) };
  const panel = presenter();

  // `/sidebar mode`, a new session and `refreshSurfaces` all remount the rail.
  for (let mount = 0; mount < 4; mount += 1) {
    panel.mountRail(ctx as never, () => data);
    factory?.(tui, theme);
  }
  renders = 0;
  panel.repaint();
  assert.equal(renders, 1, `one repaint must render once, not once per past mount`);
});

test("unmounting the rail leaves no listener behind", () => {
  let renders = 0;
  let factory: ((tui: unknown, theme: unknown) => unknown) | undefined;
  const ctx = {
    ui: {
      setWidget: (_key: string, widget: unknown) => {
        if (typeof widget === "function") factory = widget as typeof factory;
      },
    },
  };
  const tui = { mode: "fullscreen", requestRender: () => (renders += 1) };
  const panel = presenter();
  panel.mountRail(ctx as never, () => data);
  factory?.(tui, theme);
  panel.unmountRail(ctx as never);
  renders = 0;
  panel.repaint();
  assert.equal(renders, 0);
});
