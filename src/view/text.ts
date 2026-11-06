/**
 * Column-aware text helpers shared by the dock, the rail and the modal.
 *
 * Every measurement goes through `visibleWidth` / `truncateToWidth`: a glyph
 * such as `⎇` or `✚` is not guaranteed one column wide in every terminal.
 */
import * as os from "node:os";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const ELLIPSIS = "…";

/** Right ellipsis: the head survives, the tail is cut. */
export function rightEllipsis(text: string, width: number): string {
  if (width <= 0) return "";
  return truncateToWidth(text, width, ELLIPSIS);
}

/** Middle ellipsis: keeps the first and last segment of a path. */
export function middleEllipsis(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  if (width <= 1) return ELLIPSIS;
  const parts = text.split("/").filter((part) => part.length > 0);
  const head = parts[0] ?? "";
  const tail = parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
  const candidate = tail.length > 0 && tail !== head ? `/${head}/${ELLIPSIS}/${tail}` : `${ELLIPSIS}${tail}`;
  if (visibleWidth(candidate) <= width) return candidate;
  // Out of room for both ends: keep the tail, which is the identifying part.
  const tailOnly = `${ELLIPSIS}/${tail}`;
  if (tail.length > 0 && visibleWidth(tailOnly) <= width) return tailOnly;
  return truncateToWidth(text, width, ELLIPSIS);
}

/** Pads to exactly `width` visible columns, truncating when it does not fit. */
export function padToWidth(styled: string, width: number): string {
  const visible = visibleWidth(styled);
  if (visible >= width) return truncateToWidth(styled, width, ELLIPSIS);
  return `${styled}${" ".repeat(width - visible)}`;
}

/** Two styled cells on one row: left aligned and right aligned. */
export function spread(left: string, right: string, width: number): string {
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  const gap = width - leftWidth - rightWidth;
  if (gap < 1) return truncateToWidth(`${left} ${right}`, width, ELLIPSIS);
  return `${left}${" ".repeat(gap)}${right}`;
}

/** `~/Projects/acme` for a path under the home directory, unchanged otherwise. */
export function displayPath(absolutePath: string, home: string = os.homedir()): string {
  if (home.length > 0 && absolutePath === home) return "~";
  if (home.length > 0 && absolutePath.startsWith(`${home}/`)) return `~${absolutePath.slice(home.length)}`;
  return absolutePath;
}

/**
 * Counts in at most three significant digits: `0`, `999`, `12.4k`, `1.2M`.
 * Fixed width keeps the dock's numeric column from jittering while streaming.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const size = Math.abs(value);
  const trim = (scaled: number): string => scaled.toFixed(1).replace(/\.0$/, "");
  if (size < 1000) return `${sign}${Math.round(size)}`;
  if (size < 1_000_000) return `${sign}${trim(size / 1000)}k`;
  if (size < 1_000_000_000) return `${sign}${trim(size / 1_000_000)}M`;
  return `${sign}${trim(size / 1_000_000_000)}G`;
}
