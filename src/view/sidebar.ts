/**
 * The panel component: one anatomy, rendered by the dock lane and by the
 * overlay fallback. It never spawns a process and never decides anything; it
 * renders a `PanelData` and forwards the keys it owns.
 *
 * Reading order is fixed by `docs/02-ux-spec.md` §2: Project, Changes, Branch
 * and actions, Result, Model. Nothing reorders under the cursor.
 */
import type { Component } from "@earendil-works/pi-tui";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  ACTIONS,
  DETACHED,
  GIT_MISSING,
  NOT_A_REPO,
  OPERATION_IN_PROGRESS,
  SECTION_BRANCH,
  SECTION_CHANGES,
  SECTION_MODEL,
  SECTION_PROJECT,
  STALE,
  aheadBehind,
  contextPercent,
  deleted,
  deletions,
  fileCount,
  insertions,
  untracked,
} from "./copy.ts";
import { displayPath, middleEllipsis, padToWidth, rightEllipsis, spread } from "./text.ts";

export type ProjectSummary = { readonly name: string; readonly path: string };

export type ChangeSummary = {
  readonly files: number;
  readonly insertions: number;
  readonly deletions: number;
  readonly untracked: number;
  readonly deleted: number;
};

export type BranchSummary = {
  readonly name: string;
  readonly detached: boolean;
  readonly upstream: string | null;
  readonly ahead: number;
  readonly behind: number;
  readonly operation: string | null;
};

export type ModelSummary = {
  readonly id: string;
  readonly thinking: string;
  readonly contextPercent: number | null;
};

export type ResultKind = "running" | "ok" | "fail";

export type PanelData = {
  readonly project: ProjectSummary | null;
  readonly changes: ChangeSummary | null;
  readonly branch: BranchSummary | null;
  readonly model: ModelSummary;
  readonly result: { readonly kind: ResultKind; readonly line: string } | null;
  readonly stale: boolean;
  /** `none` renders the project plus one dim line; there is nothing else to show. */
  readonly repository: RepositoryState;
};

export type RepositoryState = "ok" | "none" | "git-missing";

export type SidebarProps = {
  /** Read on every render: the dock refreshes in place, it is not rebuilt. */
  readonly read: () => PanelData;
  readonly theme: Theme;
  /** Shown inside the frame; the overlay needs it, the dock knows it is the sidebar. */
  readonly header: string | null;
  readonly onClose: () => void;
};

const MIN_WIDTH = 24;
const BRANCH_MAX = 26;

function heading(theme: Theme, label: string): string {
  return theme.fg("accent", theme.bold(label));
}

export function createSidebar(props: SidebarProps): Component {
  const theme = props.theme;

  const frame = (segment: string): string => theme.fg("border", segment);

  const render = (requested: number): string[] => {
    const width = Math.max(MIN_WIDTH, Math.floor(requested));
    const inner = width - 2;
    const column = inner - 2;
    const data = props.read();

    const row = (styled: string): string => `${frame("│")} ${padToWidth(styled, column)} ${frame("│")}`;
    const blank = (): string => row("");

    const project: string[] = [row(heading(theme, SECTION_PROJECT))];
    if (data.project === null) {
      project.push(row(theme.fg("dim", NOT_A_REPO)));
    } else {
      project.push(row(theme.bold(rightEllipsis(data.project.name, column))));
      project.push(row(theme.fg("dim", middleEllipsis(displayPath(data.project.path), column))));
    }

    const changes: string[] =
      data.repository === "ok" ? renderChanges(data, row, column, theme) : [row(theme.fg("dim", reasonLine(data)))];
    const branch: string[] =
      data.repository === "ok" && data.branch !== null ? renderBranch(data, row, column, theme) : [];

    const resultStyle = stylish(theme, data.result?.kind);
    const result: string[] = [row(data.result === null ? "" : resultStyle(data.result.line))];

    const model: string[] = [
      row(heading(theme, SECTION_MODEL)),
      row(theme.fg("text", rightEllipsis(`${data.model.id} · ${data.model.thinking}`, column))),
      row(theme.fg("dim", contextPercent(data.model.contextPercent))),
    ];

    // One blank line between sections, never at the top or bottom of the frame.
    const actions = data.repository === "ok" ? renderActions(row, theme) : [];
    const sections = [project, changes, branch, actions, result, model].filter((section) => section.length > 0);
    const body = sections.flatMap((section, index) => (index === 0 ? section : [blank(), ...section]));

    const head: string[] = [frame(`╭${"─".repeat(inner)}╮`)];
    if (props.header !== null) {
      head.push(row(theme.fg("muted", rightEllipsis(props.header, column))), blank());
    }

    return [...head, ...body, frame(`╰${"─".repeat(inner)}╯`)];
  };

  return {
    render,
    invalidate: () => {},
    handleInput(data: string): void {
      if (matchesKey(data, Key.escape)) props.onClose();
    },
  };
}

