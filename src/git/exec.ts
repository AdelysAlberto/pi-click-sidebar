/**
 * The only module that spawns `git`.
 *
 * argv arrays only, never a shell string, never an interpolated branch name.
 * A process that cannot be started is an `Err`; a process that runs and exits
 * non-zero is `Ok` with its `code`, because several git commands answer with a
 * meaningful exit status (`show-ref --verify`, `check-ref-format`).
 */
import type { ExecOptions, ExecResult } from "@earendil-works/pi-coding-agent";
import { err, ok, type Result } from "../result.ts";

export const GIT = "git";
/** `git` is not on PATH: the shell reports command-not-found. */
const COMMAND_NOT_FOUND = 127;

export type GitOutput = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly truncated: boolean;
};

export type Exec = (command: string, args: string[], options: ExecOptions) => Promise<ExecResult>;

export type GitRunOptions = {
  readonly cwd: string;
  readonly timeoutMs: number;
  /** Cancels the child; a cancelled command is reported as `timeout`. */
  readonly signal?: AbortSignal;
};

export type GitRun = (args: readonly string[], options: GitRunOptions) => Promise<Result<GitOutput>>;

export function createGitRun(exec: Exec): GitRun {
  return async (args, options) => {
    if (args.some((arg) => arg === "")) {
      return err("invalid-ref", "empty argument to git");
    }
    // Read through a call: the signal can be aborted at any moment, including
    // between the local reads that precede a network command, and a plain
    // property read would be narrowed by the type checker after this guard.
    const cancelled = (): boolean => options.signal?.aborted === true;
    // Spawning an already-cancelled command means waiting for the network
    // timeout for something nobody wants any more.
    if (cancelled()) return err("timeout", "cancelled");

    let result: ExecResult;
    try {
      result = await exec(GIT, [...args], {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return err("git-missing", "git could not be started", detail);
    }

    if (result.killed) {
      if (cancelled()) return err("timeout", "cancelled");
      return err("timeout", `timed out after ${Math.round(options.timeoutMs / 1000)}s`);
    }
    if (result.code === COMMAND_NOT_FOUND) {
      return err("git-missing", "git not found in PATH", result.stderr.trim());
    }

    return ok({
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
      truncated: result.truncated,
    });
  };
}
