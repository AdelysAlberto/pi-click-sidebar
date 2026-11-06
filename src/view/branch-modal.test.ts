import assert from "node:assert/strict";
import { test } from "node:test";
import { planSubmit } from "./branch-modal.ts";

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
