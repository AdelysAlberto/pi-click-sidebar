import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PanelData } from "../view/sidebar.ts";
import { OVERLAY_HEADER } from "../view/copy.ts";
import { OVERLAY_WIDTH, showPanel } from "./overlay.ts";

export { OVERLAY_WIDTH };

export type PanelPresenter = {
  show(ctx: ExtensionContext, read: () => PanelData): Promise<void>;
  /** Tells every open panel to repaint. Slice 4 adds the dock as another listener. */
  repaint(): void;
};

/**
 * The only module that decides *where* the panel appears. Slice 4 adds the dock
 * lane in front of the overlay; until then every path lands here.
 */
export function createPresenter(): PanelPresenter {
  const listeners = new Set<() => void>();

  return {
    repaint(): void {
      for (const listener of listeners) listener();
    },

    async show(ctx: ExtensionContext, read: () => PanelData): Promise<void> {
      const result = await showPanel(ctx, {
        read,
        header: OVERLAY_HEADER,
        attach: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      });
      if (result === "unsupported") {
        ctx.ui.notify("click-sidebar: the panel needs the interactive TUI", "warning");
      }
    },
  };
}
