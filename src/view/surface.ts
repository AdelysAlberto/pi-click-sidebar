/**
 * Which surface carries the panel right now. One pure decision, used by every
 * host, so the dock and the rail can never both claim the same frame or both
 * stay hidden.
 */
import type { Mode } from "../config.ts";

export type Surface = "dock" | "rail" | "overlay" | "off";

export type SurfaceInput = {
  readonly configured: Mode;
  /** False when the layout-root probe failed or the host is not a viewport TUI. */
  readonly dockSupported: boolean;
  /** `tui.mode`: `fullscreen` has a layout root, `regular` has none. */
  readonly tuiMode: string;
  readonly columns: number;
  readonly dockMinTerminalWidth: number;
};

/**
 * `auto` prefers the dock when the host allows it and the terminal is wide
 * enough, and the rail otherwise: a visible one-line summary beats a panel that
 * only appears on a keystroke. `overlay` is the explicit "cover the transcript"
 * choice, and `dock` degrades to the rail rather than to nothing.
 */
export function selectSurface(input: SurfaceInput): Surface {
  if (input.configured === "off") return "off";
  if (input.configured === "rail") return "rail";
  if (input.configured === "overlay") return "overlay";

  const usable =
    input.tuiMode === "fullscreen" && input.dockSupported && input.columns >= input.dockMinTerminalWidth;
  return usable ? "dock" : "rail";
}

/**
 * The lane width. `dockWidth` is the single knob; the terminal only caps it so
 * the transcript always keeps at least 24 columns of its own.
 */
export function laneWidth(columns: number, configured: number): number {
  const affordable = Math.max(24, columns - 24);
  return Math.max(24, Math.min(configured, affordable));
}
