/**
 * Runs one verb at a time and owns the progress/result state the panel shows.
 *
 * Three rules that came from real use:
 * - the progress line ticks once per second, not five times: every repaint of
 *   the lane re-renders the whole frame, and on a long resumed transcript that
 *   is the difference between "working" and "crawling";
 * - an action can be cancelled. A `git fetch` to a remote that does not answer
 *   blocks until the network timeout, and watching a number grow for a minute
 *   with no way out reads as a freeze;
 * - `running` is cleared on every exit path, including a cancellation and a
 *   failure to even start, so the verb row can never lock itself out.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Config } from "../config.ts";
import { fetchRemote, pullFastForward, pushBranch, type Verb } from "../git/actions.ts";
import type { GitRun } from "../git/exec.ts";
import { failureLine, progress, success } from "../view/copy.ts";
import type { ActionState, SessionInfo } from "../view/model.ts";

export type ActionRunnerDeps = {
  readonly git: GitRun;
  readonly ctx: () => ExtensionContext | undefined;
  readonly config: () => Config;
  readonly session: () => SessionInfo;
  readonly repaint: () => void;
  /** Re-reads the tree after the action, so the panel reflects what happened. */
  readonly refresh: () => Promise<void>;
};

export type ActionRunner = {
  state(): ActionState;
  run(verb: Verb): Promise<void>;
  /** Aborts the action in flight; the promise settles and `running` clears. */
  cancel(): boolean;
  /** Clears the ticker. Safe to call twice. */
  dispose(): void;
};

const PROGRESS_INTERVAL_MS = 1000;
const RESULT_HOLD_MS = 6000;

export function createActionRunner(deps: ActionRunnerDeps): ActionRunner {
  let state: ActionState = { running: null, result: null };
  let ticker: ReturnType<typeof setInterval> | undefined;
  let abort: AbortController | undefined;

  const clearTicker = (): void => {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
  };

  /** Six seconds after a success the colour expires; one repaint is enough. */
  const scheduleFade = (): void => {
    if (state.result?.kind !== "ok") return;
    const timer = setTimeout(() => deps.repaint(), RESULT_HOLD_MS);
    timer.unref?.();
  };

  const run = async (verb: Verb): Promise<void> => {
    const ctx = deps.ctx();
    if (ctx === undefined) return;
    if (state.running !== null) {
      ctx.ui.notify(`click-sidebar: ${state.running} is still running · esc cancels it`, "warning");
      return;
    }

    let settings: Config;
    try {
      settings = deps.config();
    } catch {
      // A config that cannot be read must not leave the panel locked.
      state = { running: null, result: { kind: "fail", line: failureLine(verb, "configuration unavailable") } };
      deps.repaint();
      return;
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    abort = controller;
    state = { running: verb, result: { kind: "running", line: progress(verb, "0") } };
    deps.repaint();
    // One repaint per second: the elapsed figure changes once per second, so a
    // faster tick only re-renders the frame for nothing.
    ticker = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      state = { running: verb, result: { kind: "running", line: progress(verb, String(seconds)) } };
      deps.repaint();
    }, PROGRESS_INTERVAL_MS);

    const callDeps = {
      run: deps.git,
      cwd: deps.session().cwd,
      timeouts: settings.timeouts,
      signal: controller.signal,
      confirm: (message: string) => ctx.ui.confirm("click-sidebar", message),
    };

    try {
      const outcome =
        verb === "fetch"
          ? await fetchRemote(callDeps)
          : verb === "pull"
            ? await pullFastForward(callDeps)
            : await pushBranch(callDeps);

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (outcome.ok) {
        state = {
          running: null,
          result: { kind: "ok", line: success(verb, outcome.value.detail, seconds), at: Date.now() },
        };
      } else {
        // The error already speaks: `cancelled`, `timed out after Ns`, or git's own
        // sentence. Rewriting it here is how a cancellation became a fake timeout.
        state = { running: null, result: { kind: "fail", line: failureLine(verb, outcome.error.message) } };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state = { running: null, result: { kind: "fail", line: failureLine(verb, message) } };
    } finally {
      clearTicker();
      abort = undefined;
    }

    await deps.refresh();
    deps.repaint();
    scheduleFade();
  };

  return {
    state: () => state,
    run,
    cancel(): boolean {
      if (abort === undefined) return false;
      abort.abort();
      return true;
    },
    dispose: clearTicker,
  };
}
