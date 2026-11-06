/**
 * The panel's sections, one function each. They receive a row factory so the
 * frame (border, padding, column width) stays in `sidebar.ts`, and they report
 * the clickable ranges they drew so the caller can hit-test a mouse event.
 */
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
import type { HitAction } from "./hits.ts";
import { displayPath, middleEllipsis, rightEllipsis, spread } from "./text.ts";
import type { PanelData } from "./sidebar.ts";

export type RowFactory = (styled: string) => string;

export type SectionHit = {
  /** Row inside the section, zero-based. */
  readonly rowOffset: number;
  /** First column inside the content area. */
  readonly start: number;
  readonly length: number;
  readonly action: HitAction;
};

export type Section = {
  readonly name: "project" | "changes" | "branch" | "actions" | "result" | "model";
  readonly lines: readonly string[];
  readonly hits: readonly SectionHit[];
};

export type SectionContext = {
  readonly data: PanelData;
  readonly theme: Theme;
  readonly column: number;
  readonly row: RowFactory;
  /** Replaces the result slot while the key map is open. */
  readonly helpLines: readonly string[] | null;
};

const BRANCH_MAX = 26;
/** `02-ux-spec.md` §4: success holds its colour for six seconds. */
const RESULT_HOLD_MS = 6000;

export function heading(theme: Theme, label: string): string {
  return theme.fg("accent", theme.bold(label));
}

export function reasonLine(data: PanelData): string {
  return data.repository === "git-missing" ? GIT_MISSING : NOT_A_REPO;
}

function stylish(theme: Theme, kind: "running" | "ok" | "fail" | undefined): (text: string) => string {
  if (kind === "ok") return (text) => theme.fg("success", text);
  if (kind === "fail") return (text) => theme.fg("error", text);
  if (kind === "running") return (text) => theme.fg("accent", text);
  return (text) => theme.fg("muted", text);
}

export function projectSection(context: SectionContext): Section {
  const { data, theme, column, row } = context;
  const lines = [row(heading(theme, SECTION_PROJECT))];
  if (data.project === null) {
    lines.push(row(theme.fg("dim", NOT_A_REPO)));
    return { name: "project", lines, hits: [] };
  }
  lines.push(row(theme.bold(rightEllipsis(data.project.name, column))));
  lines.push(row(theme.fg("dim", middleEllipsis(displayPath(data.project.path), column))));
  return {
    name: "project",
    lines,
    hits: [
      { rowOffset: 1, start: 0, length: column, action: { kind: "project" } },
      { rowOffset: 2, start: 0, length: column, action: { kind: "project" } },
    ],
  };
}

export function changesSection(context: SectionContext): Section {
  const { data, theme, column, row } = context;
  if (data.repository !== "ok") {
    return { name: "changes", lines: [row(theme.fg("dim", reasonLine(data)))], hits: [] };
  }
  const changes = data.changes;
  if (changes === null) {
    return {
      name: "changes",
      lines: [row(spread(heading(theme, SECTION_CHANGES), theme.fg("dim", "—"), column))],
      hits: [],
    };
  }

  const number = data.stale ? (text: string) => theme.fg("dim", text) : (text: string) => theme.fg("text", text);
  const dirty = data.stale
    ? (text: string) => theme.fg("dim", text)
    : (text: string) => theme.fg("warning", text);

  return {
    name: "changes",
    lines: [
      row(spread(heading(theme, SECTION_CHANGES), theme.fg("muted", fileCount(changes.files)), column)),
      row(
        [
          number(insertions(changes.insertions)),
          number(deletions(changes.deletions)),
          " ",
          dirty(untracked(changes.untracked)),
          dirty(deleted(changes.deleted)),
        ].join(" "),
      ),
    ],
    hits: [{ rowOffset: 0, start: 0, length: SECTION_CHANGES.length, action: { kind: "changes" } }],
  };
}

export function branchSection(context: SectionContext): Section {
  const { data, theme, column, row } = context;
  const branch = data.branch;
  if (data.repository !== "ok" || branch === null) return { name: "branch", lines: [], hits: [] };

  const label = branch.detached ? `${DETACHED} ${branch.name}` : branch.name;
  const limit = Math.min(column, BRANCH_MAX);
  const lines = [row(heading(theme, SECTION_BRANCH))];
  lines.push(
    row(
      branch.detached
        ? theme.fg("warning", rightEllipsis(label, limit))
        : theme.bold(rightEllipsis(label, limit)),
    ),
  );
  const parts: string[] = [];
  if (branch.upstream !== null && !branch.detached) parts.push(aheadBehind(branch.ahead, branch.behind));
  if (data.stale) parts.push(STALE);
  lines.push(row(theme.fg("dim", parts.length > 0 ? parts.join(" · ") : "no upstream")));
  if (branch.operation !== null) {
    lines.push(row(theme.fg("warning", OPERATION_IN_PROGRESS.replace("{op}", branch.operation))));
  }
  return {
    name: "branch",
    lines,
    hits: [{ rowOffset: 1, start: 0, length: Math.min(column, label.length), action: { kind: "branch" } }],
  };
}

export function actionsSection(context: SectionContext): Section {
  const { data, theme, row } = context;
  if (data.repository !== "ok") return { name: "actions", lines: [], hits: [] };

  // A verb in flight owns the section: every cell dims and clicks are ignored.
  const verbStyle = data.running === null ? "text" : "dim";
  const keyStyle = data.running === null ? "muted" : "dim";

  const perRow = 3;
  const lines: string[] = [];
  const hits: SectionHit[] = [];

  for (let start = 0; start < ACTIONS.length; start += perRow) {
    const rowOffset = lines.length;
    const cells = ACTIONS.slice(start, start + perRow);
    let column = 0;
    const rendered: string[] = [];
    for (const cell of cells) {
      const plain = `${cell.key} ${cell.verb}`;
      if (rendered.length > 0) column += 3;
      rendered.push(`${theme.fg(keyStyle, cell.key)} ${theme.fg(verbStyle, cell.verb)}`);
      if (data.running === null) {
        hits.push({ rowOffset, start: column, length: plain.length, action: { kind: "verb", verb: cell.verb } });
      }
      column += plain.length;
    }
    lines.push(row(rendered.join("   ")));
  }
  return { name: "actions", lines, hits };
}

export function resultSection(context: SectionContext): Section {
  const { data, theme, column, row } = context;
  if (context.helpLines !== null) {
    return {
      name: "result",
      lines: context.helpLines.map((line) => row(theme.fg("muted", rightEllipsis(line, column)))),
      hits: [],
    };
  }
  const result = data.result;
  if (result === null) return { name: "result", lines: [row("")], hits: [] };
  // A finished result keeps its colour for six seconds and then stays dimmed.
  const expired = result.at !== undefined && Date.now() - result.at > RESULT_HOLD_MS;
  const style = expired && result.kind === "ok" ? stylish(theme, undefined) : stylish(theme, result.kind);
  return { name: "result", lines: [row(style(result.line))], hits: [] };
}

export function modelSection(context: SectionContext): Section {
  const { data, theme, column, row } = context;
  return {
    name: "model",
    lines: [
      row(heading(theme, SECTION_MODEL)),
      row(theme.fg("text", rightEllipsis(`${data.model.id} · ${data.model.thinking}`, column))),
      row(theme.fg("dim", contextPercent(data.model.contextPercent))),
    ],
    hits: [],
  };
}
