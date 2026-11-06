/**
 * One line above the editor for regular mode, where there is no horizontal axis
 * to put a dock in.
 *
 * Fitting works on plain text and styling happens at render: truncating a
 * string that already carries escape codes would measure and split through
 * them, and a middle ellipsis would cut an SGR sequence in half.
 */
import type { Component } from "@earendil-works/pi-tui";
import { MouseRegion, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { DETACHED, NO_MODEL, deletions, insertions, untracked } from "./copy.ts";
import { displayPath, middleEllipsis, rightEllipsis } from "./text.ts";
import type { PanelData } from "./sidebar.ts";

export type RailPieceId = "project" | "path" | "branch" | "counts" | "model" | "hint";

export type RailPiece = {
  readonly id: RailPieceId;
  /** Plain text: what gets measured, truncated and joined. */
  readonly text: string;
  /** Applied when the piece is rendered, never before fitting. */
  readonly style: (text: string) => string;
};

export const RAIL_SEPARATOR = "  ";

/**
 * The truncation policy, in order: the project path goes first, then the
 * branch, then the model, and only then does anything get hard-truncated.
 * Nothing here is per-piece configuration, so the policy has one home.
 */
type Step =
  | { readonly kind: "shrink"; readonly id: RailPieceId; readonly to: number; readonly from?: "middle" }
  | { readonly kind: "drop"; readonly id: RailPieceId };

const LADDER: readonly Step[] = [
  // A path keeps its last segment, which is the part that identifies the project.
  { kind: "shrink", id: "path", to: 12, from: "middle" },
  { kind: "drop", id: "path" },
  { kind: "shrink", id: "branch", to: 12 },
  { kind: "drop", id: "branch" },
  { kind: "shrink", id: "project", to: 8 },
  { kind: "shrink", id: "model", to: 8 },
  { kind: "drop", id: "model" },
];

export function joinRail(pieces: readonly RailPiece[]): string {
  return pieces.map((piece) => piece.text).join(RAIL_SEPARATOR);
}

function applyStep(pieces: readonly RailPiece[], step: Step): readonly RailPiece[] {
  if (step.kind === "drop") return pieces.filter((piece) => piece.id !== step.id);
  return pieces.map((piece) => {
    if (piece.id !== step.id || visibleWidth(piece.text) <= step.to) return piece;
    const text = step.from === "middle" ? middleEllipsis(piece.text, step.to) : rightEllipsis(piece.text, step.to);
    return { ...piece, text };
  });
}

/** The pieces that survive at this width. The caller still owns the final truncate. */
export function fitRail(pieces: readonly RailPiece[], width: number): readonly RailPiece[] {
  let active: readonly RailPiece[] = pieces;
  if (visibleWidth(joinRail(active)) <= width) return active;
  for (const step of LADDER) {
    active = applyStep(active, step);
    if (visibleWidth(joinRail(active)) <= width) return active;
  }
  return active;
}

/** The plain one line, fitted and hard-truncated: what the width guarantees. */
export function railLine(pieces: readonly RailPiece[], width: number): string {
  return truncateToWidth(joinRail(fitRail(pieces, width)), width, "…");
}

export type RailProps = {
  readonly read: () => PanelData;
  readonly theme: Theme;
  /** True only in regular mode: the dock owns fullscreen. */
  readonly visible: () => boolean;
  readonly onOpen: () => void;
};

export function createRail(props: RailProps): Component {
  const theme = props.theme;

  const pieces = (data: PanelData): readonly RailPiece[] => {
    const branch = data.branch === null ? "" : data.branch.detached ? `${DETACHED} ${data.branch.name}` : data.branch.name;
    const changes =
      data.changes === null
        ? ""
        : `${untracked(data.changes.untracked)} ${insertions(data.changes.insertions)} ${deletions(data.changes.deletions)}`;

    const built: RailPiece[] = [
      { id: "project", text: data.project?.name ?? NO_MODEL, style: (text) => theme.bold(text) },
      {
        id: "path",
        text: data.project === null ? "" : middleEllipsis(displayPath(data.project.path), 28),
        style: (text) => theme.fg("dim", text),
      },
      {
        id: "branch",
        text: branch.length === 0 ? "" : `⎇ ${branch}`,
        style: (text) => theme.fg(data.branch?.detached === true ? "warning" : "accent", text),
      },
      { id: "counts", text: changes, style: (text) => theme.fg("muted", text) },
      {
        id: "model",
        text: `${data.model.id}·${data.model.thinking}`,
        style: (text) => theme.fg("dim", text),
      },
      { id: "hint", text: "alt+g", style: (text) => theme.fg("muted", text) },
    ];
    return built.filter((piece) => piece.text.length > 0);
  };

  /** One click region per segment; the hint is text, not a target. */
  const regionFor = (piece: RailPiece, text: string): Component => {
    const segment: Component = { render: () => [text], invalidate: () => {} };
    if (piece.id === "hint") return segment;
    return new MouseRegion(segment, () => {
      props.onOpen();
      return { handled: true };
    });
  };

  return {
    render(width: number): string[] {
      if (!props.visible()) return [];
      const available = Math.max(1, width - 2);
      const visible = fitRail(pieces(props.read()), available);
      if (visible.length === 0) return [""];

      const parts = visible.map((piece) => {
        const styled = piece.style(piece.text);
        return regionFor(piece, styled).render(visibleWidth(styled))[0] ?? "";
      });
      const text = ` ${parts.join(RAIL_SEPARATOR)} `;
      const plainLength = visibleWidth(joinRail(visible));
      return [plainLength + 2 <= width ? text : truncateToWidth(text, width, "…")];
    },
    invalidate: () => {},
  };
}
