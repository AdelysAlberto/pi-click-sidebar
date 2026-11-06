/**
 * Every user-visible string. One module so the copy deck in
 * `docs/02-ux-spec.md` §7 has exactly one implementation.
 */

export const SECTION_PROJECT = "PROJECT";
export const SECTION_CHANGES = "CHANGES";
export const SECTION_BRANCH = "BRANCH";
export const SECTION_MODEL = "MODEL";

export const NO_UPSTREAM = "no upstream";
export const NOT_A_REPO = "not a git repository";
export const GIT_MISSING = "git not found in PATH";
export const NO_MODEL = "no model";
export const REQUIRES_CLEAN_TREE = "requires clean tree";
export const DIVERGED = "diverged, fast-forward not possible";
export const STALE = "⏸ stale";
export const OVERLAY_HEADER = "Click Sidebar · esc to close";
export const DETACHED = "(detached)";
export const OPERATION_IN_PROGRESS = "⚠ {op} in progress";

export const ACTIONS: readonly { readonly key: string; readonly verb: string }[] = [
  { key: "f", verb: "fetch" },
  { key: "p", verb: "pull" },
  { key: "u", verb: "push" },
  { key: "s", verb: "switch" },
  { key: "n", verb: "new" },
  { key: "r", verb: "refresh" },
];

export function fileCount(count: number): string {
  return `${count} ${count === 1 ? "file" : "files"}`;
}

export function insertions(value: number): string {
  return `+${value}`;
}

export function deletions(value: number): string {
  return `−${value}`;
}

export function untracked(value: number): string {
  return `✚${value}`;
}

export function deleted(value: number): string {
  return `✖${value}`;
}

export function aheadBehind(ahead: number, behind: number): string {
  return `↑${ahead} ↓${behind}`;
}

export function progress(verb: string, tenths: string): string {
  return `⏵ ${verb}… ${tenths}s`;
}

export function success(verb: string, detail: string, tenths: string): string {
  return `✓ ${verb} · ${detail} · ${tenths}s`;
}

export function failureLine(verb: string, reason: string): string {
  return `✗ ${verb} · ${reason}`;
}

export function timeoutLine(seconds: number): string {
  return `timed out after ${seconds}s`;
}

export function contextPercent(percent: number | null): string {
  return percent === null ? "ctx —" : `ctx ${Math.round(percent)}%`;
}
