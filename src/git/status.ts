/**
 * Porcelain v2 parser. Pure: no process, no filesystem, no clock.
 *
 * `git status --porcelain=v2 --branch -z` is one process that answers branch,
 * oid, upstream, ahead/behind and the per-file state, so the panel needs no
 * second call to describe the tree.
 */

export type ChangeKind =
  | "modified"
  | "typechange"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "unmerged"
  | "untracked"
  | "ignored";

export type FileChange = {
  readonly path: string;
  readonly kind: ChangeKind;
  readonly staged: boolean;
  readonly unstaged: boolean;
  /** Source path for a rename or copy, when git reports one. */
  readonly original?: string;
};

export type RepoStatus = {
  /** Full oid of HEAD, `null` on a repository without commits. */
  readonly oid: string | null;
  /** Branch name, `null` when HEAD is detached. */
  readonly branch: string | null;
  readonly detached: boolean;
  readonly upstream: string | null;
  readonly ahead: number;
  readonly behind: number;
  readonly files: readonly FileChange[];
};

export type ChangeTotals = {
  /** Tracked changes: untracked and ignored paths are counted separately. */
  readonly files: number;
  readonly untracked: number;
  readonly deleted: number;
  readonly added: number;
};

const EMPTY: RepoStatus = {
  oid: null,
  branch: null,
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  files: [],
};

const UNMODIFIED = ".";

function kindOf(index: string, worktree: string): ChangeKind {
  const symbol = index === UNMODIFIED ? worktree : index;
  switch (symbol) {
    case "M":
      return "modified";
    case "T":
      return "typechange";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "U":
      return "unmerged";
    default:
      return "modified";
  }
}

/** Splits a fixed-field record, keeping spaces that belong to the path. */
function fieldsOf(record: string, fixedFields: number): { fields: string[]; path: string } | null {
  const parts = record.split(" ");
  if (parts.length < fixedFields + 1) return null;
  return { fields: parts.slice(0, fixedFields), path: parts.slice(fixedFields).join(" ") };
}

function applyHeader(record: string, status: MutableStatus): void {
  const value = record.slice(2);
  if (value.startsWith("branch.oid ")) {
    const oid = value.slice("branch.oid ".length);
    status.oid = oid === "(initial)" ? null : oid;
    return;
  }
  if (value.startsWith("branch.head ")) {
    const head = value.slice("branch.head ".length);
    status.detached = head === "(detached)";
    status.branch = status.detached ? null : head;
    return;
  }
  if (value.startsWith("branch.upstream ")) {
    status.upstream = value.slice("branch.upstream ".length);
    return;
  }
  if (value.startsWith("branch.ab ")) {
    const match = /^branch\.ab \+(\d+) -(\d+)$/.exec(value);
    if (match === null) return;
    status.ahead = Number(match[1] ?? "0");
    status.behind = Number(match[2] ?? "0");
  }
}

type MutableStatus = {
  oid: string | null;
  branch: string | null;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: FileChange[];
};

function emptyMutable(): MutableStatus {
  return { ...EMPTY, files: [] };
}

export function parseStatus(raw: string): RepoStatus {
  const status = emptyMutable();
  const records = raw.split("\u0000");

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record.length === 0) continue;

    if (record.startsWith("# ")) {
      applyHeader(record, status);
      continue;
    }

    switch (record.charAt(0)) {
      case "1": {
        const parsed = fieldsOf(record, 8);
        if (parsed === null) break;
        const pair = parsed.fields[1] ?? UNMODIFIED + UNMODIFIED;
        status.files.push({
          path: parsed.path,
          kind: kindOf(pair.charAt(0), pair.charAt(1)),
          staged: pair.charAt(0) !== UNMODIFIED,
          unstaged: pair.charAt(1) !== UNMODIFIED,
        });
        break;
      }
      case "2": {
        const parsed = fieldsOf(record, 9);
        if (parsed === null) break;
        const pair = parsed.fields[1] ?? UNMODIFIED + UNMODIFIED;
        // With -z the original path is the next NUL-terminated field.
        const original = records[index + 1];
        index += 1;
        status.files.push({
          path: parsed.path,
          kind: kindOf(pair.charAt(0), pair.charAt(1)),
          staged: pair.charAt(0) !== UNMODIFIED,
          unstaged: pair.charAt(1) !== UNMODIFIED,
          ...(original === undefined || original.length === 0 ? {} : { original }),
        });
        break;
      }
      case "u": {
        const parsed = fieldsOf(record, 10);
        if (parsed === null) break;
        const pair = parsed.fields[1] ?? UNMODIFIED + UNMODIFIED;
        status.files.push({
          path: parsed.path,
          kind: "unmerged",
          staged: pair.charAt(0) !== UNMODIFIED,
          unstaged: pair.charAt(1) !== UNMODIFIED,
        });
        break;
      }
      case "?":
        status.files.push({ path: record.slice(2), kind: "untracked", staged: false, unstaged: true });
        break;
      case "!":
        status.files.push({ path: record.slice(2), kind: "ignored", staged: false, unstaged: false });
        break;
      default:
        break;
    }
  }

  return status;
}

export function totalsOf(status: RepoStatus): ChangeTotals {
  let files = 0;
  let untracked = 0;
  let deleted = 0;
  let added = 0;
  for (const change of status.files) {
    if (change.kind === "untracked") {
      untracked += 1;
      continue;
    }
    if (change.kind === "ignored") continue;
    files += 1;
    if (change.kind === "deleted") deleted += 1;
    if (change.kind === "added") added += 1;
  }
  return { files, untracked, deleted, added };
}

export type Shortstat = { readonly insertions: number; readonly deletions: number; readonly files: number };

const INSERTIONS = /(\d+) insertions?\(\+\)/;
const DELETIONS = /(\d+) deletions?\(-\)/;
const FILES_CHANGED = /(\d+) files? changed/;

/** ` 3 files changed, 70 insertions(+), 8 deletions(-)` → counts. Empty → all zero. */
export function parseShortstat(text: string): Shortstat {
  const insertions = INSERTIONS.exec(text);
  const deletions = DELETIONS.exec(text);
  const files = FILES_CHANGED.exec(text);
  return {
    insertions: Number(insertions?.[1] ?? "0"),
    deletions: Number(deletions?.[1] ?? "0"),
    files: Number(files?.[1] ?? "0"),
  };
}
