import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { RAIL_SEPARATOR, fitRail, joinRail, railLine, type RailPiece } from "./rail.ts";

const plain = (text: string): string => text;

function sample(): readonly RailPiece[] {
  return [
    { id: "project", text: "acme-web", style: plain },
    { id: "path", text: "~/Projects/acme/web-app/packages/desktop", style: plain },
    { id: "branch", text: "⎇ feat/new-sidebar-with-a-long-name", style: plain },
    { id: "counts", text: "✚2 +70 −8", style: plain },
    { id: "model", text: "deepseek-v4-flash·medium", style: plain },
    { id: "hint", text: "alt+g", style: plain },
  ];
}

test("a wide terminal keeps every segment", () => {
  const kept = fitRail(sample(), 160);
  assert.equal(kept.length, sample().length);
  assert.equal(visibleWidth(joinRail(kept)), visibleWidth(joinRail(sample())));
});

test("at 80 columns the line fits and stays one line", () => {
  const kept = fitRail(sample(), 80);
  assert.ok(visibleWidth(joinRail(kept)) <= 80, `${visibleWidth(joinRail(kept))} columns`);
});

test("the project path is the first thing to disappear", () => {
  const kept = fitRail(sample(), 80);
  const hasPath = kept.some((piece) => piece.id === "path");
  const hasBranch = kept.some((piece) => piece.id === "branch");
  assert.equal(hasPath, false, "the path should go first");
  assert.equal(hasBranch, true, "the branch should still be there at 80");
});

test("a shrunk path keeps its last segment", () => {
  const kept = fitRail(
    [
      { id: "project", text: "acme", style: plain },
      { id: "path", text: "~/Projects/acme/web-app/packages/desktop", style: plain },
      { id: "model", text: "m", style: plain },
    ],
    40,
  );
  const path = kept.find((piece) => piece.id === "path");
  assert.ok(path !== undefined);
  assert.ok(path.text.endsWith("desktop"), path.text);
  assert.ok(visibleWidth(path.text) <= 12, path.text);
});

test("a narrow terminal drops the branch too, never the counts", () => {
  const kept = fitRail(sample(), 30);
  const ids = kept.map((piece) => piece.id);
  assert.equal(ids.includes("branch"), false);
  assert.equal(ids.includes("counts"), true);
  assert.ok(visibleWidth(joinRail(kept)) <= 30);
});

test("no width produces a line wider than the terminal", () => {
  for (let width = 1; width <= 200; width += 1) {
    const line = railLine(sample(), width);
    assert.ok(visibleWidth(line) <= Math.max(width, 1), `width ${width} produced ${visibleWidth(line)}`);
  }
});

test("the rail line is what the widget draws", () => {
  assert.equal(railLine(sample(), 200), joinRail(sample()));
  assert.ok(visibleWidth(railLine(sample(), 80)) <= 80);
});

test("segments are separated by two columns", () => {
  assert.equal(
    joinRail([
      { id: "project", text: "a", style: plain },
      { id: "hint", text: "b", style: plain },
    ]),
    `a${RAIL_SEPARATOR}b`,
  );
});
