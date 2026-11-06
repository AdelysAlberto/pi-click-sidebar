import assert from "node:assert/strict";
import { test } from "node:test";
import { createBranchModal, planSubmit } from "./branch-modal.ts";

const clean = { base: "main", name: "", dirtyFiles: 0 };

test("an empty name switches to the selected base", () => {
  assert.deepEqual(planSubmit(clean), { kind: "switch", base: "main" });
});

test("a name creates from the selected base", () => {
  assert.deepEqual(planSubmit({ ...clean, name: "feat/x" }), { kind: "create", base: "main", name: "feat/x" });
});

test("a dirty tree disables the submit and names the count", () => {
  const one = planSubmit({ ...clean, dirtyFiles: 1 });
  assert.equal(one.kind, "blocked");
  if (one.kind === "blocked") assert.match(one.reason, /^1 uncommitted file · commit or discard first$/);
  const many = planSubmit({ ...clean, dirtyFiles: 3 });
  if (many.kind === "blocked") assert.match(many.reason, /^3 uncommitted files/);
});

test("invalid names are refused with the exact reason, before any process", () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    ["-x", /cannot start with -/],
    ["a b", /no spaces/],
    ["foo..bar", /cannot contain \.\./],
    ["a//b", /cannot contain \/\//],
    ["/start", /leading or trailing \//],
    ["end/", /leading or trailing \//],
    ["x.lock", /cannot end with \.lock/],
    ["a~b", /no spaces or ~ \^ : \? \* \[ \\/],
    [" feat", /no leading or trailing spaces/],
  ];
  for (const [name, reason] of cases) {
    const plan = planSubmit({ ...clean, name });
    assert.equal(plan.kind, "blocked", name);
    if (plan.kind === "blocked") assert.match(plan.reason, reason, name);
  }
});

test("nothing happens without a base", () => {
  const plan = planSubmit({ base: null, name: "", dirtyFiles: 0 });
  assert.equal(plan.kind, "blocked");
});

test("ordinary names pass the client-side gate", () => {
  for (const name of ["feat/sidebar", "fix/argv-only", "release-0.1.0", "a/b/c", "probe_base"]) {
    assert.equal(planSubmit({ ...clean, name }).kind, "create", name);
  }
});

test("one physical click on switch submits once", () => {
  const theme = { fg: (_token: string, text: string) => text, bold: (text: string) => text } as never;
  const plans: unknown[] = [];
  const modal = createBranchModal({
    theme,
    branches: [
      { name: "main", committedAt: 1 },
      { name: "feat/x", committedAt: 2 },
    ],
    current: "main",
    dirtyFiles: 0,
    intent: "switch",
    onSubmit: async (plan) => {
      plans.push(plan);
      return null;
    },
    onClose: () => {},
    requestRender: () => {},
  });
  const rows = modal.render(44);
  const y = rows.findIndex((line) => line.includes("switch") && line.includes("cancel"));
  assert.ok(y >= 0, "the button row is drawn");
  const x = (rows[y] ?? "").indexOf("switch") + 1;
  const event = {
    button: "left" as const,
    x,
    y,
    screenX: 60,
    screenY: 8,
    width: 44,
    height: rows.length,
    shift: false,
    alt: false,
    ctrl: false,
  };
  // press then click: the host dispatches both for one gesture.
  assert.equal(modal.handleMouse?.({ ...event, type: "press" }) === undefined, true);
  assert.equal(modal.handleMouse?.({ ...event, type: "click" }) !== undefined, true);
  assert.equal(plans.length, 1);
});
