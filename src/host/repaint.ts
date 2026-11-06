/**
 * Who wants a frame, and how many times.
 *
 * Two rules came from real use: a widget factory runs again on every remount
 * (`/sidebar mode`, a new session, `refreshSurfaces`), so a surface must
 * *replace* its listener instead of adding another one — a duplicated listener
 * made a single repaint render the frame once per past mount; and a listener
 * must not outlive the component it renders, or the old TUI is kept alive with
 * it.
 */
export type RepaintRegistry = {
  repaint(): void;
  /** Adds a listener and returns its detach. The overlay uses this. */
  listen(listener: () => void): () => void;
  /** Sets the single surface listener, dropping the previous one. The rail uses this. */
  replace(listener: () => void): void;
  /** Drops the surface listener: the rail was unmounted. */
  clear(): void;
};

export function createRepaint(): RepaintRegistry {
  const listeners = new Set<() => void>();
  let surface: (() => void) | undefined;

  const drop = (): void => {
    if (surface === undefined) return;
    listeners.delete(surface);
    surface = undefined;
  };

  return {
    repaint(): void {
      for (const listener of listeners) listener();
    },
    listen(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replace(listener: () => void): void {
      drop();
      listeners.add(listener);
      surface = listener;
    },
    clear(): void {
      drop();
    },
  };
}
