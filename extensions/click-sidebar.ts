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
import { createGitRun } from "../src/git/exec.ts";
import { readSnapshot } from "../src/git/snapshot.ts";
import { createPresenter } from "../src/host/present.ts";
import { createRefresher, type Refresher } from "../src/host/refresh.ts";
import { describeUnavailable, registerToggle } from "../src/host/keymap.ts";
import type { HitAction } from "../src/view/hits.ts";
import type { PanelCommand } from "../src/view/keymap.ts";
import { NO_MODEL } from "../src/view/copy.ts";
import { buildPanelData, type SessionInfo } from "../src/view/model.ts";
import { createActionRunner } from "../src/host/action-runner.ts";
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

  /** Verbs reach the actions layer in slice 5 and the modal in slice 6. */
  const runCommand = (command: PanelCommand): void => {
    const ctx = activeCtx;
    if (ctx === undefined) return;
    if (command === "refresh") {
      refresher?.markDirty();
      void refresher?.refreshNow().then(() => presenter.repaint());
      return;
    }
    if (command === "fetch" || command === "pull" || command === "push") {
      void runner.run(command);
      return;
    }
    const unavailable = describeUnavailable(command);
    if (unavailable !== null) ctx.ui.notify(`click-sidebar: ${unavailable}`, "info");
  };

  /** A click on a segment: the same commands the keyboard reaches. */
  const runAction = (action: HitAction): void => {
    const ctx = activeCtx;
    if (ctx === undefined) return;
    switch (action.kind) {
      case "verb":
        runCommand(action.verb === "refresh" ? "refresh" : (action.verb as PanelCommand));
        return;
      case "branch":
        ctx.ui.notify("click-sidebar: switching branches arrives in slice 6", "info");
        return;
      case "changes":
        ctx.ui.notify("click-sidebar: the changed-file list arrives in a later slice", "info");
        return;
      case "project":
        ctx.ui.notify(`click-sidebar: ${session.cwd}`, "info");
        return;
    }
  };

  const presenter = createPresenter({
    onCommand: runCommand,
    onAction: runAction,
    onRailOpen: () => {
      const ctx = activeCtx;
      if (ctx !== undefined) void openPanel(ctx);
    },
    onBlur: () => presenter.blurDock(),
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
      onUpdate: () => {
        presenter.reconcile(currentData);
        presenter.repaint();
      },
    });
    refresher.start();
    presenter.mountRail(ctx, currentData);
    mountLane(ctx);
  };

  /**
   * The dock needs the live TUI object, and the documented way to receive it is
   * a widget factory. The rail's factory is the first one available, so the lane
   * is mounted from the widget that already owns a render.
   */
  const mountLane = (ctx: ExtensionContext): void => {
    ctx.ui.setWidget(
      "click-sidebar-probe",
      (tui) => {
        presenter.mountDock(tui, currentData);
        // The probe widget draws nothing; it exists to hand over the TUI.
        return { render: () => [], invalidate: () => {} };
      },
      { placement: "aboveEditor" },
    );
    ctx.ui.setWidget("click-sidebar-probe", undefined);
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
      mountLane(ctx);
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
