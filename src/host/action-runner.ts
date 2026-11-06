/**
 * Runs one verb at a time and owns the progress/result state the panel shows.
 *
 * The ticker that updates `⏵ fetch… 1.2s` exists only while an action runs and
 * is cleared with it: the refresh timer stays the single periodic timer
 * (`docs/03-architecture.md` §5), and this is a scoped exception with a known
 * lifetime, not a second scheduler.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Config } from "../config.ts";
import { fetchRemote, pullFastForward, pushBranch, type Verb } from "../git/actions.ts";
import type { GitRun } from "../git/exec.ts";
import { failureLine, progress, success, timeoutLine } from "../view/copy.ts";
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
  /** Clears the ticker. Safe to call twice. */
  dispose(): void;
};

const PROGRESS_INTERVAL_MS = 200;
const RESULT_HOLD_MS = 6000;

export function createActionRunner(deps: ActionRunnerDeps): ActionRunner {
  let state: ActionState = { running: null, result: null };
  let ticker: ReturnType<typeof setInterval> | undefined;

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
      ctx.ui.notify(`click-sidebar: ${state.running} is still running`, "warning");
      return;
    }

    const settings = deps.config();
    const startedAt = Date.now();
    state = { running: verb, result: { kind: "running", line: progress(verb, "0.0") } };
    deps.repaint();
    ticker = setInterval(() => {
      const tenths = ((Date.now() - startedAt) / 1000).toFixed(1);
      state = { running: verb, result: { kind: "running", line: progress(verb, tenths) } };
      deps.repaint();
    }, PROGRESS_INTERVAL_MS);

    const callDeps = {
      run: deps.git,
      cwd: deps.session().cwd,
      timeouts: settings.timeouts,
      confirm: (message: string) => ctx.ui.confirm("click-sidebar", message),
    };

    try {
      const outcome =
        verb === "fetch"
          ? await fetchRemote(callDeps)
          : verb === "pull"
            ? await pullFastForward(callDeps)
            : await pushBranch(callDeps);

      const tenths = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (outcome.ok) {
        state = {
          running: null,
          result: { kind: "ok", line: success(verb, outcome.value.detail, tenths), at: Date.now() },
        };
      } else {
        const reason =
          outcome.error.code === "timeout"
            ? timeoutLine(Math.round(settings.timeouts.network / 1000))
            : outcome.error.message;
        state = { running: null, result: { kind: "fail", line: failureLine(verb, reason) } };
      }
    } finally {
      clearTicker();
    }

    await deps.refresh();
    deps.repaint();
    scheduleFade();
  };

  return {
    state: () => state,
    run,
    dispose: clearTicker,
  };
}
