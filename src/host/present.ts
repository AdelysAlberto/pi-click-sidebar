import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { Config } from "../config.ts";
import type { HitAction } from "../view/hits.ts";
import type { PanelCommand } from "../view/keymap.ts";
import type { PanelData } from "../view/sidebar.ts";
import { createSidebar } from "../view/sidebar.ts";
import { createRail } from "../view/rail.ts";
import { selectSurface, type Surface } from "../view/surface.ts";
import { OVERLAY_HEADER } from "../view/copy.ts";
import { mountDock, probeDockSupport, type DockHandle } from "./dock.ts";
import { OVERLAY_WIDTH, showPanel } from "./overlay.ts";
import { createRepaint } from "./repaint.ts";

export { OVERLAY_WIDTH };

const RAIL_KEY = "click-sidebar-rail";

export type PresenterOptions = {
  readonly onCommand: (command: PanelCommand) => void;
  readonly onAction: (action: HitAction) => void;
  readonly onRailOpen: () => void;
  /** Leaving the panel with `esc` returns focus to whatever had it before. */
  readonly onBlur: () => void;
  /** Config as it is right now, so `/reload` is honest. */
  readonly config: () => Config;
  /** The live theme: compared by identity so a theme change rebuilds the lane. */
  readonly getTheme: () => Theme;
  /** A key the panel does not use: the editor gets it instead of losing it. */
  readonly forwardToEditor: (data: string) => void;
};

export type PanelPresenter = {
  show(ctx: ExtensionContext, read: () => PanelData): Promise<void>;
  /** Installs the rail widget; idempotent per session. */
  mountRail(ctx: ExtensionContext, read: () => PanelData): void;
  unmountRail(ctx: ExtensionContext): void;
  /** Wraps the host layout root when the dock is usable. False when it is not. */
  mountDock(tui: unknown, read: () => PanelData): boolean;
  /** Re-applies the wrapper if the host re-asserted its own root. */
  reconcile(read: () => PanelData): void;
  /** The surface in effect for a given width. */
  surface(columns: number): Surface;
  /** The surface in effect right now, from the terminal's own width. */
  currentSurface(): Surface;
  /** Whether a lane is wrapped into the layout root. */
  hasDock(): boolean;
  /** Focuses the lane, remembering who had focus; `alt+g` when it is already focused leaves. */
  toggleDockFocus(): void;
  /** Hands focus back to whoever had it before the lane took it. */
  blurDock(): void;
  repaint(): void;
  isOpen(): boolean;
  closeOpen(): void;
  /** Puts the host layout root back. Safe to call twice. */
  release(): void;
};

/**
 * The only module that decides *where* the panel appears. Every surface renders
 * the same component; what differs is who owns the frame.
 */
