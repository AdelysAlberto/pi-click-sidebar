/**
 * Extension entry point: config, timer, commands, and the panel wiring. No
 * rendering and no git parsing live here; see `docs/03-architecture.md` §1.
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_CONFIG,
  loadConfig,
  resolveAgentDir,
  type Config,
  type ConfigLoad,
  type Mode,
} from "../src/config.ts";
import { createCommandHandler } from "../src/host/commands.ts";
import { createDispatch } from "../src/host/dispatch.ts";
import { openBranchModal } from "../src/host/branch-flow.ts";
import { createGitRun } from "../src/git/exec.ts";
import { readSnapshot } from "../src/git/snapshot.ts";
import { createPresenter } from "../src/host/present.ts";
import { createRefresher, type Refresher } from "../src/host/refresh.ts";
import { registerToggle } from "../src/host/keymap.ts";
import { NO_MODEL } from "../src/view/copy.ts";
import { buildPanelData, type SessionInfo } from "../src/view/model.ts";
import { createActionRunner } from "../src/host/action-runner.ts";
import { mountLane } from "../src/host/lane.ts";
import type { PanelData } from "../src/view/sidebar.ts";

const COMMAND = "sidebar";

export default function clickSidebar(pi: ExtensionAPI): void {
  const git = createGitRun((command, args, options) => pi.exec(command, args, options));

  let cached: ConfigLoad | undefined;
  let refresher: Refresher | undefined;
  let activeCtx: ExtensionContext | undefined;
  let lastTheme: Theme | undefined;
  /** `/sidebar mode` forces a surface for this session; the file stays the SSOT. */
  let modeOverride: Mode | undefined;

  let session: SessionInfo = { cwd: ".", modelId: NO_MODEL, thinking: "off", contextPercent: null };
  let stale = false;

  const presenter = createPresenter({
    onCommand: (command) => dispatch.command(command),
    onAction: (action) => dispatch.action(action),
    onRailOpen: () => {
      const ctx = activeCtx;
      if (ctx !== undefined) void openPanel(ctx);
    },
    onBlur: () => {
      // esc first cancels the verb in flight; a second esc leaves the panel.
      if (runner.cancel()) return;
      presenter.blurDock();
    },
    forwardToEditor: (data: string) => {
      const ctx = activeCtx;
      if (ctx === undefined) return;
      // The panel had the keyboard and the key was not its own: put it where the
      // operator meant it, at the end of what the editor already holds.
      ctx.ui.setEditorText(`${ctx.ui.getEditorText()}${data}`);
    },
    config: (): Config => {
      const base = cached?.config ?? DEFAULT_CONFIG;
      return modeOverride === undefined ? base : { ...base, mode: modeOverride };
    },
    getTheme: () => {
      const ctx = activeCtx;
      if (ctx !== undefined) return ctx.ui.theme;
      if (lastTheme !== undefined) return lastTheme;
      throw new Error("click-sidebar: no theme available");
    },
  });

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

  const currentData = (): PanelData => refresher?.current() ?? initialData();

  const read = async (ctx: ExtensionContext, includeShortstat: boolean): Promise<PanelData> => {
    const settings = config(ctx).config;
    const result = await readSnapshot(git, {
      cwd: session.cwd,
      readTimeoutMs: settings.timeouts.read,
      includeShortstat,
    });
    const next = result.ok
      ? buildPanelData({ snapshot: result.value, error: null, session, stale: false, action: runner.state() })
      : buildPanelData({ snapshot: null, error: result.error, session, stale, action: runner.state() });
    stale = !result.ok;
    return next;
  };

  const initialData = (): PanelData =>
    buildPanelData({ snapshot: null, error: null, session, stale: false, action: runner.state() });

  const runner = createActionRunner({
    git,
    ctx: () => activeCtx,
    config: () => cached?.config ?? DEFAULT_CONFIG,
    session: () => session,
    repaint: () => presenter.repaint(),
    refresh: async () => {
      await refresher?.refreshNow();
    },
  });

  /** `s` and `n` both open the modal; `n` starts with the name field focused. */
  const dispatch = createDispatch({
    ctx: () => activeCtx,
    runner,
    openBranches: (ctx, intent) => openBranches(ctx, intent),
    cwd: () => session.cwd,
    refresh: async () => {
      await refresher?.refreshNow();
      presenter.repaint();
    },
  });

  const openBranches = async (ctx: ExtensionContext, intent: "switch" | "create"): Promise<void> => {
    const settings = config(ctx).config;
    if (settings.mode === "off") return;
    await openBranchModal(
      ctx,
      {
        git,
        cwd: session.cwd,
        config: settings,
        refresh: async () => {
          await refresher?.refreshNow();
          presenter.repaint();
        },
      },
      intent,
    );
    // Closing the modal leaves the operator in the editor, not in the lane.
    presenter.blurDock();
  };

  const openPanel = async (ctx: ExtensionContext): Promise<void> => {
    const settings = config(ctx).config;
    if (settings.mode === "off") {
      ctx.ui.notify("click-sidebar: mode is off, see /sidebar config", "info");
      return;
    }
    activeCtx = ctx;
    session = sessionInfo(ctx);
    await refresher?.refreshNow();
    await presenter.show(ctx, currentData);
  };

  const start = (ctx: ExtensionContext): void => {
    const settings = config(ctx).config;
    activeCtx = ctx;
    lastTheme = ctx.ui.theme;
    session = sessionInfo(ctx);
    stale = false;
    refresher?.dispose();
    refresher = createRefresher({
      read: ({ includeShortstat }) => read(ctx, includeShortstat),
      initial: initialData(),
      intervalMs: settings.refreshIntervalMs,
      shortstatEveryNTicks: settings.shortstatEveryNTicks,
      // `mode: off` draws nothing, so the tick would spawn git for a panel that
      // does not exist. The timer keeps running, so a mode switch needs no remount.
      active: () => (modeOverride ?? cached?.config.mode ?? DEFAULT_CONFIG.mode) !== "off",
      onUpdate: () => {
        presenter.reconcile(currentData);
        presenter.repaint();
      },
    });
    refresher.start();
    presenter.mountRail(ctx, currentData);
    mountLane({ ctx, presenter, read: currentData });
  };

  /** Refresh on the events that change what the panel shows, never a write. */
  const touch = (ctx: ExtensionContext): void => {
    activeCtx = ctx;
    lastTheme = ctx.ui.theme;
    session = sessionInfo(ctx);
    refresher?.markDirty();
  };

  pi.on("session_start", async (_event, ctx) => start(ctx));
  pi.on("turn_end", async (_event, ctx) => touch(ctx));
  pi.on("tool_execution_end", async (_event, ctx) => touch(ctx));
  pi.on("user_bash", async (_event, ctx) => touch(ctx));
  pi.on("model_select", async (_event, ctx) => touch(ctx));
  pi.on("session_compact", async (_event, ctx) => touch(ctx));
  pi.on("session_shutdown", async (_event, ctx) => {
    presenter.release();
    presenter.unmountRail(ctx);
    runner.dispose();
    refresher?.dispose();
    refresher = undefined;
    activeCtx = undefined;
  });

  registerToggle(pi, {
    isOpen: () => presenter.isOpen(),
    open: (ctx) => openPanel(ctx),
    close: () => presenter.closeOpen(),
    hasDock: () => presenter.hasDock() && presenter.currentSurface() === "dock",
    toggleDockFocus: () => presenter.toggleDockFocus(),
  });

  const command = createCommandHandler({
    load: config,
    presenter,
    openPanel,
    refreshSurfaces: (ctx) => {
      mountLane({ ctx, presenter, read: currentData });
      presenter.reconcile(currentData);
      presenter.repaint();
    },
    setMode: (mode) => {
      modeOverride = mode;
    },
    currentMode: () => modeOverride ?? cached?.config.mode ?? DEFAULT_CONFIG.mode,
  });

  pi.registerCommand(COMMAND, {
    description: "Open the click sidebar panel, or run `/sidebar config`",
    handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => command(args, ctx),
  });
}
