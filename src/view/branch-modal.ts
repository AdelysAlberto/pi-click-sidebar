/**
 * The branch modal: choose a base, optionally type a name, submit once.
 *
 * The operator's real question is "where does the new branch start?", so the
 * base is shown and selected before the name is typed, and `switch -c name base`
 * creates the branch **from that base** without moving the working tree first.
 */
import type { Component } from "@earendil-works/pi-tui";
import { Input, Key, matchesKey } from "@earendil-works/pi-tui";
import { padToWidth, rightEllipsis } from "./text.ts";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Branch } from "../git/refs.ts";

export type SubmitPlan =
  | { readonly kind: "switch"; readonly base: string }
  | { readonly kind: "create"; readonly base: string; readonly name: string }
  | { readonly kind: "blocked"; readonly reason: string };

const RESERVED = /[\s~^:?*[\\]/;

/**
 * Pure decision for the enter key. Invalid names are refused here, with the
 * reason, before any process runs; `check-ref-format` still has the last word
 * for the cases this cannot see.
 */
export function planSubmit(input: {
  readonly base: string | null;
  readonly name: string;
  readonly dirtyFiles: number;
}): SubmitPlan {
  if (input.base === null) return { kind: "blocked", reason: "no base branch selected" };
  if (input.dirtyFiles > 0) {
    const plural = input.dirtyFiles === 1 ? "file" : "files";
    return { kind: "blocked", reason: `${input.dirtyFiles} uncommitted ${plural} · commit or discard first` };
  }

  const name = input.name.trim();
  if (name.length === 0) return { kind: "switch", base: input.base };
  if (name.startsWith("-")) return { kind: "blocked", reason: "a branch name cannot start with -" };
  if (name !== input.name) return { kind: "blocked", reason: "no leading or trailing spaces" };
  if (name.startsWith("/") || name.endsWith("/")) return { kind: "blocked", reason: "no leading or trailing /" };
  if (name.includes("..")) return { kind: "blocked", reason: "cannot contain .." };
  if (name.includes("//")) return { kind: "blocked", reason: "cannot contain //" };
  if (name.endsWith(".lock")) return { kind: "blocked", reason: "cannot end with .lock" };
  if (RESERVED.test(name)) return { kind: "blocked", reason: "no spaces or ~ ^ : ? * [ \\" };
  return { kind: "create", base: input.base, name };
}

export type BranchModalProps = {
  readonly theme: Theme;
  readonly branches: readonly Branch[];
  readonly current: string | null;
  readonly dirtyFiles: number;
  /** `create` starts with the name field focused. */
  readonly intent: "switch" | "create";
  /** Returns an error to show and keep the text, or `null` when it worked. */
  readonly onSubmit: (plan: SubmitPlan) => Promise<string | null>;
  readonly onClose: () => void;
  readonly requestRender: () => void;
};

export function createBranchModal(props: BranchModalProps): Component {
  const theme = props.theme;
  const currentIndex = props.branches.findIndex((branch) => branch.name === props.current);
  let selected = currentIndex >= 0 ? currentIndex : 0;
  let focus: "list" | "input" = props.intent === "create" ? "input" : "list";
  let name = "";
  let error: string | null = null;
  let busy = false;

  const input = new Input();
  input.setValue("");

  const base = (): string | null => props.branches[selected]?.name ?? null;

  const submit = async (): Promise<void> => {
    if (busy) return;
    const plan = planSubmit({ base: base(), name, dirtyFiles: props.dirtyFiles });
    if (plan.kind === "blocked") {
      error = plan.reason;
      props.requestRender();
      return;
    }
    busy = true;
    error = null;
    props.requestRender();
    const failure = await props.onSubmit(plan);
    busy = false;
    if (failure !== null) {
      // The text stays: a rejected name must be editable, not retyped.
      error = failure;
      props.requestRender();
    }
  };

  return {
    render(width: number): string[] {
      const inner = Math.max(24, width) - 2;
      const column = inner - 2;
      const frame = (segment: string): string => theme.fg("border", segment);
      // padToWidth measures columns and keeps escape codes intact: padEnd/slice
      // on styled text both miscounts and can cut a sequence in half.
      const line = (text: string): string => `${frame("│")} ${padToWidth(text, column)} ${frame("│")}`;

      const rows: string[] = [frame(`╭─ ${props.intent === "create" ? "new branch" : "switch branch"} ${"─".repeat(Math.max(0, inner - 16))}╮`)];
      rows.push(line(theme.fg("accent", theme.bold("base"))));
      for (const [index, branch] of props.branches.entries()) {
        const marker = index === selected ? theme.fg("accent", ">") : " ";
        const label = branch.name === props.current ? `${branch.name} (current)` : branch.name;
        const fitted = rightEllipsis(label, Math.max(4, column - 2));
        const styled = index === selected ? theme.bold(fitted) : theme.fg("text", fitted);
        rows.push(line(`${marker} ${styled}`));
      }
      if (props.branches.length === 0) rows.push(line(theme.fg("dim", "no branches")));

      rows.push(line(""));
      rows.push(line(theme.fg("accent", theme.bold("name"))));
      input.focused = focus === "input";
      const field = Math.max(8, column - 2);
      const inputLines = input.render(field);
      rows.push(line(`┌${"─".repeat(field)}┐`));
      rows.push(line(`│${padToWidth(inputLines[0] ?? "", field)}│`));
      rows.push(line(`└${"─".repeat(field)}┘`));

      if (error !== null) rows.push(line(theme.fg("error", error.slice(0, column))));
      else if (props.dirtyFiles > 0) {
        const plural = props.dirtyFiles === 1 ? "file" : "files";
        rows.push(line(theme.fg("warning", `${props.dirtyFiles} uncommitted ${plural} · commit or discard first`)));
      }
      if (busy) rows.push(line(theme.fg("accent", "working…")));

      const action = props.dirtyFiles > 0 ? theme.fg("dim", "[ switch ]") : theme.fg("text", "[ switch ]");
      rows.push(line(""));
      rows.push(line(`${action}  ${theme.fg("muted", "[ cancel ]")}  ${theme.fg("dim", "tab name · enter · esc")}`));
      rows.push(frame(`╰${"─".repeat(inner)}╯`));
      return rows;
    },

    invalidate: () => input.invalidate(),

    handleInput(data: string): void {
      if (matchesKey(data, Key.escape)) {
        props.onClose();
        return;
      }
      if (matchesKey(data, Key.tab)) {
        focus = focus === "list" ? "input" : "list";
        props.requestRender();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        void submit();
        return;
      }
      if (focus === "list") {
        if (matchesKey(data, Key.up)) {
          selected = selected === 0 ? Math.max(0, props.branches.length - 1) : selected - 1;
          props.requestRender();
          return;
        }
        if (matchesKey(data, Key.down)) {
          selected = props.branches.length === 0 ? 0 : (selected + 1) % props.branches.length;
          props.requestRender();
          return;
        }
        // Typing while the list has focus moves to the field instead of being lost.
        if (/^[\x20-\x7e]$/.test(data)) {
          focus = "input";
          name = data;
          input.setValue(name);
          props.requestRender();
        }
        return;
      }

      input.handleInput(data);
      name = input.getValue();
      error = null;
      props.requestRender();
    },
  };
}
