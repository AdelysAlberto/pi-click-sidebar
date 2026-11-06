import assert from "node:assert/strict";
import { test } from "node:test";
import { hitTest, region, type HitMap } from "./hits.ts";

function map(): HitMap {
  return {
    width: 36,
    regions: [
      region(8, 2, "CHANGES", { kind: "changes" }),
      region(12, 2, "f fetch", { kind: "verb", verb: "fetch" }),
      region(12, 12, "p pull", { kind: "verb", verb: "pull" }),
      region(11, 2, "main", { kind: "branch" }),
    ],
  };
}

test("a click inside a region reports its action", () => {
  assert.deepEqual(hitTest(map(), 4, 8), { kind: "changes" });
  assert.deepEqual(hitTest(map(), 2, 12), { kind: "verb", verb: "fetch" });
  assert.deepEqual(hitTest(map(), 14, 12), { kind: "verb", verb: "pull" });
  assert.deepEqual(hitTest(map(), 3, 11), { kind: "branch" });
});

test("the region includes its last column and excludes the one after", () => {
  // "f fetch" starts at 2 and is 7 wide: 2..8.
  assert.deepEqual(hitTest(map(), 8, 12), { kind: "verb", verb: "fetch" });
  assert.equal(hitTest(map(), 9, 12), null);
});

test("the wrong row or a column outside the panel is not a hit", () => {
  assert.equal(hitTest(map(), 4, 9), null, "row without regions");
  assert.equal(hitTest(map(), -1, 8), null, "negative column");
  assert.equal(hitTest(map(), 40, 8), null, "past the panel width");
});

test("borders and padding are not clickable", () => {
  // Column 0 and 1 are the frame and its padding: a click there hits nothing.
  assert.equal(hitTest(map(), 0, 8), null);
  assert.equal(hitTest(map(), 1, 8), null);
});

test("hit testing follows the last render, so a resize cannot leave stale targets", () => {
  const wide = map();
  const narrow: HitMap = {
    width: 28,
    regions: [region(6, 2, "CHANGES", { kind: "changes" })],
  };
  assert.deepEqual(hitTest(narrow, 4, 6), { kind: "changes" });
  assert.equal(hitTest(narrow, 4, 8), null, "the row from the wider layout is gone");
  assert.deepEqual(hitTest(wide, 4, 8), { kind: "changes" });
});
