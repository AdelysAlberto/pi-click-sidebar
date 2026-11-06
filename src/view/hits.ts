/**
 * Click targets inside the panel. The layout dispatcher delivers mouse
 * coordinates relative to the component's own box (`tui-alt-screen.js:648-660`),
 * so a target is a rectangle in panel coordinates and nothing else.
 *
 * The map is rebuilt on every render because the rows move with the data: a
 * section that appears or disappears shifts everything below it.
 */
import type { TuiMouseEvent } from "@earendil-works/pi-tui";

export type HitAction =
  | { readonly kind: "verb"; readonly verb: string }
  | { readonly kind: "branch" }
  | { readonly kind: "changes" }
  | { readonly kind: "project" };

export type HitRegion = {
  /** Row, zero-based, from the top of the panel frame. */
  readonly row: number;
  /** First column, zero-based, from the left edge of the frame. */
  readonly start: number;
  /** Last column, inclusive. */
  readonly end: number;
  readonly action: HitAction;
};

export type HitMap = { readonly regions: readonly HitRegion[]; readonly width: number };

export function hitTest(map: HitMap, x: number, y: number): HitAction | null {
  if (x < 0 || x >= map.width) return null;
  for (const region of map.regions) {
    if (region.row === y && x >= region.start && x <= region.end) return region.action;
  }
  return null;
}

/**
 * Whether a mouse event is the operator activating what is under the pointer.
 *
 * One physical click reaches a component **twice**: `press` on the way down and
 * a synthesised `click` on release (`pi-tui/dist/tui-alt-screen.js:721-742`
 * dispatches the press to the pressed target and then, for a release that did
 * not move, a `click` to the same target). Answering both ran every action
 * twice: a verb click started `fetch` and the second call was refused with
 * "fetch is still running", and the modal's `switch` button submitted twice.
 *
 * Only `click` activates. It is never emitted when the pointer moved between
 * press and release, and `left` keeps a right click from starting a write.
 */
export function isActivation(event: TuiMouseEvent): boolean {
  return event.type === "click" && event.button === "left";
}

/** A rectangle for one piece of text placed at `start` on `row`. */
export function region(row: number, start: number, text: string, action: HitAction): HitRegion {
  return { row, start, end: start + Math.max(0, text.length - 1), action };
}
