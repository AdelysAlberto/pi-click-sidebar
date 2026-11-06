/**
 * Focus and verb dispatch for the surfaces the panel lives in.
 *
 * `alt+g` is registered as a global shortcut, never as a swallowed keystroke:
 * the editor keeps every key it owns, and the panel only receives input while
 * the host has given it focus.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TOGGLE_SHORTCUT, type PanelCommand } from "../view/keymap.ts";

export type ToggleHandlers = {
  /** True when the overlay panel is already open. */
  readonly isOpen: () => boolean;
  readonly open: (ctx: ExtensionContext) => Promise<void>;
  readonly close: () => void;
  /** True when the lane is the surface in effect: then `alt+g` moves focus instead. */
  readonly hasDock: () => boolean;
  /** Focus the lane, or hand focus back when it already has it. */
  readonly toggleDockFocus: () => void;
};

/** Registers `alt+g`: open when closed, close when open. Never both. */
export function registerToggle(pi: ExtensionAPI, handlers: ToggleHandlers): void {
  pi.registerShortcut(TOGGLE_SHORTCUT, {
    description: "Toggle the click sidebar panel",
    handler: async (ctx) => {
      // With a lane on screen the panel is already there: the toggle is focus.
      if (handlers.hasDock()) {
        handlers.toggleDockFocus();
        return;
      }
      if (handlers.isOpen()) {
        handlers.close();
        return;
      }
      await handlers.open(ctx);
    },
  });
}

/** Commands that change the tree are refused until their slice lands, aloud. */
export function describeUnavailable(command: PanelCommand): string | null {
  switch (command) {
    case "fetch":
    case "pull":
    case "push":
      return `${command} arrives in slice 5`;
    case "switch":
    case "new":
      return `${command} arrives in slice 6`;
    case "run":
      return "nothing selected yet";
    case "toggle-files":
      return "the changed-file list arrives in a later slice";
    case "cursor-up":
    case "cursor-down":
      return null;
    default:
      return null;
  }
}
