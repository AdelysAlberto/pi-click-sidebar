import assert from "node:assert/strict";
import { test } from "node:test";
import type { Snapshot } from "../git/snapshot.ts";
import { parseStatus } from "../git/status.ts";
import { buildPanelData, type SessionInfo } from "./model.ts";
import { formatCount } from "./text.ts";

const NUL = "\u0000";

function raw(records: readonly string[]): string {
  return records.map((record) => `${record}${NUL}`).join("");
}

const OID = "b".repeat(40);

const session: SessionInfo = { cwd: "/repo", modelId: "ds-v4", thinking: "medium", contextPercent: 38 };

function snapshot(statusRecords: readonly string[], shortstat: Snapshot["shortstat"] = null): Snapshot {
  return {
    toplevel: "/repo",
    status: parseStatus(raw(statusRecords)),
    operation: null,
    shortstat,
  };
}

test("a dirty repository fills every section", () => {
  const data = buildPanelData({
    snapshot: snapshot(
      [
        `# branch.oid ${OID}`,
        "# branch.head feat/sidebar",
        "# branch.upstream origin/feat/sidebar",
        "# branch.ab +1 -3",
        "1 .M N... 100644 100644 100644 aaa bbb src/a.ts",
        "1 .D N... 100644 100644 100644 aaa bbb src/b.ts",
        "? src/c.ts",
        "? src/d.ts",
      ],
      { insertions: 70, deletions: 8, files: 2 },
    ),
    error: null,
    session,
    stale: false,
  });

  assert.equal(data.repository, "ok");
  assert.deepEqual(data.project, { name: "repo", path: "/repo" });
  assert.deepEqual(data.changes, { files: 2, insertions: 70, deletions: 8, untracked: 2, deleted: 1 });
  assert.equal(data.branch?.name, "feat/sidebar");
  assert.equal(data.branch?.upstream, "origin/feat/sidebar");
  assert.equal(data.branch?.ahead, 1);
  assert.equal(data.branch?.behind, 3);
  assert.deepEqual(data.model, { id: "ds-v4", thinking: "medium", contextPercent: 38 });
});

test("a repository without commits shows zero deltas and still renders", () => {
  const data = buildPanelData({
    snapshot: snapshot(["# branch.oid (initial)", "# branch.head main"], { insertions: 0, deletions: 0, files: 0 }),
    error: null,
    session,
    stale: false,
  });
  assert.equal(data.changes?.insertions, 0);
  assert.equal(data.changes?.deletions, 0);
  assert.equal(data.branch?.name, "main");
});

test("a detached head is named by its short oid", () => {
  const data = buildPanelData({
    snapshot: snapshot([`# branch.oid ${OID}`, "# branch.head (detached)"]),
    error: null,
    session,
    stale: false,
  });
  assert.equal(data.branch?.detached, true);
  assert.equal(data.branch?.name, "bbbbbbb");
});

test("a worktree below the repository root reports the root, not the cwd", () => {
  const data = buildPanelData({
    snapshot: { toplevel: "/repo/packages/app", status: parseStatus(""), operation: null, shortstat: null },
    error: null,
    session: { ...session, cwd: "/repo/packages/app/src" },
    stale: false,
  });
  assert.deepEqual(data.project, { name: "app", path: "/repo/packages/app" });
});

test("not being a repository still shows the project and nothing else", () => {
  const data = buildPanelData({
    snapshot: null,
    error: { code: "not-a-repo", message: "not a git repository" },
    session: { ...session, cwd: "/tmp/plain" },
    stale: false,
  });
  assert.equal(data.repository, "none");
  assert.equal(data.changes, null);
  assert.equal(data.branch, null);
  assert.deepEqual(data.project, { name: "plain", path: "/tmp/plain" });
});

test("git missing from PATH is its own state", () => {
  const data = buildPanelData({
    snapshot: null,
    error: { code: "git-missing", message: "git not found in PATH" },
    session,
    stale: false,
  });
  assert.equal(data.repository, "git-missing");
});

test("the stale flag reaches the panel untouched", () => {
  const data = buildPanelData({ snapshot: snapshot([]), error: null, session, stale: true });
  assert.equal(data.stale, true);
});

test("counts keep at most three significant digits", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(7), "7");
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1000), "1k");
  assert.equal(formatCount(12_400), "12.4k");
  assert.equal(formatCount(1_200_000), "1.2M");
  assert.equal(formatCount(Number.NaN), "0");
});
