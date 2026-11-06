import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShortstat, parseStatus, totalsOf } from "./status.ts";

const NUL = "\u0000";

/** Porcelain v2 with -z is NUL-terminated, one record per field group. */
function raw(records: readonly string[]): string {
  return records.map((record) => `${record}${NUL}`).join("");
}

const OID = "a".repeat(40);

test("a clean repository with an upstream reports branch, oid and divergence", () => {
  const status = parseStatus(
    raw([`# branch.oid ${OID}`, "# branch.head main", "# branch.upstream origin/main", "# branch.ab +1 -2"]),
  );
  assert.equal(status.oid, OID);
  assert.equal(status.branch, "main");
  assert.equal(status.detached, false);
  assert.equal(status.upstream, "origin/main");
  assert.equal(status.ahead, 1);
  assert.equal(status.behind, 2);
  assert.deepEqual(status.files, []);
});

test("a repository without commits has no oid", () => {
  const status = parseStatus(raw(["# branch.oid (initial)", "# branch.head main"]));
  assert.equal(status.oid, null);
  assert.equal(status.branch, "main");
});

test("a detached head has no branch", () => {
  const status = parseStatus(raw([`# branch.oid ${OID}`, "# branch.head (detached)"]));
  assert.equal(status.detached, true);
  assert.equal(status.branch, null);
});

test("no upstream header means no upstream and no divergence", () => {
  const status = parseStatus(raw([`# branch.oid ${OID}`, "# branch.head feat/x"]));
  assert.equal(status.upstream, null);
  assert.equal(status.ahead, 0);
  assert.equal(status.behind, 0);
});

test("modified, staged-only and untracked entries are told apart", () => {
  const status = parseStatus(
    raw([
      "# branch.head main",
      "1 .M N... 100644 100644 100644 aaa bbb src/worktree.ts",
      "1 M. N... 100644 100644 100644 aaa bbb src/staged.ts",
      "? src/untracked.ts",
    ]),
  );
  assert.equal(status.files.length, 3);
  assert.deepEqual(
    status.files.map((file) => [file.path, file.kind, file.staged, file.unstaged]),
    [
      ["src/worktree.ts", "modified", false, true],
      ["src/staged.ts", "modified", true, false],
      ["src/untracked.ts", "untracked", false, true],
    ],
  );
});

test("added, deleted and typechange entries map to their kind", () => {
  const status = parseStatus(
    raw([
      "1 A. N... 100644 100644 100644 aaa bbb added.ts",
      "1 .D N... 100644 100644 100644 aaa bbb deleted.ts",
      "1 .T N... 100644 100644 100644 aaa bbb typechange.ts",
    ]),
  );
  assert.deepEqual(
    status.files.map((file) => file.kind),
    ["added", "deleted", "typechange"],
  );
});

test("a rename consumes the following record as its original path", () => {
  const status = parseStatus(
    raw([
      "1 .M N... 100644 100644 100644 aaa bbb keep.ts",
      "2 R. N... 100644 100644 100644 aaa bbb R100 renamed.ts",
      "original.ts",
    ]),
  );
  assert.equal(status.files.length, 2);
  const renamed = status.files[1];
  assert.equal(renamed?.path, "renamed.ts");
  assert.equal(renamed?.original, "original.ts");
  assert.equal(renamed?.kind, "renamed");
  assert.equal(renamed?.staged, true);
});

test("an unmerged entry is its own kind regardless of the pair", () => {
  const status = parseStatus(
    raw(["u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.ts"]),
  );
  const unmerged = status.files[0];
  assert.equal(unmerged?.kind, "unmerged");
  assert.equal(unmerged?.staged, true);
  assert.equal(unmerged?.unstaged, true);
});

test("ignored paths are kept but never counted as changes", () => {
  const status = parseStatus(raw(["1 .M N... 100644 100644 100644 aaa bbb src/a.ts", "! dist/bundle.js"]));
  const totals = totalsOf(status);
  assert.equal(status.files.length, 2);
  assert.equal(totals.files, 1);
  assert.equal(totals.untracked, 0);
});

test("paths with spaces survive the fixed-field split", () => {
  const status = parseStatus(raw(["1 .M N... 100644 100644 100644 aaa bbb docs/my notes.md"]));
  assert.equal(status.files[0]?.path, "docs/my notes.md");
});

test("totals count tracked, untracked, deleted and added separately", () => {
  const status = parseStatus(
    raw([
      "1 .M N... 100644 100644 100644 aaa bbb a.ts",
      "1 .D N... 100644 100644 100644 aaa bbb b.ts",
      "1 A. N... 100644 100644 100644 aaa bbb c.ts",
      "? d.ts",
      "? e.ts",
    ]),
  );
  assert.deepEqual(totalsOf(status), { files: 3, untracked: 2, deleted: 1, added: 1 });
});

test("malformed entries are skipped instead of throwing", () => {
  for (const junk of ["1", "1 .M", "2 R.", "u UU", "# branch.ab nonsense", "x unknown"]) {
    assert.doesNotThrow(() => parseStatus(raw([junk])));
  }
  assert.deepEqual(parseStatus("").files, []);
});

test("shortstat counts insertions, deletions and files", () => {
  assert.deepEqual(parseShortstat(" 3 files changed, 70 insertions(+), 8 deletions(-)\n"), {
    insertions: 70,
    deletions: 8,
    files: 3,
  });
  assert.deepEqual(parseShortstat(" 1 file changed, 1 insertion(+)\n"), { insertions: 1, deletions: 0, files: 1 });
  assert.deepEqual(parseShortstat(" 1 file changed, 4 deletions(-)\n"), { insertions: 0, deletions: 4, files: 1 });
  assert.deepEqual(parseShortstat(""), { insertions: 0, deletions: 0, files: 0 });
});
