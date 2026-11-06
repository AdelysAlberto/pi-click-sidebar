import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PanelData } from "../view/sidebar.ts";
import { OVERLAY_HEADER } from "../view/copy.ts";
import { OVERLAY_WIDTH, showPanel } from "./overlay.ts";

export { OVERLAY_WIDTH };

export type PanelPresenter = {
  show(ctx: ExtensionContext, data: PanelData): Promise<void>;
};

/**
 * The only module that decides *where* the panel appears. Slice 4 adds the dock
 * lane in front of the overlay; until then every path lands here.
 */
export function createPresenter(): PanelPresenter {
  return {
    async show(ctx: ExtensionContext, data: PanelData): Promise<void> {
      const result = await showPanel(ctx, { data, header: OVERLAY_HEADER });
      if (result === "unsupported") {
        ctx.ui.notify("click-sidebar: the panel needs the interactive TUI", "warning");
      }
    },
  };
}
