/**
 * The panel component: one anatomy, rendered by the dock lane and by the
 * overlay fallback. It never spawns a process and never decides anything; it
 * renders a `PanelData`, maps its own keys, and reports clicks as actions.
 *
 * Reading order is fixed by `docs/02-ux-spec.md` §2: Project, Changes, Branch
 * and actions, Result, Model. Nothing reorders under the cursor.
 */
import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { hitTest, type HitAction, type HitMap } from "./hits.ts";
import { keyMapLines, resolvePanelCommand, type PanelCommand } from "./keymap.ts";
import {
  actionsSection,
  branchSection,
  changesSection,
  modelSection,
  projectSection,
  resultSection,
  type Section,
  type SectionContext,
} from "./panel-sections.ts";
import { padToWidth } from "./text.ts";

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

export type RepositoryState = "ok" | "none" | "git-missing";

export type PanelData = {
  readonly project: ProjectSummary | null;
  readonly changes: ChangeSummary | null;
  readonly branch: BranchSummary | null;
  readonly model: ModelSummary;
  readonly result: { readonly kind: ResultKind; readonly line: string; readonly at?: number } | null;
  /** The verb in flight, when one is: the verb row dims and a second run is refused. */
  readonly running: string | null;
  readonly stale: boolean;
  /** `none` renders the project plus one dim line; there is nothing else to show. */
  readonly repository: RepositoryState;
};

export type SidebarProps = {
  /** Read on every render: the dock refreshes in place, it is not rebuilt. */
  readonly read: () => PanelData;
  readonly theme: Theme;
  /** Shown inside the frame; the overlay needs it, the dock knows it is the sidebar. */
  readonly header: string | null;
  /** Repaint request, for the local state this component owns (`?`, `d`). */
  readonly requestRender: () => void;
  readonly onClose: () => void;
  /** Commands the component does not own: running git verbs is the host's job. */
  readonly onCommand: (command: PanelCommand) => void;
  /** Mouse targets, resolved by column and row against what was drawn. */
  readonly onAction?: (action: HitAction) => void;
  /** True when the panel holds the keyboard: the frame says so. */
  readonly isFocused?: () => boolean;
  /**
   * A key the panel does not own. Forwards it to the editor instead of dropping
   * it: a focused panel that silently eats typing reads as a frozen app.
   */
  readonly onUnhandledKey?: (data: string) => void;
};

const MIN_WIDTH = 24;
/** One frame column plus one column of padding on each side. */
export const CONTENT_OFFSET = 2;
/** How long the verb that was just pressed stays highlighted. */
const VERB_FLASH_MS = 2500;

export function createSidebar(props: SidebarProps): Component {
  const theme = props.theme;
  let helpVisible = false;
  let lastVerb: string | null = null;
  let flashedAt = 0;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let hits: HitMap = { regions: [], width: 0 };

  const render = (requested: number): string[] => {
    const width = Math.max(MIN_WIDTH, Math.floor(requested));
    const inner = width - 2;
    const column = inner - 2;
    const data = props.read();

    const focused = props.isFocused?.() === true;
    // The focused border is the only signal that the keyboard is not the editor's.
    const frame = (segment: string): string => theme.fg(focused ? "borderAccent" : "border", segment);
    const row = (styled: string): string => `${frame("│")} ${padToWidth(styled, column)} ${frame("│")}`;

    const context: SectionContext = {
      data,
      theme,
      column,
      row,
      helpLines: helpVisible ? keyMapLines() : null,
      lastVerb: lastVerb !== null && Date.now() - flashedAt < VERB_FLASH_MS ? lastVerb : null,
    };

    const sections: Section[] = [
      projectSection(context),
      changesSection(context),
      branchSection(context),
      actionsSection(context),
      resultSection(context),
      modelSection(context),
    ].filter((section) => section.lines.length > 0);

    const head: string[] = [frame(`╭${"─".repeat(inner)}╮`)];
    if (props.header !== null) {
      head.push(row(theme.fg("muted", props.header.slice(0, column))));
      head.push(row(""));
    } else if (focused) {
      head.push(row(theme.fg("accent", "panel focused") + theme.fg("muted", " · esc → editor")));
      head.push(row(""));
    } else {
      // Without this the dock looks inert: there is no other sign that it takes keys.
      head.push(row(theme.fg("muted", "alt+g focus")));
      head.push(row(""));
    }

    // Exactly one blank line between sections, never at the top or bottom.
    const body: string[] = [];
    const regions: HitMap["regions"][number][] = [];
    let rowIndex = head.length;
    sections.forEach((section, index) => {
      if (index > 0) {
        body.push(row(""));
        rowIndex += 1;
      }
      for (const line of section.lines) body.push(line);
      for (const hit of section.hits) {
        regions.push({
          row: rowIndex + hit.rowOffset,
          start: CONTENT_OFFSET + hit.start,
          end: CONTENT_OFFSET + hit.start + Math.max(0, hit.length - 1),
          action: hit.action,
        });
      }
      rowIndex += section.lines.length;
    });

    hits = { regions, width };
    return [...head, ...body, frame(`╰${"─".repeat(inner)}╯`)];
  };

  return {
    render,
    invalidate: () => {},

    handleInput(data: string): void {
      const command = resolvePanelCommand(data);
      if (command === null) {
        // Not ours: hand printable text to the editor rather than swallowing it.
        if (/^[\x20-\x7e]$/.test(data)) props.onUnhandledKey?.(data);
        return;
      }
      if (command === "close") {
        props.onClose();
        return;
      }
      if (command === "help") {
        helpVisible = !helpVisible;
        props.requestRender();
        return;
      }
      if (command === "fetch" || command === "pull" || command === "push" || command === "refresh") {
        lastVerb = command === "refresh" ? "refresh" : command;
        flashedAt = Date.now();
        if (flashTimer !== undefined) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => {
          flashTimer = undefined;
          props.requestRender();
        }, VERB_FLASH_MS);
        flashTimer.unref?.();
      }
      props.onCommand(command);
    },

    handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
      if (event.type !== "press" && event.type !== "click") return undefined;
      const action = hitTest(hits, event.x, event.y);
      if (action === null) return undefined;
      props.onAction?.(action);
      return { handled: true, focus: true };
    },
  };
}