export function createPresenter(options: PresenterOptions): PanelPresenter {
  const frames = createRepaint();
  let closeCurrent: (() => void) | undefined;
  let dock: DockHandle | null = null;
  let laneTheme: Theme | undefined;
  let laneComponent: Component | undefined;
  let previousFocus: Component | null = null;
  let tuiHost: unknown;
  let tuiMode = "fullscreen";

  type FocusHost = {
    setFocus?: (component: Component | null) => void;
    getFocusedComponent?: () => Component | null;
  };

  const repaint = (): void => frames.repaint();

  const lane = (read: () => PanelData, theme: Theme): Component =>
    createSidebar({
      read,
      theme,
      header: null,
      requestRender: repaint,
      onClose: options.onBlur,
      onCommand: options.onCommand,
      onAction: options.onAction,
      isFocused: () => {
        const host = tuiHost as FocusHost | undefined;
        return laneComponent !== undefined && host?.getFocusedComponent?.() === laneComponent;
      },
      onUnhandledKey: (data) => {
        // Losing keystrokes because the panel had focus is worse than the
        // panel being display-only: hand the key over and give focus back.
        options.forwardToEditor(data);
        presenter.blurDock();
      },
    });

  const dockSupport = (): boolean => probeDockSupport(tuiHost).supported;

  /**
   * The lane is built once per mount. Focus and blur compare component
   * identity, so a second instance meant `getFocusedComponent()` never matched
   * the drawn panel: the frame never said "focused" and `alt+g` focused a
   * component nobody renders.
   */
  const mountLane = (tui: unknown, read: () => PanelData): DockHandle | null => {
    const theme = options.getTheme();
    const component = lane(read, theme);
    const handle = mountDock(tui, {
      laneWidth: options.config().dockWidth,
      minTerminalWidth: options.config().dockMinTerminalWidth,
      lane: component,
    });
    if (handle === null) return null;
    laneComponent = component;
    laneTheme = theme;
    return handle;
  };

  const surface = (columns: number): Surface =>
    selectSurface({
      configured: options.config().mode,
      dockSupported: dock !== null && dockSupport(),
      tuiMode,
      columns,
      dockMinTerminalWidth: options.config().dockMinTerminalWidth,
    });

  const presenter: PanelPresenter = {
    repaint,
    surface,
    currentSurface: () => surface(process.stdout.columns > 0 ? process.stdout.columns : 80),
    hasDock: () => dock !== null,

    toggleDockFocus(): void {
      const host = tuiHost as FocusHost | undefined;
      if (host?.getFocusedComponent === undefined || host.setFocus === undefined) return;
      if (laneComponent !== undefined && host.getFocusedComponent() === laneComponent) {
        presenter.blurDock();
        return;
      }
      previousFocus = host.getFocusedComponent() ?? null;
      if (laneComponent !== undefined) host.setFocus(laneComponent);
    },

    blurDock(): void {
      const host = tuiHost as FocusHost | undefined;
      if (host?.setFocus === undefined || laneComponent === undefined) return;
      if (host.getFocusedComponent?.() !== laneComponent) return;
      host.setFocus(previousFocus);
      previousFocus = null;
    },

    isOpen: () => closeCurrent !== undefined,
    closeOpen(): void {
      closeCurrent?.();
    },

    mountRail(ctx: ExtensionContext, read: () => PanelData): void {
      ctx.ui.setWidget(
        RAIL_KEY,
        (tui, widgetTheme) => {
          frames.replace(() => tui.requestRender());
          tuiMode = tui.mode;
          tuiHost = tui;
          return createRail({
            read,
            theme: widgetTheme,
            visible: (columns) => surface(columns) === "rail",
            onOpen: options.onRailOpen,
          });
        },
        { placement: "aboveEditor" },
      );
    },

    unmountRail(ctx: ExtensionContext): void {
      frames.clear();
      ctx.ui.setWidget(RAIL_KEY, undefined);
    },

    mountDock(tui: unknown, read: () => PanelData): boolean {
      if (!["auto", "dock"].includes(options.config().mode)) {
        presenter.release();
        return false;
      }
      tuiHost = tui;
      // Mounting twice would wrap the wrapper and draw two lanes; the second
      // call only has to make sure the existing one is still in place.
      if (dock !== null) {
        dock.reconcile();
        return true;
      }
      const handle = mountLane(tui, read);
      if (handle === null) return false;
      dock = handle;
      return true;
    },

    reconcile(read: () => PanelData): void {
      if (dock === null) return;
      const theme = options.getTheme();
      if (theme !== laneTheme) {
        // A theme change is a new component: the lane is not styled dynamically.
        dock.restore();
        dock = null;
        presenter.mountDock(tuiHost, read);
        return;
      }
      dock.reconcile();
    },

    async show(ctx: ExtensionContext, read: () => PanelData): Promise<void> {
      let result: Awaited<ReturnType<typeof showPanel>>;
      try {
        result = await showPanel(ctx, {
          read,
          header: OVERLAY_HEADER,
          onCommand: options.onCommand,
          onAction: options.onAction,
          onUnhandledKey: options.forwardToEditor,
          exposeClose: (close) => {
            closeCurrent = () => {
              closeCurrent = undefined;
              close();
            };
          },
          attach: (listener) => frames.listen(listener),
        });
      } finally {
        closeCurrent = undefined;
      }
      if (result === "unsupported") {
        ctx.ui.notify("click-sidebar: the panel needs the interactive TUI", "warning");
      }
    },

    release(): void {
      presenter.blurDock();
      dock?.restore();
      dock = null;
    },
  };

  return presenter;
}
