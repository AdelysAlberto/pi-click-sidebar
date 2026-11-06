import assert from "node:assert/strict";
import { test } from "node:test";
import * as copy from "./copy.ts";

/** Every exported string value, so the deck can be checked as a whole. */
function deck(): readonly (readonly [string, string])[] {
  const entries: (readonly [string, string])[] = [];
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === "string") entries.push([key, value]);
  }
  return entries;
}

test("no user-visible string carries a newline or a tab", () => {
  for (const [key, value] of deck()) {
    assert.equal(/[\n\t]/.test(value), false, `${key} contains a control character`);
  }
});

test("the section labels are the copy deck's", () => {
  assert.equal(copy.SECTION_PROJECT, "PROJECT");
  assert.equal(copy.SECTION_CHANGES, "CHANGES");
  assert.equal(copy.SECTION_BRANCH, "BRANCH");
  assert.equal(copy.SECTION_MODEL, "MODEL");
});

test("counts agree with their noun", () => {
  assert.equal(copy.fileCount(0), "0 files");
  assert.equal(copy.fileCount(1), "1 file");
  assert.equal(copy.fileCount(2), "2 files");
});

test("numbers carry a glyph as well as a colour", () => {
  assert.equal(copy.insertions(70), "+70");
  assert.equal(copy.deletions(8), "−8");
  assert.equal(copy.untracked(2), "✚2");
  assert.equal(copy.deleted(0), "✖0");
  assert.equal(copy.insertions(12_400), "+12.4k");
});

test("result lines use the documented shape", () => {
  assert.equal(copy.progress("fetch", "3.2"), "⏵ fetch… 3.2s");
  assert.equal(copy.success("pull", "up to date", "0.8"), "✓ pull · up to date · 0.8s");
  assert.equal(copy.failureLine("pull", copy.DIVERGED), "✗ pull · diverged, fast-forward not possible");
  assert.equal(copy.timeoutLine(60), "timed out after 60s");
});

test("every action has a key and a verb", () => {
  assert.deepEqual(
    copy.ACTIONS.map((action) => action.key),
    ["f", "p", "u", "s", "n", "r"],
  );
  for (const action of copy.ACTIONS) {
    assert.match(action.verb, /^[a-z]+$/);
  }
});

test("context usage has a value even before the first response", () => {
  assert.equal(copy.contextPercent(null), "ctx —");
  assert.equal(copy.contextPercent(38.4), "ctx 38%");
});
