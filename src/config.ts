/**
 * `<agent-dir>/pi-click-sidebar.json`: defaults, validation, atomic creation.
 *
 * A bad file never blocks startup: every field falls back individually, the
 * unknown keys are reported once, and the resolved values stay readable from
 * `/sidebar config`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type Mode = "auto" | "dock" | "overlay" | "rail" | "off";

export type Timeouts = { readonly read: number; readonly network: number; readonly tree: number };

export type Config = {
  readonly mode: Mode;
  readonly dockWidth: number;
  readonly dockMinTerminalWidth: number;
  readonly refreshIntervalMs: number;
  readonly shortstatEveryNTicks: number;
  readonly showFileList: boolean;
  readonly accentOverride: string | null;
  readonly timeouts: Timeouts;
};

export type ConfigLoad = {
  readonly config: Config;
  readonly path: string;
  readonly warnings: readonly string[];
};

export const CONFIG_FILE_NAME = "pi-click-sidebar.json";

/**
 * Published schema. Written into the file on first run and ignored on read, so
 * an editor validates the file the extension itself is validating.
 */
export const CONFIG_SCHEMA_URL =
  "https://raw.githubusercontent.com/AdelysAlberto/pi-click-sidebar/main/schema/config.schema.json";

export const DEFAULT_CONFIG: Config = {
  mode: "auto",
  dockWidth: 34,
  dockMinTerminalWidth: 96,
  refreshIntervalMs: 6000,
  shortstatEveryNTicks: 3,
  showFileList: false,
  accentOverride: null,
  timeouts: { read: 3000, network: 60000, tree: 15000 },
};

const MODES: readonly Mode[] = ["auto", "dock", "overlay", "rail", "off"];
const KNOWN_KEYS: readonly string[] = [
  "$schema",
  "mode",
  "dockWidth",
  "dockMinTerminalWidth",
  "refreshIntervalMs",
  "shortstatEveryNTicks",
  "showFileList",
  "accentOverride",
  "timeouts",
];
const ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/;

type Field = Record<string, unknown>;

function isRecord(value: unknown): value is Field {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMode(value: unknown): value is Mode {
  return typeof value === "string" && MODES.some((mode) => mode === value);
}

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  const code: unknown = error.code;
  return typeof code === "string" ? code : undefined;
}

function cloneDefaults(): Config {
  return { ...DEFAULT_CONFIG, timeouts: { ...DEFAULT_CONFIG.timeouts } };
}

/** Agent directory, from the environment when Pi provides it. */
export function resolveAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["PI_CODING_AGENT_DIR"];
  if (configured !== undefined && configured.length > 0) return configured;
  return path.join(os.homedir(), ".pi", "agent");
}

export function configFilePath(agentDir: string): string {
  return path.join(agentDir, CONFIG_FILE_NAME);
}

function clampedInt(
  source: Field,
  key: string,
  fallback: number,
  min: number,
  max: number,
  warnings: string[],
  label: string = key,
): number {
  const raw = source[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    warnings.push(`${label}: expected a number, keeping ${fallback}`);
    return fallback;
  }
  const wanted = Math.round(raw);
  const value = Math.min(max, Math.max(min, wanted));
  if (value !== wanted) warnings.push(`${label}: ${wanted} is outside ${min}..${max}, using ${value}`);
  return value;
}

function flag(source: Field, key: string, fallback: boolean, warnings: string[]): boolean {
  const raw = source[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== "boolean") {
    warnings.push(`${key}: expected true or false, keeping ${fallback}`);
    return fallback;
  }
  return raw;
}

function mode(source: Field, warnings: string[]): Mode {
  const raw = source["mode"];
  if (raw === undefined) return DEFAULT_CONFIG.mode;
  if (isMode(raw)) return raw;
  warnings.push(`mode: expected ${MODES.join(" | ")}, keeping ${DEFAULT_CONFIG.mode}`);
  return DEFAULT_CONFIG.mode;
}

function accentOverride(source: Field, warnings: string[]): string | null {
  const raw = source["accentOverride"];
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" && ACCENT_PATTERN.test(raw)) return raw.toLowerCase();
  warnings.push("accentOverride: expected null or #rrggbb, keeping null");
  return null;
}

