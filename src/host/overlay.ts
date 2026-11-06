/**
 * Overlay fallback host: shows the same panel as the dock, anchored top-right.
 *
 * It only exists because dock mode needs the host layout root. When the probe
 * fails or the terminal is too narrow, this is the documented alternative, so
 * it is deliberately a full-width-cost surface: it covers the transcript's
 * right columns while it is open and says so in its own header.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { HitAction } from "../view/hits.ts";
import type { PanelCommand } from "../view/keymap.ts";
import type { PanelData } from "../view/sidebar.ts";
import { createSidebar } from "../view/sidebar.ts";

export type PanelHostResult = "closed" | "unsupported";

export const OVERLAY_WIDTH = 36;
/** The branch modal needs room for two columns of branch names. */
export const MODAL_WIDTH = 44;

export type PanelRequest = {
  readonly read: () => PanelData;
  readonly header: string | null;
  /** Registers a repaint callback while the panel is open; returns the unsubscribe. */
  readonly attach: (listener: () => void) => () => void;
  /** Verbs and navigation: the host runs them, the component only names them. */
  readonly onCommand: (command: PanelCommand) => void;
  /** A click on a segment: the host decides what it means. */
  readonly onAction: (action: HitAction) => void;
  /** Hands the host a way to close the panel it opened (`alt+g` toggles). */
  readonly exposeClose: (close: () => void) => void;
};

export async function showPanel(ctx: ExtensionContext, request: PanelRequest): Promise<PanelHostResult> {
  if (ctx.mode !== "tui") return "unsupported";

  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) => {
      const detach = request.attach(() => tui.requestRender());
      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        detach();
        done(undefined);
      };
      request.exposeClose(close);
      const panel = createSidebar({
        read: request.read,
        theme,
        header: request.header,
        requestRender: () => tui.requestRender(),
        onClose: close,
        onCommand: request.onCommand,
        onAction: request.onAction,
      });
      return {
        render: (width: number) => panel.render(width),
        invalidate: () => panel.invalidate(),
        handleInput: (input: string) => panel.handleInput?.(input),
        dispose: () => detach(),
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
