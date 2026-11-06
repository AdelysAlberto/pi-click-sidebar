/**
 * Extension entry point: flags, commands, and the panel wiring. No rendering
 * and no git parsing live here; see `docs/03-architecture.md` §1 for the
 * layering this file is the top of.
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describeConfig, loadConfig, resolveAgentDir, type ConfigLoad } from "../src/config.ts";
import { createPresenter } from "../src/host/present.ts";
import { NO_MODEL } from "../src/view/copy.ts";
import type { PanelData } from "../src/view/sidebar.ts";

const COMMAND = "sidebar";

export default function clickSidebar(pi: ExtensionAPI): void {
  const presenter = createPresenter();
  let cached: ConfigLoad | undefined;

  /** Loads once per session and reports each problem exactly once. */
  const config = (ctx: ExtensionContext): ConfigLoad => {
    if (cached === undefined) {
      cached = loadConfig(resolveAgentDir());
      for (const warning of cached.warnings) ctx.ui.notify(`click-sidebar: ${warning}`, "warning");
    }
    return cached;
  };

  pi.registerCommand(COMMAND, {
    description: "Open the click sidebar panel, or run `/sidebar config`",
    handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
      const load = config(ctx);
      const subcommand = args.trim().split(/\s+/)[0] ?? "";

      if (subcommand === "config") {
        ctx.ui.notify(describeConfig(load), "info");
        return;
      }
      if (subcommand !== "") {
        ctx.ui.notify("click-sidebar: usage: /sidebar [config]", "warning");
        return;
      }
      if (load.config.mode === "off") {
        ctx.ui.notify("click-sidebar: mode is off, see /sidebar config", "info");
        return;
      }
      await presenter.show(ctx, panelData(ctx));
    },
  });
}

/**
 * Slice 1 shows the session it can see without touching git: project and model.
 * Slice 2 replaces this with the real view model.
 */
function panelData(ctx: ExtensionContext): PanelData {
  const path = ctx.cwd;
  const name = path.split("/").filter((part) => part.length > 0).pop() ?? path;
  const model = ctx.model;
  const usage = ctx.getContextUsage();

  return {
    project: { name, path },
    changes: null,
    branch: null,
    model: {
      id: model?.id ?? NO_MODEL,
      thinking: ctx.thinkingLevel ?? "off",
      contextPercent: usage?.percent ?? null,
    },
    result: null,
    stale: false,
    gitMissing: false,
  };
}
