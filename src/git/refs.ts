/**
 * Branch names: list, validate, look up. Validation runs `git check-ref-format`
 * before anything touches the tree, and a name that could be read as an option
 * never reaches a process at all.
 */
import { err, ok, type Result } from "../result.ts";
import type { GitRun } from "./exec.ts";

export type Branch = { readonly name: string; readonly committedAt: number };

const FIELD_SEPARATOR = "\t";

/** Heads sorted by last commit date, newest first. */
export async function listBranches(run: GitRun, cwd: string, timeoutMs: number): Promise<Result<readonly Branch[]>> {
  const result = await run(
    ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads"],
    { cwd, timeoutMs },
  );
  if (!result.ok) return result;
  if (result.value.code !== 0) {
    return err("unknown", "could not list branches", result.value.stderr.trim());
  }

  const branches: Branch[] = [];
  for (const line of result.value.stdout.split("\n")) {
    if (line.length === 0) continue;
    const [name, stamp] = line.split(FIELD_SEPARATOR);
    if (name === undefined || name.length === 0) continue;
    branches.push({ name, committedAt: Number(stamp ?? "0") });
  }
  branches.sort((left, right) => right.committedAt - left.committedAt);
  return ok(branches);
}

/**
 * A name starting with `-` is an option, not a ref: rejected before any spawn
 * so a crafted name can never reach git's argv.
 */
export function rejectOptionLike(name: string): Result<string> {
  if (name.length === 0) return err("invalid-ref", "branch name is empty");
  if (name.startsWith("-")) return err("invalid-ref", "branch name cannot start with -");
  if (name.trim() !== name) return err("invalid-ref", "branch name has leading or trailing spaces");
  return ok(name);
}

/** `check-ref-format --branch` is the authority on what git will accept. */
export async function validateBranchName(
  run: GitRun,
  name: string,
  cwd: string,
  timeoutMs: number,
): Promise<Result<string>> {
  const guarded = rejectOptionLike(name);
  if (!guarded.ok) return guarded;

  const result = await run(["check-ref-format", "--branch", name], { cwd, timeoutMs });
  if (!result.ok) return result;
  if (result.value.code !== 0) {
    const detail = result.value.stderr.trim();
    return err("invalid-ref", "not a valid branch name", detail.length > 0 ? detail : undefined);
  }
  return ok(name);
}

export async function branchExists(
  run: GitRun,
  name: string,
  cwd: string,
  timeoutMs: number,
): Promise<Result<boolean>> {
  const guarded = rejectOptionLike(name);
  if (!guarded.ok) return guarded;

  const result = await run(["show-ref", "--verify", "--quiet", `refs/heads/${name}`], { cwd, timeoutMs });
  if (!result.ok) return result;
  return ok(result.value.code === 0);
}
