/**
 * The four commands that can change the tree or talk to a remote, with the
 * guard chain in front of them (docs/03-architecture.md §4).
 *
 * Order matters and is fixed: repository probe, then the operation markers,
 * then the dirty tree, then the argument-specific questions. Nothing is ever
 * stashed, rebased, or forced; `pull` is fast-forward only.
 */
import type { Timeouts } from "../config.ts";
import { err, ok, type Result, firstLine, type GitErrorCode } from "../result.ts";
import type { GitRun } from "./exec.ts";
import { detectOperation, showToplevel } from "./repo.ts";
import { parseStatus } from "./status.ts";

export type Verb = "fetch" | "pull" | "push" | "switch" | "create";

export type Prepared = {
  readonly toplevel: string;
  readonly branch: string | null;
  readonly detached: boolean;
  readonly upstream: string | null;
  /** Tracked and untracked paths, ignored ones excluded. */
  readonly dirtyFiles: number;
  readonly oid: string | null;
  readonly ahead: number;
  readonly behind: number;
};

export type Deps = {
  readonly run: GitRun;
  readonly cwd: string;
  readonly timeouts: Timeouts;
  /** Cancels the network commands; local reads always finish. */
  readonly signal?: AbortSignal;
  /** Injected so a test can answer without a terminal. */
  readonly confirm: (message: string) => Promise<boolean>;
};

/** Probe plus the status the guards and the confirmations need. */
export async function prepare(deps: Deps): Promise<Result<Prepared>> {
  const toplevel = await showToplevel(deps.run, deps.cwd, deps.timeouts.read);
  if (!toplevel.ok) return toplevel;

  const status = await deps.run(["status", "--porcelain=v2", "--branch", "-z"], {
    cwd: toplevel.value,
    timeoutMs: deps.timeouts.read,
  });
  if (!status.ok) return status;
  if (status.value.code !== 0) {
    return err("unknown", "could not read the working tree", firstLine(status.value.stderr));
  }

  const parsed = parseStatus(status.value.stdout);
  return ok({
    toplevel: toplevel.value,
    branch: parsed.branch,
    detached: parsed.detached,
    upstream: parsed.upstream,
    dirtyFiles: parsed.files.filter((file) => file.kind !== "ignored").length,
    oid: parsed.oid,
    ahead: parsed.ahead,
    behind: parsed.behind,
  });
}

/** Only `fetch` is safe to run in the middle of a merge, a rebase or a pick. */
async function requireNoOperation(deps: Deps, verb: Verb, toplevel: string): Promise<Result<null>> {
  if (verb === "fetch") return ok(null);
  const operation = await detectOperation(deps.run, toplevel, deps.timeouts.read);
  if (operation === null) return ok(null);
  return err("operation-in-progress", `${operation} in progress`);
}

/** `pull` and `switch` never touch a dirty tree, and nothing is stashed to fix it. */
function requireCleanTree(prepared: Prepared, verb: Verb): Result<null> {
  if (verb !== "pull" && verb !== "switch" && verb !== "create") return ok(null);
  if (prepared.dirtyFiles === 0) return ok(null);
  return err("dirty-tree", `${prepared.dirtyFiles} uncommitted ${prepared.dirtyFiles === 1 ? "file" : "files"}`);
}

export type ActionOutcome = { readonly detail: string };

const NO_UPSTREAM = /no upstream|set-upstream|has no upstream branch/i;
/** Only a pull can be told its history diverged; a push is simply refused. */
const PULL_DIVERGED = /not possible to fast-forward|diverging branches/i;
const PUSH_REJECTED = /\[rejected\]|failed to push some refs|remote rejected|non-fast-forward/i;
const CREDENTIALS = /could not read Username|Authentication failed|Permission denied|terminal prompts disabled/i;

/**
 * stderr → the taxonomy the result line speaks. The verb matters: the same
 * "non-fast-forward" means a diverged pull and a refused push. Pure, so tested.
 */
export function classifyFailure(
  stderr: string,
  verb: Verb = "fetch",
): { code: GitErrorCode; message: string; detail?: string } {
  if (verb === "pull" && PULL_DIVERGED.test(stderr)) {
    return { code: "diverged", message: "diverged, fast-forward not possible" };
  }
  if (PUSH_REJECTED.test(stderr)) return { code: "rejected", message: "rejected by the remote" };
  if (CREDENTIALS.test(stderr)) return { code: "rejected", message: "no credentials for this remote" };
  if (NO_UPSTREAM.test(stderr)) return { code: "rejected", message: "no upstream branch configured" };
  const detail = firstLine(stderr);
  return { code: "unknown", message: "git refused the command", ...(detail === undefined ? {} : { detail }) };
}

