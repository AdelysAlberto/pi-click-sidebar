import assert from "node:assert/strict";
import { test } from "node:test";
import { createRefresher } from "./refresh.ts";
import type { PanelData } from "../view/sidebar.ts";

const data = (id: string): PanelData => ({
  project: null,
  changes: null,
  branch: null,
  model: { id, thinking: "off", contextPercent: null },
  result: null,
  running: null,
  stale: false,
  repository: "none",
});

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type BuildOptions = {
  readonly intervalMs?: number;
  readonly everyN?: number;
  readonly active?: () => boolean;
  readonly read?: (includeShortstat: boolean) => Promise<PanelData>;
};

function build(options: BuildOptions = {}) {
  /** One entry per read: whether that read also asked for `--shortstat`. */
  const reads: boolean[] = [];
  const updates: PanelData[] = [];
  const refresher = createRefresher({
    read: async ({ includeShortstat }) => {
      reads.push(includeShortstat);
      return options.read === undefined ? data("next") : options.read(includeShortstat);
    },
    initial: data("initial"),
    intervalMs: options.intervalMs ?? 50,
    shortstatEveryNTicks: options.everyN ?? 3,
    ...(options.active === undefined ? {} : { active: options.active }),
    onUpdate: (next) => updates.push(next),
  });
  return { refresher, reads, updates };
}

test("start reads at once, with the deltas, so the panel is never blank", async () => {
  const { refresher, reads } = build();
  refresher.start();
  await wait(5);
  assert.deepEqual(reads, [true]);
  refresher.dispose();
});

test("an idle tick that is not the shortstat tick spawns nothing", async () => {
  const { refresher, reads } = build({ intervalMs: 50 });
  refresher.start();
  await wait(10);
  assert.equal(reads.length, 1, "the first read");
  await wait(60);
  assert.equal(reads.length, 1, "tick 1 had nothing dirty and is not the third");
  await wait(100);
  assert.equal(reads.length, 2, "the third tick reads again");
  refresher.dispose();
});

test("an event marks the model dirty and the next tick reads", async () => {
  const { refresher, reads } = build({ intervalMs: 50 });
  refresher.start();
  await wait(10);
  refresher.markDirty();
  await wait(60);
  assert.equal(reads.length, 2);
  assert.deepEqual(reads, [true, true], "a dirty tick asks for the deltas too");
  refresher.dispose();
});

test("a read in flight is never overlapped", async () => {
  let release: (() => void) | undefined;
  let started = 0;
  const slow = new Promise<PanelData>((resolve) => {
    release = () => resolve(data("slow"));
  });
  const { refresher } = build({
    read: () => {
      started += 1;
      return slow;
    },
  });
  const first = refresher.refreshNow();
  await refresher.refreshNow();
  assert.equal(started, 1, "the second tick must be skipped, not queued");
  release?.();
  await first;
  refresher.dispose();
});

test("three failures slow the timer down instead of hammering the repo", async () => {
  let attempts = 0;
  const { refresher } = build({
    intervalMs: 20,
    read: async () => {
      attempts += 1;
      throw new Error("git is not there");
    },
  });
  refresher.start();
  await wait(200);
  const afterFailures = attempts;
  assert.equal(afterFailures, 3, `three reads, not one per interval: ${afterFailures}`);
  await wait(150);
  assert.equal(attempts, afterFailures, "after three failures the period is 15 s");
  refresher.dispose();
});

test("a model that has not changed does not repaint", async () => {
  const { refresher, updates } = build();
  await refresher.refreshNow();
  await refresher.refreshNow();
  assert.equal(updates.length, 1, "the first read differs from the initial model, the second does not");
  refresher.dispose();
});

test("nothing draws the model means nothing is read", async () => {
  let drawing = false;
  const { refresher, reads } = build({ active: () => drawing, intervalMs: 20 });
  refresher.start();
  await wait(80);
  assert.equal(reads.length, 0, "mode off must not spawn git");
  drawing = true;
  await refresher.refreshNow();
  assert.equal(reads.length, 1, "and switching the mode back resumes at once");
  refresher.dispose();
});

test("dispose stops the timer", async () => {
  const { refresher, reads } = build({ intervalMs: 20 });
  refresher.start();
  await wait(5);
  refresher.dispose();
  await wait(80);
  assert.equal(reads.length, 1);
  assert.equal(refresher.current().model.id, "next", "the last model is still readable");
});
