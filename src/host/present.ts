import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PanelCommand } from "../view/keymap.ts";
import type { PanelData } from "../view/sidebar.ts";
import { createRail } from "../view/rail.ts";
import { OVERLAY_HEADER } from "../view/copy.ts";
import { OVERLAY_WIDTH, showPanel } from "./overlay.ts";

export { OVERLAY_WIDTH };

const RAIL_KEY = "click-sidebar-rail";

export type PresenterOptions = {
  /** Runs a verb the panel asked for. Slice 5 implements them; today: refresh only. */
  readonly onCommand: (command: PanelCommand) => void;
  /** A click on any rail segment. */
  readonly onRailOpen: () => void;
};

export type PanelPresenter = {
  show(ctx: ExtensionContext, read: () => PanelData): Promise<void>;
  /** Installs the one-line widget; idempotent per session. */
  mountRail(ctx: ExtensionContext, read: () => PanelData): void;
  unmountRail(ctx: ExtensionContext): void;
  /** Tells every mounted surface to repaint. Slice 4 adds the dock lane here. */
  repaint(): void;
  isOpen(): boolean;
  /** Closes the panel if one is open; used by the `alt+g` toggle. */
  closeOpen(): void;
};

/**
 * The only module that decides *where* the panel appears. Slice 4 inserts the
 * dock lane in front of the overlay; regular mode always lands on the rail.
 */
export function createPresenter(options: PresenterOptions): PanelPresenter {
  const listeners = new Set<() => void>();
  let closeCurrent: (() => void) | undefined;

  return {
    repaint(): void {
      for (const listener of listeners) listener();
    },

    isOpen: () => closeCurrent !== undefined,

    closeOpen(): void {
      closeCurrent?.();
    },

    mountRail(ctx: ExtensionContext, read: () => PanelData): void {
      ctx.ui.setWidget(
        RAIL_KEY,
        (tui, theme) => {
          listeners.add(() => tui.requestRender());
          // The rail owns regular mode; `tui.mode` follows the live renderer.
          return createRail({ read, theme, visible: () => tui.mode === "regular", onOpen: options.onRailOpen });
        },
        { placement: "aboveEditor" },
      );
    },

    unmountRail(ctx: ExtensionContext): void {
      ctx.ui.setWidget(RAIL_KEY, undefined);
    },

    async show(ctx: ExtensionContext, read: () => PanelData): Promise<void> {
      let result: Awaited<ReturnType<typeof showPanel>>;
      try {
        result = await showPanel(ctx, {
          read,
          header: OVERLAY_HEADER,
          onCommand: options.onCommand,
          exposeClose: (close) => {
            closeCurrent = () => {
              closeCurrent = undefined;
              close();
            };
          },
          attach: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        });
      } finally {
        closeCurrent = undefined;
      }
      if (result === "unsupported") {
        ctx.ui.notify("click-sidebar: the panel needs the interactive TUI", "warning");
      }
    },
  };
}
