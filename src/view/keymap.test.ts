import assert from "node:assert/strict";
import { test } from "node:test";
import { TOGGLE_SHORTCUT, keyMapLines, resolvePanelCommand } from "./keymap.ts";

const UP = "\u001b[A";
const DOWN = "\u001b[B";
const ESCAPE = "\u001b";

test("escape and enter are the panel's own", () => {
  assert.equal(resolvePanelCommand(ESCAPE), "close");
  assert.equal(resolvePanelCommand("\r"), "run");
});

test("movement accepts both arrows and the vi keys", () => {
  assert.equal(resolvePanelCommand(UP), "cursor-up");
  assert.equal(resolvePanelCommand("k"), "cursor-up");
  assert.equal(resolvePanelCommand(DOWN), "cursor-down");
  assert.equal(resolvePanelCommand("j"), "cursor-down");
});

test("every documented verb has its key", () => {
  const expected: readonly (readonly [string, string])[] = [
    ["f", "fetch"],
    ["p", "pull"],
    ["u", "push"],
    ["s", "switch"],
    ["n", "new"],
    ["r", "refresh"],
    ["d", "toggle-files"],
    ["?", "help"],
  ];
  for (const [key, command] of expected) {
    assert.equal(resolvePanelCommand(key), command, key);
  }
});

test("anything else belongs to somebody else", () => {
  for (const input of ["x", "a", "1", "ctrl+c".length > 0 ? "\u0003" : "", "\u001b[Z"]) {
    assert.equal(resolvePanelCommand(input), null, JSON.stringify(input));
  }
});

test("the help block names the keys it can resolve", () => {
  const help = keyMapLines().join(" ");
  for (const token of ["f", "p", "u", "s", "n", "r", "d", "esc", "?"]) {
    assert.ok(help.includes(token), token);
  }
});

test("the global toggle is alt+g", () => {
  assert.equal(TOGGLE_SHORTCUT, "alt+g");
});
