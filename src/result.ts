/**
 * Typed result returned across every layer boundary. Nothing throws.
 *
 * `view/*` consumes `Result` and never inspects `stderr`: the message is
 * already user-facing English, the detail is for diagnostics only.
 */

export type GitErrorCode =
  | "not-a-repo"
  | "git-missing"
  | "timeout"
  | "dirty-tree"
  | "diverged"
  | "operation-in-progress"
  | "invalid-ref"
  | "branch-exists"
  | "rejected"
  | "unknown";

export type GitError = {
  readonly code: GitErrorCode;
  /** Already user-facing English, one line, <= 60 chars when possible. */
  readonly message: string;
  /** First meaningful line of stderr, untruncated, for diagnostics. */
  readonly detail?: string;
};

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err = { readonly ok: false; readonly error: GitError };
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(code: GitErrorCode, message: string, detail?: string): Err {
  return { ok: false, error: detail === undefined ? { code, message } : { code, message, detail } };
}

export function failure(error: GitError): Err {
  return { ok: false, error };
}

/** First meaningful line of a git stderr block, for `GitError.detail`. */
export function firstLine(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}
