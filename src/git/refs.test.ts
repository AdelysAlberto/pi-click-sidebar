import assert from "node:assert/strict";
import { test } from "node:test";
import { rejectOptionLike } from "./refs.ts";

test("a name that could be read as an option never reaches git", () => {
  const result = rejectOptionLike("-x");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid-ref");
  assert.equal(rejectOptionLike("--force").ok, false);
});

test("an empty or padded name is rejected before any process runs", () => {
  assert.equal(rejectOptionLike("").ok, false);
  assert.equal(rejectOptionLike(" feat/x").ok, false);
  assert.equal(rejectOptionLike("feat/x ").ok, false);
});

test("ordinary branch names pass the guard", () => {
  for (const name of ["main", "feat/click-sidebar", "fix/argv-only", "release-0.1.0", "a/b/c"]) {
    assert.equal(rejectOptionLike(name).ok, true, name);
  }
});
