import assert from "node:assert/strict";
import { test } from "node:test";
import { ScrollView, VStack, type Component } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { mountDock } from "./dock.ts";

/** Exercise Pi's real layout pass, not HStack.render's unbounded fallback. */
function transcriptFixture() {
  const widths: number[] = [];
  const document: Component = {
    render(width) {
      widths.push(width);
      return Array.from({ length: 1000 }, (_, index) => `history ${index}`);
    },
    invalidate() {},
  };
  const transcript = new ScrollView(document, { primary: true });
  const editor: Component = { render: () => ["editor"], invalidate() {} };
  const hostRoot = new VStack([
    { component: transcript, basis: 0, grow: 1, minSize: 1 },
    { component: editor, basis: 1 },
  ]);
  let root: Component = hostRoot;
  const tui = {
    mode: "fullscreen",
    getMountedRoots: () => [root],
    setLayoutRoot(component: Component | undefined) {
      root = component ?? hostRoot;
    },
  };
  const lane: Component = { render: () => ["sidebar"], invalidate() {} };
  const handle = mountDock(tui, { laneWidth: 34, minTerminalWidth: 96, lane });
  assert.ok(handle);
  const frame = (width = 160) => renderLayoutFrame(root, width, 45, () => {});
  return { widths, transcript, hostRoot, tui, handle, frame };
}

test("scrolling a docked transcript never measures it at the full terminal width", () => {
  const fixture = transcriptFixture();
  fixture.frame();
  fixture.widths.length = 0;
  for (let index = 0; index < 5; index += 1) {
    fixture.transcript.scrollBy(3);
    const frame = fixture.frame();
    assert.equal(frame.primaryScrollView, fixture.transcript);
    assert.match(frame.lines[0] ?? "", new RegExp(`history ${3 * (index + 1)}`));
    assert.match(frame.lines[0] ?? "", /sidebar/);
    assert.match(frame.lines[44] ?? "", /editor/);
  }
  assert.ok(fixture.widths.length > 0);
  assert.deepEqual([...new Set(fixture.widths)], [126]);
});

test("narrow resize, wide resize and reconcile preserve the transcript width budget", () => {
  const fixture = transcriptFixture();
  fixture.frame(80);
  assert.deepEqual([...new Set(fixture.widths)], [80]);
  fixture.widths.length = 0;
  fixture.frame(160);
  assert.deepEqual([...new Set(fixture.widths)], [126]);
  fixture.tui.setLayoutRoot(fixture.hostRoot);
  fixture.handle.reconcile();
  fixture.widths.length = 0;
  fixture.frame(160);
  assert.deepEqual([...new Set(fixture.widths)], [126]);
});
