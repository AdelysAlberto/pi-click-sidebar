import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIG_SCHEMA_URL,
  DEFAULT_CONFIG,
  describeConfig,
  loadConfig,
  parseConfig,
  resolveAgentDir,
} from "./config.ts";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("defaults survive an empty document", () => {
  const { config, warnings } = parseConfig({});
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.deepEqual(warnings, []);
});

test("the published $schema is written and never reported as unknown", () => {
  const { config, warnings } = parseConfig({ $schema: CONFIG_SCHEMA_URL, mode: "rail" });
  assert.equal(config.mode, "rail");
  assert.deepEqual(warnings, []);
});

test("unknown keys are reported once each and ignored", () => {
  const { config, warnings } = parseConfig({ nope: 1, mode: "dock" });
  assert.equal(config.mode, "dock");
  assert.deepEqual(warnings, ["nope: unknown key ignored"]);
});

test("out-of-range numbers clamp and say so", () => {
  const { config, warnings } = parseConfig({ dockWidth: 80, refreshIntervalMs: 10, shortstatEveryNTicks: 1.6 });
  assert.equal(config.dockWidth, 48);
  assert.equal(config.refreshIntervalMs, 1000);
  assert.equal(config.shortstatEveryNTicks, 2);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0] ?? "", /dockWidth: 80 is outside 24\.\.48, using 48/);
});

test("wrong types fall back field by field", () => {
  const { config, warnings } = parseConfig({
    mode: "sideways",
    showFileList: "yes",
    accentOverride: "cyan",
    timeouts: { read: "fast", network: 999_999 },
  });
  assert.equal(config.mode, "auto");
  assert.equal(config.showFileList, false);
  assert.equal(config.accentOverride, null);
  assert.equal(config.timeouts.read, DEFAULT_CONFIG.timeouts.read);
  assert.equal(config.timeouts.network, 600_000);
  assert.equal(warnings.length, 5);
});

test("a valid accent override is normalised", () => {
  const { config, warnings } = parseConfig({ accentOverride: "#22D3EE" });
  assert.equal(config.accentOverride, "#22d3ee");
  assert.deepEqual(warnings, []);
});

test("a non-object document falls back with one warning", () => {
  const { config, warnings } = parseConfig([1, 2, 3]);
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.deepEqual(warnings, ["config must be a JSON object, using defaults"]);
});

test("agent dir comes from the environment, then from the home directory", () => {
  assert.equal(resolveAgentDir({ PI_CODING_AGENT_DIR: "/tmp/agent" }), "/tmp/agent");
  assert.match(resolveAgentDir({}), /\.pi\/agent$/);
});

test("a missing file is created with the defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "click-sidebar-"));
  try {
    const load = loadConfig(dir);
    assert.deepEqual(load.config, DEFAULT_CONFIG);
    assert.deepEqual(load.warnings, []);
    const written: unknown = JSON.parse(readFileSync(load.path, "utf8"));
    assert.deepEqual(written, { $schema: CONFIG_SCHEMA_URL, ...DEFAULT_CONFIG });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a corrupted file falls back to defaults and warns once", () => {
  const dir = mkdtempSync(join(tmpdir(), "click-sidebar-"));
  try {
    const target = join(dir, "pi-click-sidebar.json");
    writeFileSync(target, "{ not json", "utf8");
    const load = loadConfig(dir);
    assert.deepEqual(load.config, DEFAULT_CONFIG);
    assert.equal(load.warnings.length, 1);
    assert.match(load.warnings[0] ?? "", /invalid JSON, using defaults/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("describeConfig names the file and every value in effect", () => {
  const dir = mkdtempSync(join(tmpdir(), "click-sidebar-"));
  try {
    const lines = describeConfig(loadConfig(dir)).split("\n");
    assert.equal(lines.length, 4);
    assert.match(lines[0] ?? "", /config .*pi-click-sidebar\.json$/);
    assert.match(lines[1] ?? "", /mode auto · dockWidth 34 · dockMinTerminalWidth 96/);
    assert.match(lines[3] ?? "", /accentOverride none · timeouts 3000\/60000\/15000ms/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
