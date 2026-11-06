/**
 * The `/sidebar` command: `config`, `mode`, and the bare form that opens the
 * panel. Kept out of the entry point so the wiring file stays wiring.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describeConfig, parseModeArgument, type ConfigLoad, type Mode } from "../config.ts";
import type { PanelPresenter } from "./present.ts";

export type CommandDeps = {
  readonly load: (ctx: ExtensionContext) => ConfigLoad;
  readonly presenter: PanelPresenter;
  readonly openPanel: (ctx: ExtensionContext) => Promise<void>;
  /** Re-mounts the lane so a forced mode takes effect without a restart. */
  readonly refreshSurfaces: (ctx: ExtensionContext) => void;
  readonly setMode: (mode: Mode) => void;
  readonly currentMode: () => Mode;
};

const USAGE = "click-sidebar: usage: /sidebar [config | mode <auto|dock|overlay|rail|off>]";

export function createCommandHandler(deps: CommandDeps): (args: string, ctx: ExtensionContext) => Promise<void> {
  return async (args, ctx) => {
    const [subcommand = "", argument = ""] = args.trim().split(/\s+/);

    if (subcommand === "config") {
      ctx.ui.notify(describeConfig(deps.load(ctx)), "info");
      return;
    }

    if (subcommand === "mode") {
      const parsed = parseModeArgument(argument);
      if (parsed === null) {
        ctx.ui.notify(
          `click-sidebar: mode ${deps.currentMode()} · use /sidebar mode <auto|dock|overlay|rail|off>`,
          "info",
        );
        return;
      }
      deps.setMode(parsed);
      deps.refreshSurfaces(ctx);
      ctx.ui.notify(`click-sidebar: mode ${parsed} · surface ${deps.presenter.currentSurface()}`, "info");
      return;
    }

    if (subcommand !== "") {
      ctx.ui.notify(USAGE, "warning");
      return;
    }

    if (deps.load(ctx).config.mode === "off") {
      ctx.ui.notify("click-sidebar: mode is off, see /sidebar config", "info");
      return;
    }
    await deps.openPanel(ctx);
  };
}
