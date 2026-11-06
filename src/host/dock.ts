/**
 * The only module that touches the host layout root. Everything it does is
 * either documented on `TUI` or measured in `docs/01-feasibility.md` §6:
 *
 * - `getMountedRoots()` returns `[layoutRoot]` when one is set, else `children`
 *   (`pi-tui/dist/tui-alt-screen.js:153`). It is declared `protected`, which is
 *   a TypeScript-only restriction, so the probe reads it at runtime.
 * - `setLayoutRoot(component)` replaces what the frame renders (`:143`).
 * - The host re-asserts its own root on mount and on every `tuiMode` switch
 *   (`interactive-mode.js:610`, `:638`), which discards the wrapper. That is why
 *   `reconcile()` exists and why it runs on the refresh tick rather than once.
 *
 * A failure here never throws into the session: the probe answers, and the
 * caller falls back to the rail.
 */
import { type Component, HStack } from "@earendil-works/pi-tui";

type LayoutRootHost = {
  setLayoutRoot?: (component: Component | undefined) => void;
  getMountedRoots?: () => readonly Component[];
  mode?: string;
};

export type DockSupport = { readonly supported: true } | { readonly supported: false; readonly reason: string };

/** The single structural cast in the package, and the only place it lives. */
function asLayoutRootHost(tui: unknown): LayoutRootHost {
  const host = tui as Partial<LayoutRootHost>;
  return host;
}

export function probeDockSupport(tui: unknown): DockSupport {
  const host = asLayoutRootHost(tui);
  if (host.mode !== "fullscreen") return { supported: false, reason: `tui mode is ${String(host.mode)}` };
  if (typeof host.setLayoutRoot !== "function") return { supported: false, reason: "no setLayoutRoot" };
  if (typeof host.getMountedRoots !== "function") return { supported: false, reason: "no getMountedRoots" };
  return { supported: true };
}

export type DockHandle = {
  /** Re-applies the wrapper when the host has re-asserted its own root. */
  reconcile(): boolean;
  /** Puts the host's own root back. Idempotent, safe on shutdown. */
  restore(): void;
  /** Whether the wrapper is currently in place. */
  isMounted(): boolean;
};

export type DockOptions = {
  readonly laneWidth: number;
  /** Width threshold below which the lane removes itself from the stack. */
  readonly minTerminalWidth: number;
  readonly lane: Component;
};

/**
 * Wraps the host root in `[transcript | lane]`. Returns `null` when the probe
 * fails: the caller then keeps the rail, and nobody sees an exception.
 */
export function mountDock(tui: unknown, options: DockOptions): DockHandle | null {
  if (!probeDockSupport(tui).supported) return null;
  const host = asLayoutRootHost(tui);

  let wrapped: HStack | undefined;
  let hostRoot: Component | undefined;

  const reconcile = (): boolean => {
    const current = host.getMountedRoots?.()[0];
    if (current === undefined) return false;
    if (current === wrapped) return true;
    // The host re-asserted its own root, or a new renderer replaced it: in both
    // cases the thing to wrap is whatever is mounted now.
    hostRoot = current;
    wrapped = new HStack([
      // A numeric basis skips intrinsic-width measurement of the whole history.
      // Auto alternates full/docked widths each frame, evicting host render caches.
      { component: current, basis: 0, grow: 1, shrink: 1, minSize: 24 },
      {
        component: options.lane,
        basis: options.laneWidth,
        grow: 0,
        shrink: 0,
        minSize: 24,
        maxSize: 48,
        // The lane owns its own visibility so a resize needs no re-mount:
        // below the threshold it leaves the stack and the transcript reflows.
        visible: (viewport) => viewport.width >= options.minTerminalWidth,
      },
    ]);
    host.setLayoutRoot?.(wrapped);
    return true;
  };

  if (!reconcile()) return null;

  return {
    reconcile,
    restore(): void {
      if (hostRoot === undefined) return;
      if (host.getMountedRoots?.()[0] !== wrapped) return;
      host.setLayoutRoot?.(hostRoot);
      wrapped = undefined;
    },
    isMounted(): boolean {
      return wrapped !== undefined && host.getMountedRoots?.()[0] === wrapped;
    },
  };
}
