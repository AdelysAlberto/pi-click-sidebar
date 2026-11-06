import assert from "node:assert/strict";
import { test } from "node:test";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import type { HitAction } from "./hits.ts";
import { createSidebar, type PanelData } from "./sidebar.ts";

/** Tokens are the only thing a render needs from a theme, and text comes back unstyled. */
const theme = {
  fg: (_token: string, text: string) => text,
  bold: (text: string) => text,
  style: (text: string) => text,
} as never;

const data: PanelData = {
  project: { name: "acme-web", path: "/tmp/acme/web" },
  changes: { files: 2, insertions: 12, deletions: 3, untracked: 1, deleted: 0 },
  branch: { name: "main", detached: false, upstream: "origin/main", ahead: 0, behind: 1, operation: null },
  model: { id: "deepseek-v4-flash", thinking: "medium", contextPercent: 22 },
  result: null,
  running: null,
  stale: false,
  repository: "ok",
};

function mount(actions: HitAction[]) {
  const panel = createSidebar({
    read: () => data,
    theme,
    header: null,
    requestRender: () => {},
    onClose: () => {},
    onCommand: () => {},
    onAction: (action) => actions.push(action),
  });
  const rows = panel.render(40);
  /** Dispatches a mouse event the way the host does, in panel coordinates. */
  const send = (type: TuiMouseEvent["type"], x: number, y: number) =>
    panel.handleMouse?.({ type, x, y, ...frameOf(rows) });
  /** Column and row of a piece of text the panel drew, in panel coordinates. */
  const where = (text: string): { readonly x: number; readonly y: number } => {
    const y = rows.findIndex((line) => line.includes(text));
    assert.ok(y >= 0, `the panel does not draw ${text}`);
    const x = (rows[y] ?? "").indexOf(text);
    assert.ok(x > 0, `${text} sits in the frame, not in a click region`);
    return { x, y };
  };
  return { send, where };
}

/** Everything about a real left click that is not its coordinates. */
function frameOf(rows: readonly string[]) {
  return {
    button: "left" as const,
    screenX: 200,
    screenY: 40,
    width: 40,
    height: rows.length,
    shift: false,
    alt: false,
    ctrl: false,
  };
}

test("one physical click runs the verb once", () => {
  const actions: HitAction[] = [];
  const { send, where } = mount(actions);
  const { x, y } = where("f fetch");
  // The host dispatches press, then a synthesised click for the same gesture.
  // Answering both started the verb and then refused the copy as "still running".
  assert.equal(send("press", x, y) === undefined, true);
  assert.equal(send("click", x, y) !== undefined, true);
  assert.deepEqual(actions, [{ kind: "verb", verb: "fetch" }]);
});

test("the press alone is not an action", () => {
  const actions: HitAction[] = [];
  const { send, where } = mount(actions);
  const { x, y } = where("p pull");
  assert.equal(send("press", x, y) === undefined, true);
  assert.equal(actions.length, 0);
});

test("the second verb of the row is its own target", () => {
  const actions: HitAction[] = [];
  const { send, where } = mount(actions);
  const pull = where("p pull");
  send("click", pull.x, pull.y);
  assert.deepEqual(actions, [{ kind: "verb", verb: "pull" }]);
});

test("a click on the frame hits nothing", () => {
  const actions: HitAction[] = [];
  const { send, where } = mount(actions);
  const { y } = where("f fetch");
  assert.equal(send("click", 0, y) === undefined, true, "the frame is not clickable");
  assert.equal(actions.length, 0);
});

test("git's own refusal reason wraps instead of ending in an ellipsis", () => {
  const actions: HitAction[] = [];
  const failing: PanelData = {
    ...data,
    result: { kind: "fail", line: "✗ pull · no upstream branch configured for pull" },
  };
  const panel = createSidebar({
    read: () => failing,
    theme,
    header: null,
    requestRender: () => {},
    onClose: () => {},
    onCommand: () => {},
    onAction: (action) => actions.push(action),
  });
  const rows = panel.render(34);
  assert.equal(rows.join("\n").includes("…"), false, "nothing is clipped");
  assert.ok(rows.join("\n").includes("configured for pull"), "the reason survives whole");
  // The frame stays a frame: one top row, one bottom row, same inner width.
  assert.equal(rows.length > 6, true);
  assert.equal(rows[rows.length - 1]?.startsWith("╰"), true);
});
