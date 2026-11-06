import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { padToWidth, wrapToWidth } from "./text.ts";

test("text that fits is one line, unchanged", () => {
  assert.deepEqual(wrapToWidth("✓ fetch · origin/main", 30), ["✓ fetch · origin/main"]);
});

test("a long line wraps on spaces and never inside a word", () => {
  const lines = wrapToWidth("✗ pull · no upstream branch configured for pull", 24);
  assert.ok(lines.length > 1, lines.join(" | "));
  for (const line of lines) assert.ok(visibleWidth(line) <= 24, line);
  assert.equal(lines.join(" "), "✗ pull · no upstream branch configured for pull");
});

test("a word wider than the column is split, never dropped", () => {
  const word = "a".repeat(25);
  const lines = wrapToWidth(`reason ${word}`, 10);
  for (const line of lines) assert.ok(visibleWidth(line) <= 10, line);
  assert.equal(lines.join("").replace(/ /g, ""), `reason${word}`);
});

test("no width produces a line wider than the column", () => {
  const text = "✗ push · remote rejected the update: non-fast-forward and hook declined";
  for (let width = 1; width <= 60; width += 1) {
    for (const line of wrapToWidth(text, width)) {
      assert.ok(visibleWidth(line) <= width, `width ${width} produced ${visibleWidth(line)}`);
    }
  }
});

test("no column means no line", () => {
  assert.deepEqual(wrapToWidth("anything", 0), []);
});

test("padding is still exact after wrapping", () => {
  for (const line of wrapToWidth("✗ pull · no upstream branch configured", 18)) {
    assert.equal(visibleWidth(padToWidth(line, 18)), 18);
  }
});
