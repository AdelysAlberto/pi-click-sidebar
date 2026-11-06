/**
 * Opening the branch modal: reads the branches and the dirty count, shows the
 * component as an overlay, and runs the plan the modal hands back.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Config } from "../config.ts";
import { prepare, type Deps } from "../git/actions.ts";
import type { GitRun } from "../git/exec.ts";
import { listBranches } from "../git/refs.ts";
import { switchBranch } from "../git/switch.ts";
import { createBranchModal, type SubmitPlan } from "../view/branch-modal.ts";
import { MODAL_WIDTH } from "./overlay.ts";

export type BranchFlowDeps = {
  readonly git: GitRun;
  readonly cwd: string;
  readonly config: Config;
  readonly refresh: () => Promise<void>;
};

export type BranchIntent = "switch" | "create";

/** Returns a message for the modal, or `null` when the command worked. */
async function runPlan(deps: BranchFlowDeps, plan: SubmitPlan): Promise<string | null> {
  if (plan.kind === "blocked") return plan.reason;

  const callDeps: Deps = {
    run: deps.git,
    cwd: deps.cwd,
    timeouts: deps.config.timeouts,
    // Switching never asks a question; the modal already asked.
    confirm: async () => false,
  };

  const outcome = await switchBranch(callDeps, {
    base: plan.base,
    name: plan.kind === "create" ? plan.name : null,
  });

  if (!outcome.ok) {
    const detail = outcome.error.detail;
    return detail === undefined ? outcome.error.message : `${outcome.error.message} (${detail})`;
  }
  await deps.refresh();
  return null;
}

export async function openBranchModal(
  ctx: ExtensionContext,
  deps: BranchFlowDeps,
  intent: BranchIntent,
): Promise<void> {
  const prepared = await prepare({
    run: deps.git,
    cwd: deps.cwd,
    timeouts: deps.config.timeouts,
    confirm: async () => false,
  });
  if (!prepared.ok) {
    ctx.ui.notify(`click-sidebar: ${prepared.error.message}`, "warning");
    return;
  }

  const branches = await listBranches(deps.git, prepared.value.toplevel, deps.config.timeouts.read);
  if (!branches.ok) {
    ctx.ui.notify(`click-sidebar: ${branches.error.message}`, "warning");
    return;
  }

  await ctx.ui.custom<void>(
    (_tui, theme, _keybindings, done) => {
      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        done(undefined);
      };

      return createBranchModal({
        theme,
        branches: branches.value,
        current: prepared.value.branch,
        dirtyFiles: prepared.value.dirtyFiles,
        intent,
        onSubmit: async (plan) => {
          const failure = await runPlan(deps, plan);
          if (failure === null) close();
          return failure;
        },
        onClose: close,
        requestRender: () => _tui.requestRender(),
      });
    },
    { overlay: true, overlayOptions: { anchor: "center", width: MODAL_WIDTH, margin: 1 } },
  );
}
