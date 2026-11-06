import assert from "node:assert/strict";
import { test } from "node:test";
import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { mountDock, probeDockSupport } from "./dock.ts";

/** The contract `tui-alt-screen.js` exposes, with none of the terminal. */
function fakeViewportTui() {
  let root: Component | undefined;
  const hostRoot: Component = { render: (width) => [`host:${width}`], invalidate: () => {} };
  const tui = {
    mode: "fullscreen" as string,
    setLayoutRoot(component: Component | undefined): void {
      root = component;
    },
    getMountedRoots(): readonly Component[] {
      return root === undefined ? [hostRoot] : [root];
    },
  };
  return { tui, hostRoot };
}

const lane: Component = { render: (width) => [`lane:${width}`], invalidate: () => {} };

function frameOf(tui: { getMountedRoots(): readonly Component[] }, width: number): string {
  const root = tui.getMountedRoots()[0];
  assert.ok(root !== undefined);
  return root.render(width).join("\n");
}

test("a regular-mode TUI has no layout root and fails the probe", () => {
  const { tui } = fakeViewportTui();
  tui.mode = "regular";
  assert.equal(probeDockSupport(tui).supported, false);
  assert.equal(mountDock(tui, { laneWidth: 34, minTerminalWidth: 96, lane }), null);
});

test("mounting puts the lane last, at the configured width", () => {
  const { tui } = fakeViewportTui();
  const handle = mountDock(tui, { laneWidth: 34, minTerminalWidth: 96, lane });
  assert.ok(handle !== null);
  const frame = frameOf(tui, 160);
  assert.match(frame, /host:126/);
  assert.match(frame, /lane:34/);
  assert.equal(visibleWidth(frame), 160);
});

test("reconcile re-wraps after the host re-asserts its own root, without doubling the lane", () => {
  const { tui, hostRoot } = fakeViewportTui();
  const handle = mountDock(tui, { laneWidth: 34, minTerminalWidth: 96, lane });
  assert.ok(handle !== null);

  // What mountInteractiveTui and switchTuiMode do: the host puts its root back.
  tui.setLayoutRoot(hostRoot);
  assert.equal(handle.isMounted(), false);
  assert.equal(handle.reconcile(), true);
  assert.equal(handle.isMounted(), true);

  const frame = frameOf(tui, 160);
  assert.equal(frame.split("lane:").length - 1, 1, "exactly one lane");
  assert.equal(frame.split("host:").length - 1, 1, "exactly one host root");
});

test("restore puts the host root back and is safe twice", () => {
  const { tui, hostRoot } = fakeViewportTui();
  const handle = mountDock(tui, { laneWidth: 34, minTerminalWidth: 96, lane });
  assert.ok(handle !== null);
  handle.restore();
  assert.deepEqual(tui.getMountedRoots(), [hostRoot]);
  handle.restore();
  assert.deepEqual(tui.getMountedRoots(), [hostRoot]);
});
