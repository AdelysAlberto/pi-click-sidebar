/**
 * Which key means what while the panel has focus. Pure: it reads the input
 * string and answers with a command, so the component can stay a renderer and
 * the host can stay the only place that runs anything.
 *
 * The panel never owns a key the editor needs: it only sees input while it has
 * focus, and `alt+g` is a global shortcut rather than a hijacked keystroke.
 */
import { Key, matchesKey, type KeyId } from "@earendil-works/pi-tui";

export type PanelCommand =
  | "close"
  | "help"
  | "refresh"
  | "toggle-files"
  | "cursor-up"
  | "cursor-down"
  | "run"
  | "fetch"
  | "pull"
  | "push"
  | "switch"
  | "new";

type Binding = { readonly command: PanelCommand; readonly keys: readonly KeyId[] };

const BINDINGS: readonly Binding[] = [
  { command: "close", keys: [Key.escape] },
  { command: "run", keys: [Key.enter] },
  { command: "cursor-up", keys: [Key.up, "k"] },
  { command: "cursor-down", keys: [Key.down, "j"] },
  { command: "help", keys: ["?"] },
  { command: "toggle-files", keys: ["d"] },
  { command: "refresh", keys: ["r"] },
  { command: "fetch", keys: ["f"] },
  { command: "pull", keys: ["p"] },
  { command: "push", keys: ["u"] },
  { command: "switch", keys: ["s"] },
  { command: "new", keys: ["n"] },
];

/** `null` means "not mine": the caller decides whether to forward the input. */
export function resolvePanelCommand(data: string): PanelCommand | null {
  for (const binding of BINDINGS) {
    if (binding.keys.some((key) => matchesKey(data, key))) return binding.command;
  }
  return null;
}

/** The key map shown by `?`, derived from the bindings above so it cannot drift. */
export function keyMapLines(): readonly string[] {
  return [
    "f fetch   p pull    u push",
    "s switch  n new     r refresh",
    "j/k move  enter run d files",
    "esc close ? keys",
  ];
}

/** The global toggle. Kept as a constant so the README and the rail agree. */
export const TOGGLE_SHORTCUT = "alt+g";
