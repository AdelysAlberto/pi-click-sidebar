/**
 * Pure mapping from what git reported plus what the session knows to the panel
 * model. No process, no clock, no theme: every branch here is testable.
 */
import type { GitError } from "../result.ts";
import type { Snapshot } from "../git/snapshot.ts";
import { shortOid } from "../git/repo.ts";
import { totalsOf } from "../git/status.ts";
import type { PanelData } from "./sidebar.ts";

export type RepositoryState = "ok" | "none" | "git-missing";

export type SessionInfo = {
  readonly cwd: string;
  readonly modelId: string;
  readonly thinking: string;
  readonly contextPercent: number | null;
};

export type ModelInput = {
  readonly snapshot: Snapshot | null;
  readonly error: GitError | null;
  readonly session: SessionInfo;
  readonly stale: boolean;
};

function baseName(absolutePath: string): string {
  const parts = absolutePath.split("/").filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? absolutePath;
}

function repositoryState(error: GitError | null): RepositoryState {
  if (error === null) return "ok";
  if (error.code === "git-missing") return "git-missing";
  return "none";
}

export function buildPanelData(input: ModelInput): PanelData {
  const { snapshot, error, session } = input;
  const root = snapshot?.toplevel ?? session.cwd;
  const state = repositoryState(error);
  const model = {
    id: session.modelId,
    thinking: session.thinking,
    contextPercent: session.contextPercent,
  };

  if (snapshot === null) {
    return {
      project: { name: baseName(root), path: root },
      changes: null,
      branch: null,
      model,
      result: null,
      stale: input.stale,
      repository: state,
    };
  }

  const totals = totalsOf(snapshot.status);
  const lines = snapshot.shortstat;

  return {
    project: { name: baseName(snapshot.toplevel), path: snapshot.toplevel },
    changes: {
      files: totals.files,
      insertions: lines?.insertions ?? 0,
      deletions: lines?.deletions ?? 0,
      untracked: totals.untracked,
      deleted: totals.deleted,
    },
    branch: {
      name: snapshot.status.branch ?? shortOid(snapshot.status.oid ?? ""),
      detached: snapshot.status.detached,
      upstream: snapshot.status.upstream,
      ahead: snapshot.status.ahead,
      behind: snapshot.status.behind,
      operation: snapshot.operation,
    },
    model,
    result: null,
    stale: input.stale,
    repository: "ok",
  };
}
