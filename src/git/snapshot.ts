/**
 * One read of the working tree: probe, status, and the throttled line deltas.
 *
 * Everything here is read-only. The caller decides how often it runs; this
 * module only knows how expensive each command is.
 */
import { err, ok, type Result } from "../result.ts";
import type { GitRun } from "./exec.ts";
import { detectOperation, showToplevel, type Operation } from "./repo.ts";
import { parseShortstat, parseStatus, type RepoStatus, type Shortstat } from "./status.ts";

export type Snapshot = {
  /** Repository root, which may differ from the directory the command ran in. */
  readonly toplevel: string;
  readonly status: RepoStatus;
  readonly operation: Operation | null;
  /** Line deltas, only present when the caller asked for them on this tick. */
  readonly shortstat: Shortstat | null;
};

export type SnapshotOptions = {
  readonly cwd: string;
  readonly readTimeoutMs: number;
  readonly includeShortstat: boolean;
};

const NO_SHORTSTAT: Shortstat = { insertions: 0, deletions: 0, files: 0 };

export async function readSnapshot(run: GitRun, options: SnapshotOptions): Promise<Result<Snapshot>> {
  const toplevel = await showToplevel(run, options.cwd, options.readTimeoutMs);
  if (!toplevel.ok) return toplevel;

  // Status and the line deltas are independent reads: run them together so the
  // tick costs the slower one instead of their sum.
  const [status, operation, shortstat] = await Promise.all([
    run(["status", "--porcelain=v2", "--branch", "-z"], { cwd: toplevel.value, timeoutMs: options.readTimeoutMs }),
    detectOperation(run, toplevel.value, options.readTimeoutMs),
    options.includeShortstat
      ? readShortstat(run, toplevel.value, options.readTimeoutMs)
      : Promise.resolve(ok(NO_SHORTSTAT)),
  ]);

  if (!status.ok) return status;
  if (status.value.code !== 0) {
    return err("unknown", "could not read the working tree", status.value.stderr.trim());
  }
  if (!shortstat.ok) return shortstat;

  return ok({
    toplevel: toplevel.value,
    status: parseStatus(status.value.stdout),
    operation,
    shortstat: shortstat.value,
  });
}

/**
 * `diff --shortstat HEAD` fails on a repository without commits (exit 128, no
 * HEAD to compare against). That is not an error: the counts are simply absent.
 */
async function readShortstat(run: GitRun, cwd: string, timeoutMs: number): Promise<Result<Shortstat>> {
  const result = await run(["diff", "--shortstat", "HEAD"], { cwd, timeoutMs });
  if (!result.ok) return result;
  if (result.value.code !== 0) return ok(NO_SHORTSTAT);
  return ok(parseShortstat(result.value.stdout));
}
