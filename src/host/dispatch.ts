/**
 * Turning a key or a click into work. Both paths land on the same commands, so
 * the keyboard is never a second-class route to a verb.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ActionRunner } from "./action-runner.ts";
import { describeUnavailable } from "./keymap.ts";
import type { HitAction } from "../view/hits.ts";
import type { PanelCommand } from "../view/keymap.ts";

export type DispatchDeps = {
  readonly ctx: () => ExtensionContext | undefined;
  readonly runner: ActionRunner;
  readonly openBranches: (ctx: ExtensionContext, intent: "switch" | "create") => Promise<void>;
  /** The absolute path the project segment shows. */
  readonly cwd: () => string;
  /** One immediate read of the tree, then a repaint. */
  readonly refresh: () => Promise<void>;
};

export type Dispatch = {
  command(command: PanelCommand): void;
  action(action: HitAction): void;
};

type Verb = "fetch" | "pull" | "push";

function isVerb(value: string): value is Verb {
  return value === "fetch" || value === "pull" || value === "push";
}

export function createDispatch(deps: DispatchDeps): Dispatch {
  const command = (input: PanelCommand): void => {
    const ctx = deps.ctx();
    if (ctx === undefined) return;

    if (input === "refresh") {
      void deps.refresh();
      return;
    }
    if (isVerb(input)) {
      void deps.runner.run(input);
      return;
    }
    if (input === "switch" || input === "new" || input === "run") {
      void deps.openBranches(ctx, input === "new" ? "create" : "switch");
      return;
    }
    const unavailable = describeUnavailable(input);
    if (unavailable !== null) ctx.ui.notify(`click-sidebar: ${unavailable}`, "info");
  };

  const action = (input: HitAction): void => {
    const ctx = deps.ctx();
    if (ctx === undefined) return;
    switch (input.kind) {
      case "verb":
        if (isVerb(input.verb)) command(input.verb);
        else if (input.verb === "refresh") command("refresh");
        return;
      case "branch":
        void deps.openBranches(ctx, "switch");
        return;
      case "changes":
        ctx.ui.notify("click-sidebar: the changed-file list arrives in a later slice", "info");
        return;
      case "project":
        ctx.ui.notify(`click-sidebar: ${deps.cwd()}`, "info");
        return;
    }
  };

  return { command, action };
}