function timeouts(source: Field, warnings: string[]): Timeouts {
  const raw = source["timeouts"];
  if (raw === undefined) return DEFAULT_CONFIG.timeouts;
  if (!isRecord(raw)) {
    warnings.push("timeouts: expected an object, keeping defaults");
    return DEFAULT_CONFIG.timeouts;
  }
  const defaults = DEFAULT_CONFIG.timeouts;
  return {
    read: clampedInt(raw, "read", defaults.read, 500, 120_000, warnings, "timeouts.read"),
    network: clampedInt(raw, "network", defaults.network, 1000, 600_000, warnings, "timeouts.network"),
    tree: clampedInt(raw, "tree", defaults.tree, 1000, 120_000, warnings, "timeouts.tree"),
  };
}

/** Pure: validates an already parsed document, never throws. */
export function parseConfig(raw: unknown): { config: Config; warnings: string[] } {
  if (!isRecord(raw)) {
    const warnings = raw === undefined ? [] : ["config must be a JSON object, using defaults"];
    return { config: cloneDefaults(), warnings };
  }
  const warnings: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.includes(key)) warnings.push(`${key}: unknown key ignored`);
  }
  const config: Config = {
    mode: mode(raw, warnings),
    dockWidth: clampedInt(raw, "dockWidth", DEFAULT_CONFIG.dockWidth, 24, 48, warnings),
    dockMinTerminalWidth: clampedInt(raw, "dockMinTerminalWidth", DEFAULT_CONFIG.dockMinTerminalWidth, 80, 200, warnings),
    refreshIntervalMs: clampedInt(raw, "refreshIntervalMs", DEFAULT_CONFIG.refreshIntervalMs, 1000, 30_000, warnings),
    shortstatEveryNTicks: clampedInt(raw, "shortstatEveryNTicks", DEFAULT_CONFIG.shortstatEveryNTicks, 1, 10, warnings),
    showFileList: flag(raw, "showFileList", DEFAULT_CONFIG.showFileList, warnings),
    accentOverride: accentOverride(raw, warnings),
    timeouts: timeouts(raw, warnings),
  };
  return { config, warnings };
}

function writeDefaultFile(file: string, warnings: string[]): void {
  const temp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const document = { $schema: CONFIG_SCHEMA_URL, ...DEFAULT_CONFIG };
    fs.writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    fs.renameSync(temp, file);
  } catch {
    warnings.push(`${CONFIG_FILE_NAME}: could not be created at ${file}`);
  }
}

/** Reads, validates and, on a first run, creates the file. Never throws. */
export function loadConfig(agentDir: string): ConfigLoad {
  const file = configFilePath(agentDir);
  const warnings: string[] = [];
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT") {
      writeDefaultFile(file, warnings);
      return { config: cloneDefaults(), path: file, warnings };
    }
    warnings.push(`${CONFIG_FILE_NAME}: unreadable (${code ?? "unknown error"}), using defaults`);
    return { config: cloneDefaults(), path: file, warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    warnings.push(`${CONFIG_FILE_NAME}: invalid JSON, using defaults`);
    return { config: cloneDefaults(), path: file, warnings };
  }

  const result = parseConfig(parsed);
  return { config: result.config, path: file, warnings: result.warnings };
}

/**
 * Resolved values plus the file they came from, for `/sidebar config`.
 *
 * One string with newlines on purpose: Pi replaces a status line when another
 * info notification follows it immediately, so five notifications would leave
 * only the last one on screen.
 */
export function describeConfig(load: ConfigLoad): string {
  const config = load.config;
  return [
    `click-sidebar · config ${load.path}`,
    `mode ${config.mode} · dockWidth ${config.dockWidth} · dockMinTerminalWidth ${config.dockMinTerminalWidth}`,
    `refreshIntervalMs ${config.refreshIntervalMs} · shortstatEveryNTicks ${config.shortstatEveryNTicks} · showFileList ${String(config.showFileList)}`,
    `accentOverride ${config.accentOverride ?? "none"} · timeouts ${config.timeouts.read}/${config.timeouts.network}/${config.timeouts.tree}ms`,
  ].join("\n");
}

/** `/sidebar mode <name>`: validates the argument against the same list. */
export function parseModeArgument(value: string): Mode | null {
  return isMode(value) ? value : null;
}
