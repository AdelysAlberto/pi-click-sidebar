/**
 * Overlay fallback host: shows the same panel as the dock, anchored top-right.
 *
 * It only exists because dock mode needs the host layout root. When the probe
 * fails or the terminal is too narrow, this is the documented alternative, so
 * it is deliberately a full-width-cost surface: it covers the transcript's
 * right columns while it is open and says so in its own header.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PanelData } from "../view/sidebar.ts";
import { createSidebar } from "../view/sidebar.ts";

export type PanelHostResult = "closed" | "unsupported";

export const OVERLAY_WIDTH = 36;

export type PanelRequest = { readonly data: PanelData; readonly header: string | null };

export async function showPanel(ctx: ExtensionContext, request: PanelRequest): Promise<PanelHostResult> {
  if (ctx.mode !== "tui") return "unsupported";

  await ctx.ui.custom<void>(
    (_tui, theme, _keybindings, done) => {
      const panel = createSidebar({ data: request.data, theme, header: request.header, onClose: () => done(undefined) });
      return {
        render: (width: number) => panel.render(width),
        invalidate: () => panel.invalidate(),
        handleInput: (input: string) => panel.handleInput?.(input),
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "top-right",
        margin: 1,
        width: OVERLAY_WIDTH,
        maxHeight: "80%",
      },
    },
  );

  return "closed";
}