function reasonLine(data: PanelData): string {
  return data.repository === "git-missing" ? GIT_MISSING : NOT_A_REPO;
}

function stylish(theme: Theme, kind: ResultKind | undefined): (text: string) => string {
  if (kind === "ok") return (text) => theme.fg("success", text);
  if (kind === "fail") return (text) => theme.fg("error", text);
  if (kind === "running") return (text) => theme.fg("accent", text);
  return (text) => theme.fg("muted", text);
}

function renderChanges(
  data: PanelData,
  row: (styled: string) => string,
  column: number,
  theme: Theme,
): string[] {
  const changes = data.changes;
  if (changes === null) return [row(spread(heading(theme, SECTION_CHANGES), theme.fg("dim", "—"), column))];
  const numberStyle = data.stale ? (text: string) => theme.fg("dim", text) : (text: string) => theme.fg("text", text);
  const dirtyStyle = data.stale ? (text: string) => theme.fg("dim", text) : (text: string) => theme.fg("warning", text);
  return [
    row(spread(heading(theme, SECTION_CHANGES), theme.fg("muted", fileCount(changes.files)), column)),
    row(
      [
        numberStyle(insertions(changes.insertions)),
        numberStyle(deletions(changes.deletions)),
        " ",
        dirtyStyle(untracked(changes.untracked)),
        dirtyStyle(deleted(changes.deleted)),
      ].join(" "),
    ),
  ];
}

function renderBranch(
  data: PanelData,
  row: (styled: string) => string,
  column: number,
  theme: Theme,
): string[] {
  const branch = data.branch;
  if (branch === null) return [];
  const rows = [row(heading(theme, SECTION_BRANCH))];
  const label = branch.detached ? `${DETACHED} ${branch.name}` : branch.name;
  const limit = Math.min(column, BRANCH_MAX);
  rows.push(row(branch.detached ? theme.fg("warning", rightEllipsis(label, limit)) : theme.bold(rightEllipsis(label, limit))));

  const parts: string[] = [];
  if (branch.upstream !== null && !branch.detached) parts.push(aheadBehind(branch.ahead, branch.behind));
  if (data.stale) parts.push(STALE);
  rows.push(row(theme.fg("dim", parts.length > 0 ? parts.join(" · ") : "no upstream")));
  if (branch.operation !== null) {
    rows.push(row(theme.fg("warning", OPERATION_IN_PROGRESS.replace("{op}", branch.operation))));
  }
  return rows;
}

function renderActions(row: (styled: string) => string, theme: Theme): string[] {
  const cell = (index: number): string => {
    const action = ACTIONS[index];
    if (action === undefined) return "";
    return `${theme.fg("muted", action.key)} ${theme.fg("text", action.verb)}`;
  };
  const perRow = 3;
  const rows: string[] = [];
  for (let start = 0; start < ACTIONS.length; start += perRow) {
    const cells = [cell(start), cell(start + 1), cell(start + 2)].filter((entry) => entry.length > 0);
    rows.push(row(cells.join("   ")));
  }
  return rows;
}
