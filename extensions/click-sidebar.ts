/**
 * Extension entry point: config, timer, commands, and the panel wiring. No
 * rendering and no git parsing live here; see `docs/03-architecture.md` §1.
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describeConfig, loadConfig, resolveAgentDir, type ConfigLoad } from "../src/config.ts";
import { createGitRun } from "../src/git/exec.ts";
import { readSnapshot } from "../src/git/snapshot.ts";
import { createPresenter } from "../src/host/present.ts";
import { createRefresher, type Refresher } from "../src/host/refresh.ts";
import { NO_MODEL } from "../src/view/copy.ts";
import { buildPanelData, type SessionInfo } from "../src/view/model.ts";
import type { PanelData } from "../src/view/sidebar.ts";

const COMMAND = "sidebar";

export default function clickSidebar(pi: ExtensionAPI): void {
  const presenter = createPresenter();
  const git = createGitRun((command, args, options) => pi.exec(command, args, options));

  let cached: ConfigLoad | undefined;
  let refresher: Refresher | undefined;
  let session: SessionInfo = { cwd: ".", modelId: NO_MODEL, thinking: "off", contextPercent: null };
  let stale = false;

  /** Loads once per session and reports each problem exactly once. */
  const config = (ctx: ExtensionContext): ConfigLoad => {
    if (cached === undefined) {
      cached = loadConfig(resolveAgentDir());
      for (const warning of cached.warnings) ctx.ui.notify(`click-sidebar: ${warning}`, "warning");
    }
    return cached;
  };

  const sessionInfo = (ctx: ExtensionContext): SessionInfo => ({
    cwd: ctx.cwd,
    modelId: ctx.model?.id ?? NO_MODEL,
    thinking: ctx.thinkingLevel ?? "off",
    contextPercent: ctx.getContextUsage()?.percent ?? null,
  });

  const read = async (ctx: ExtensionContext, includeShortstat: boolean): Promise<PanelData> => {
    const settings = config(ctx).config;
    const result = await readSnapshot(git, {
      cwd: session.cwd,
      readTimeoutMs: settings.timeouts.read,
      includeShortstat,
    });
    const next = result.ok
      ? buildPanelData({ snapshot: result.value, error: null, session, stale: false })
      : buildPanelData({ snapshot: null, error: result.error, session, stale });
    stale = !result.ok;
    return next;
  };

  const initialData = (): PanelData => buildPanelData({ snapshot: null, error: null, session, stale: false });

  const start = (ctx: ExtensionContext): void => {
    const settings = config(ctx).config;
    session = sessionInfo(ctx);
    stale = false;
    refresher?.dispose();
    refresher = createRefresher({
      read: ({ includeShortstat }) => read(ctx, includeShortstat),
      initial: initialData(),
      intervalMs: settings.refreshIntervalMs,
      shortstatEveryNTicks: settings.shortstatEveryNTicks,
      onUpdate: () => presenter.repaint(),
    });
    refresher.start();
  };

  /** Refresh on the events that change what the panel shows, never a write. */
  const touch = (ctx: ExtensionContext): void => {
    session = sessionInfo(ctx);
    refresher?.markDirty();
  };

  pi.on("session_start", async (_event, ctx) => start(ctx));
  pi.on("turn_end", async (_event, ctx) => touch(ctx));
  pi.on("tool_execution_end", async (_event, ctx) => touch(ctx));
  pi.on("user_bash", async (_event, ctx) => touch(ctx));
  pi.on("model_select", async (_event, ctx) => touch(ctx));
  pi.on("session_compact", async (_event, ctx) => touch(ctx));
  pi.on("session_shutdown", async () => {
    refresher?.dispose();
    refresher = undefined;
  });

  pi.registerCommand(COMMAND, {
    description: "Open the click sidebar panel, or run `/sidebar config`",
    handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
      const settings = config(ctx).config;
      const subcommand = args.trim().split(/\s+/)[0] ?? "";

      if (subcommand === "config") {
        ctx.ui.notify(describeConfig(config(ctx)), "info");
        return;
      }
      if (subcommand !== "") {
        ctx.ui.notify("click-sidebar: usage: /sidebar [config]", "warning");
        return;
      }
      if (settings.mode === "off") {
        ctx.ui.notify("click-sidebar: mode is off, see /sidebar config", "info");
        return;
      }

      session = sessionInfo(ctx);
      await refresher?.refreshNow();
      await presenter.show(ctx, () => refresher?.current() ?? initialData());
    },
  });
}
