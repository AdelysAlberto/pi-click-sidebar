import assert from "node:assert/strict";
import { test } from "node:test";
import { err } from "../result.ts";
import { createActionRunner } from "./action-runner.ts";

const config = {
  mode: "auto" as const,
  dockWidth: 34,
  dockMinTerminalWidth: 96,
  refreshIntervalMs: 6000,
  shortstatEveryNTicks: 3,
  showFileList: false,
  accentOverride: null,
  timeouts: { read: 3000, network: 60_000, tree: 15_000 },
};

const session = { cwd: "/tmp", modelId: "m", thinking: "off", contextPercent: null };

function makeRunner(options: { readonly hang?: boolean } = {}) {
  const notices: string[] = [];
  let repaints = 0;
  const ctx = {
    ui: {
      notify: (message: string) => notices.push(message),
      confirm: async () => false,
    },
  };
  const runner = createActionRunner({
    git: async (args, runOptions) => {
      const network = args[0] === "fetch" || args[0] === "pull" || args[0] === "push";
      if (options.hang === true && network) {
        // Only a network command can hang, and only the abort signal ends it:
        // local reads always finish, which is why they get no signal.
        // The real chain turns a cancelled child into this exact Result.
        const cancelled = err("timeout", "cancelled");
        assert.ok(runOptions.signal !== undefined, "a network command must be cancellable");
        if (runOptions.signal?.aborted === true) return cancelled;
        return new Promise((resolve) => {
          runOptions.signal?.addEventListener("abort", () => resolve(cancelled));
        });
      }
      const stdout = args[0] === "rev-parse" && args[1] === "--show-toplevel" ? "/tmp\n" : "";
      return { ok: true, value: { stdout, stderr: "", code: 0, truncated: false } };
    },
    ctx: () => ctx as never,
    config: () => config,
    session: () => session,
    repaint: () => {
      repaints += 1;
    },
    refresh: async () => {},
  });
  return { runner, notices, repaints: () => repaints };
}

test("a verb that is already running refuses a second one and says esc cancels", async () => {
  const { runner, notices } = makeRunner({ hang: true });
  const first = runner.run("fetch");
  await runner.run("pull");
  assert.equal(notices.length, 1);
  assert.match(notices[0] ?? "", /fetch is still running · esc cancels it/);
  assert.equal(runner.cancel(), true);
  await first;
  assert.equal(runner.state().running, null);
});

test("cancel settles the action and clears the running state", async () => {
  const { runner } = makeRunner({ hang: true });
  const run = runner.run("fetch");
  assert.equal(runner.state().running, "fetch");
  assert.equal(runner.cancel(), true);
  await run;
  assert.equal(runner.state().running, null);
  assert.equal(runner.state().result?.kind, "fail");
  assert.match(runner.state().result?.line ?? "", /✗ fetch · cancelled/);
});

test("cancelling nothing is not an error", () => {
  const { runner } = makeRunner();
  assert.equal(runner.cancel(), false);
});