function failed(stderr: string, verb: Verb): Result<never> {
  const classified = classifyFailure(stderr, verb);
  return err(classified.code, classified.message, classified.detail);
}

async function runNet(
  deps: Deps,
  args: readonly string[],
  cwd: string,
  verb: Verb,
): Promise<Result<{ stdout: string; stderr: string }>> {
  const result = await deps.run(args, {
    cwd,
    timeoutMs: deps.timeouts.network,
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  if (!result.ok) return result;
  if (result.value.code !== 0) return failed(result.value.stderr, verb);
  return ok({ stdout: result.value.stdout, stderr: result.value.stderr });
}

/**
 * `a1b2c3d..e4f5a6b  main -> origin/main`, minus the hashes: the range and the
 * arrow are the same in every locale, the prose around them is not.
 */
export function refUpdate(output: string): string | null {
  // `..` moves a ref, `...` marks a forced update.
  const match = /[0-9a-f]+\.{2,3}[0-9a-f]+\s+(\S+)\s+->\s+(\S+)/.exec(output);
  if (match === null) return null;
  return `${match[1] ?? ""} → ${match[2] ?? ""}`;
}

export async function fetchRemote(deps: Deps): Promise<Result<ActionOutcome>> {
  const prepared = await prepare(deps);
  if (!prepared.ok) return prepared;
  const guard = await requireNoOperation(deps, "fetch", prepared.value.toplevel);
  if (!guard.ok) return guard;

  const result = await runNet(deps, ["fetch", "--prune"], prepared.value.toplevel, "fetch");
  if (!result.ok) return result;
  return ok({ detail: refUpdate(result.value.stderr) ?? "up to date" });
}

export async function pullFastForward(deps: Deps): Promise<Result<ActionOutcome>> {
  const prepared = await prepare(deps);
  if (!prepared.ok) return prepared;
  if (prepared.value.detached) return err("rejected", "detached HEAD, no branch to pull");

  const state = prepared.value;
  const operation = await requireNoOperation(deps, "pull", state.toplevel);
  if (!operation.ok) return operation;
  const clean = requireCleanTree(prepared.value, "pull");
  if (!clean.ok) return clean;

  // Both sides moved: no fast-forward exists, so do not even ask the remote.
  // Doing this from the graph keeps the verdict independent of git's locale.
  if (state.ahead > 0 && state.behind > 0) return err("diverged", "diverged, fast-forward not possible");

  const result = await runNet(deps, ["pull", "--ff-only"], prepared.value.toplevel, "pull");
  if (!result.ok) return result;

  const after = await deps.run(["rev-parse", "HEAD"], {
    cwd: state.toplevel,
    timeoutMs: deps.timeouts.read,
  });
  const moved = after.ok && after.value.stdout.trim() !== state.oid;
  return ok({ detail: moved ? "fast-forward" : "up to date" });
}

export async function pushBranch(deps: Deps): Promise<Result<ActionOutcome>> {
  const prepared = await prepare(deps);
  if (!prepared.ok) return prepared;
  const state = prepared.value;
  if (state.detached || state.branch === null) return err("rejected", "detached HEAD, no branch to push");

  const operation = await requireNoOperation(deps, "push", state.toplevel);
  if (!operation.ok) return operation;

  if (state.dirtyFiles > 0) {
    const proceed = await deps.confirm(
      `Push with ${state.dirtyFiles} uncommitted ${state.dirtyFiles === 1 ? "file" : "files"}? Only committed work is pushed.`,
    );
    if (!proceed) return err("dirty-tree", "cancelled, nothing was pushed");
  }

  if (state.upstream === null) {
    const proceed = await deps.confirm(`No upstream branch. Push with -u origin ${state.branch}?`);
    if (!proceed) return err("rejected", "cancelled, nothing was pushed");
    const result = await runNet(deps, ["push", "-u", "origin", state.branch], state.toplevel, "push");
    if (!result.ok) return result;
    return ok({ detail: `origin/${state.branch}` });
  }

  const result = await runNet(deps, ["push"], state.toplevel, "push");
  if (!result.ok) return result;
  return ok({ detail: state.upstream });
}
