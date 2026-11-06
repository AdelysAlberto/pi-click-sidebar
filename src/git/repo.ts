/**
 * Read-only questions about the repository itself: where its root is, which
 * operation is half-finished, what HEAD points at. No parsing beyond one line.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { err, ok, type Result } from "../result.ts";
import type { GitRun } from "./exec.ts";

export type Operation = "merge" | "rebase" | "cherry-pick" | "revert";

/** `rev-parse --show-toplevel`: the root may differ from `ctx.cwd` in a subdirectory or worktree. */
export async function showToplevel(run: GitRun, cwd: string, timeoutMs: number): Promise<Result<string>> {
  const result = await run(["rev-parse", "--show-toplevel"], { cwd, timeoutMs });
  if (!result.ok) return result;
  if (result.value.code !== 0) {
    const detail = result.value.stderr.trim();
    return err("not-a-repo", "not a git repository", detail.length > 0 ? detail : undefined);
  }
  const toplevel = result.value.stdout.replace(/\r?\n$/, "");
  if (toplevel.length === 0) return err("not-a-repo", "not a git repository");
  return ok(toplevel);
}

const OPERATION_MARKERS: readonly { readonly file: string; readonly operation: Operation }[] = [
  { file: "MERGE_HEAD", operation: "merge" },
  { file: "rebase-merge", operation: "rebase" },
  { file: "rebase-apply", operation: "rebase" },
  { file: "CHERRY_PICK_HEAD", operation: "cherry-pick" },
  { file: "REVERT_HEAD", operation: "revert" },
];

/**
 * An unfinished operation is a marker file inside the git directory. Reading
 * the markers beats parsing `git status` and cannot write anything.
 */
export async function detectOperation(run: GitRun, cwd: string, timeoutMs: number): Promise<Operation | null> {
  const result = await run(["rev-parse", "--git-dir"], { cwd, timeoutMs });
  if (!result.ok || result.value.code !== 0) return null;
  const reported = result.value.stdout.replace(/\r?\n$/, "");
  if (reported.length === 0) return null;
  const gitDir = path.resolve(cwd, reported);
  for (const marker of OPERATION_MARKERS) {
    if (existsSync(path.join(gitDir, marker.file))) return marker.operation;
  }
  return null;
}

/** `(detached) a1b2c3d` needs a short form; the full oid is 40 characters. */
export function shortOid(oid: string, length = 7): string {
  return oid.slice(0, length);
}
