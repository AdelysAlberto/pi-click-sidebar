import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFailure, refUpdate } from "./actions.ts";

test("a diverged pull is reported as diverged, never as a merge", () => {
  const error = classifyFailure("fatal: Not possible to fast-forward, aborting.\n", "pull");
  assert.equal(error.code, "diverged");
  assert.equal(error.message, "diverged, fast-forward not possible");
});

test("a non-fast-forward push is a refusal, not a divergence", () => {
  const error = classifyFailure("! [rejected]        main -> main (non-fast-forward)", "push");
  assert.equal(error.code, "rejected");
  assert.equal(error.message, "rejected by the remote");
});

test("the verdict depends on the verb, not on a shared phrase", () => {
  // git's own wording: pull refuses with "Not possible to fast-forward",
  // push with "[rejected] ... (non-fast-forward)".
  assert.equal(classifyFailure("fatal: Not possible to fast-forward, aborting.", "pull").code, "diverged");
  assert.equal(classifyFailure("! [rejected] main -> main (non-fast-forward)", "push").code, "rejected");
});

test("a protected branch rejection keeps its own code", () => {
  const error = classifyFailure("remote: error: GH006: Protected branch update failed\n ! [remote rejected] main -> main");
  assert.equal(error.code, "rejected");
  assert.equal(error.message, "rejected by the remote");
});

test("a missing credential is named as such, not as a generic failure", () => {
  const error = classifyFailure("fatal: could not read Username for 'https://github.com': terminal prompts disabled");
  assert.equal(error.code, "rejected");
  assert.equal(error.message, "no credentials for this remote");
});

test("a missing upstream is named", () => {
  const error = classifyFailure("fatal: The current branch feat/x has no upstream branch.");
  assert.equal(error.code, "rejected");
  assert.equal(error.message, "no upstream branch configured");
});

test("anything else keeps git's first line as the detail", () => {
  const error = classifyFailure("\nfatal: something odd happened\nsecond line");
  assert.equal(error.code, "unknown");
  assert.equal(error.detail, "fatal: something odd happened");
});

test("an empty stderr still produces a sentence", () => {
  const error = classifyFailure("");
  assert.equal(error.code, "unknown");
  assert.equal(error.message, "git refused the command");
  assert.equal(error.detail, undefined);
});

test("the fetch detail is the ref range, not localised prose", () => {
  assert.equal(refUpdate("Desde /tmp/origin.git\n   a0e33d7..831dda7  main -> origin/main\n"), "main → origin/main");
  assert.equal(refUpdate("From github.com:x/y\n + 1111111...2222222 feat -> origin/feat (forced update)"), "feat → origin/feat");
  assert.equal(refUpdate(""), null);
});

test("a localised fetch with no ref update reports up to date instead of Spanish prose", () => {
  assert.equal(refUpdate("Desde /tmp/s5b/origin.git\n"), null);
});
