/**
 * One timer for the whole extension. A second timer is a bug, not a layout
 * choice (docs/03-architecture.md §5).
 *
 * A tick never overlaps itself, `--shortstat` runs only every Nth tick, the
 * render callback fires only when the model actually changed, and three
 * consecutive failures slow the timer down instead of hammering a broken repo.
 */
import type { PanelData } from "../view/sidebar.ts";

export type Refresher = {
  start(): void;
  stop(): void;
  /** The current model, always safe to read. */
  current(): PanelData;
  /** Queues one tick on the next timer interval instead of doing work now. */
  markDirty(): void;
  /** Runs one tick now: the caller awaits it (opening the panel, finishing an action). */
  refreshNow(): Promise<void>;
  dispose(): void;
};

export type RefresherOptions = {
  readonly read: (context: { readonly includeShortstat: boolean }) => Promise<PanelData>;
  readonly initial: PanelData;
  readonly intervalMs: number;
  readonly shortstatEveryNTicks: number;
  /** Called with the new model only when it differs from the previous one. */
  readonly onUpdate: (data: PanelData) => void;
  readonly onError?: (error: unknown) => void;
};

const STALE_AFTER_FAILURES = 3;
const SLOW_INTERVAL_MS = 15_000;

export function createRefresher(options: RefresherOptions): Refresher {
  let data = options.initial;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ticks = 0;
  let failures = 0;
  let inFlight = false;
  let dirty = true;
  let stopped = false;

  const period = (): number => (failures >= STALE_AFTER_FAILURES ? Math.max(SLOW_INTERVAL_MS, options.intervalMs) : options.intervalMs);

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = undefined;
      void tick();
    }, period());
    timer.unref?.();
  };

  const runTick = async (force: boolean): Promise<void> => {
    if (stopped || inFlight) return;
    if (!force && !dirty && ticks % options.shortstatEveryNTicks !== 0) {
      ticks += 1;
      return;
    }

    inFlight = true;
    const includeShortstat = force || dirty || ticks % options.shortstatEveryNTicks === 0;
    ticks += 1;
    dirty = false;

    try {
      const next = await options.read({ includeShortstat });
      failures = 0;
      if (JSON.stringify(next) !== JSON.stringify(data)) {
        data = next;
        options.onUpdate(next);
      }
    } catch (error) {
      failures += 1;
      options.onError?.(error);
    } finally {
      inFlight = false;
    }
  };

  const tick = async (): Promise<void> => {
    await runTick(false);
    schedule();
  };

  return {
    start(): void {
      if (stopped || timer !== undefined) return;
      // First read now: a panel that waits one interval shows an empty model.
      void tick();
    },
    stop(): void {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
    current: () => data,
    markDirty(): void {
      dirty = true;
    },
    async refreshNow(): Promise<void> {
      await runTick(true);
    },
    dispose(): void {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
