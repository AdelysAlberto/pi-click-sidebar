import assert from "node:assert/strict";
import { test } from "node:test";
import { laneWidth, selectSurface, type SurfaceInput } from "./surface.ts";

const base: SurfaceInput = {
  configured: "auto",
  dockSupported: true,
  tuiMode: "fullscreen",
  columns: 160,
  dockMinTerminalWidth: 96,
};

test("auto prefers the dock when the host allows it and the terminal is wide", () => {
  assert.equal(selectSurface(base), "dock");
});

test("a regular-mode TUI has no layout root, so it gets the rail", () => {
  assert.equal(selectSurface({ ...base, tuiMode: "regular" }), "rail");
});

test("a failed probe falls back to the rail instead of nothing", () => {
  assert.equal(selectSurface({ ...base, dockSupported: false }), "rail");
});

test("below the width threshold the dock hides and the rail takes over", () => {
  assert.equal(selectSurface({ ...base, columns: 95 }), "rail");
  assert.equal(selectSurface({ ...base, columns: 96 }), "dock");
});

test("the configured surface wins over the probe", () => {
  assert.equal(selectSurface({ ...base, configured: "off" }), "off");
  assert.equal(selectSurface({ ...base, configured: "rail" }), "rail");
  assert.equal(selectSurface({ ...base, configured: "overlay" }), "overlay");
  assert.equal(selectSurface({ ...base, configured: "overlay", tuiMode: "regular" }), "overlay");
});

test("forcing the dock degrades to the rail rather than to nothing", () => {
  assert.equal(selectSurface({ ...base, configured: "dock", dockSupported: false }), "rail");
  assert.equal(selectSurface({ ...base, configured: "dock", columns: 80 }), "rail");
  assert.equal(selectSurface({ ...base, configured: "dock" }), "dock");
});

test("the lane never eats more than the terminal can afford", () => {
  assert.equal(laneWidth(160, 34), 34);
  assert.equal(laneWidth(40, 34), 24);
  assert.equal(laneWidth(50, 48), 26);
  assert.equal(laneWidth(20, 34), 24);
});
