/**
 * Mounting the dock lane, apart from the entry point so the wiring file stays
 * readable (and under the file ceiling).
 *
 * The dock needs the live TUI object, and the documented way to receive it is a
 * widget factory. The rail's factory already owns a render, so this probe widget
 * is registered and removed at once: it draws nothing, it exists only to hand
 * over the TUI.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PanelData } from "../view/sidebar.ts";
import type { PanelPresenter } from "./present.ts";

const PROBE_KEY = "click-sidebar-probe";

export type LaneMount = {
  readonly ctx: ExtensionContext;
  readonly presenter: PanelPresenter;
  /** Read on every render: the lane refreshes in place. */
  readonly read: () => PanelData;
};

/** Idempotent: the presenter reconciles when the lane is already wrapped. */
export function mountLane(mount: LaneMount): void {
  mount.ctx.ui.setWidget(
    PROBE_KEY,
    (tui) => {
      mount.presenter.mountDock(tui, mount.read);
      return { render: () => [], invalidate: () => {} };
    },
    { placement: "aboveEditor" },
  );
  mount.ctx.ui.setWidget(PROBE_KEY, undefined);
}
