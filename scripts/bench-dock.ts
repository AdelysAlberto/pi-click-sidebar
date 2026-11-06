/** CLI-only benchmark: real Pi layout and Markdown; no terminal, model or git IO. */
import { performance } from "node:perf_hooks";
import { HStack, Markdown, ScrollView, VStack, type Component, type MarkdownTheme } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { mountDock } from "../src/host/dock.ts";

const style = (text: string): string => text;
const theme: MarkdownTheme = {
  heading: style, link: style, linkUrl: style, code: style, codeBlock: style,
  codeBlockBorder: style, quote: style, quoteBorder: style, hr: style,
  listBullet: style, bold: style, italic: style, strikethrough: style, underline: style,
};
const WIDTH = 160;
const HEIGHT = 45;
const FRAMES = 8;
const LANE_WIDTH = 34;

function benchmark(paragraphs: number, mode: "native" | "before" | "after"): void {
  const text = Array.from({ length: paragraphs }, (_, index) =>
    `## Step ${index}\n\n${"A transcript paragraph with **formatted text**, a result and an explanation. ".repeat(8)}`,
  ).join("\n\n");
  let rebuilds = 0;
  const markdown = new Markdown(text, 0, 0, theme, undefined, {
    transform: (source) => { rebuilds += 1; return source; },
  });
  const widths: number[] = [];
  const document: Component = {
    render: (width) => { widths.push(width); return markdown.render(width); },
    invalidate: () => markdown.invalidate(),
  };
  const transcript = new ScrollView(document, { primary: true });
  const editor: Component = { render: () => ["editor"], invalidate() {} };
  const lane: Component = { render: () => ["sidebar"], invalidate() {} };
  const host = new VStack([
    { component: transcript, basis: 0, grow: 1, minSize: 1 },
    { component: editor, basis: 1 },
  ]);
  let root: Component = host;
  if (mode === "before") {
    // Reproduce the pre-fix wrapper, leaving the transcript basis implicit.
    root = new HStack([
      { component: host, grow: 1, shrink: 1, minSize: 24 },
      { component: lane, basis: LANE_WIDTH, grow: 0, shrink: 0, minSize: 24, maxSize: 48 },
    ]);
  } else if (mode === "after") {
    const handle = mountDock({
      mode: "fullscreen",
      getMountedRoots: () => [root],
      setLayoutRoot: (component: Component | undefined) => { root = component ?? host; },
    }, { laneWidth: LANE_WIDTH, minTerminalWidth: 96, lane });
    if (handle === null) throw new Error("Benchmark dock failed to mount");
  }
  renderLayoutFrame(root, WIDTH, HEIGHT, () => {});
  rebuilds = 0;
  widths.length = 0;
  const start = performance.now();
  for (let frame = 0; frame < FRAMES; frame += 1) {
    transcript.scrollBy(3);
    renderLayoutFrame(root, WIDTH, HEIGHT, () => {});
  }
  console.log(JSON.stringify({
    paragraphs, mode, frames: FRAMES,
    msPerFrame: Number(((performance.now() - start) / FRAMES).toFixed(2)),
    markdownRebuilds: rebuilds,
    renderWidthsPerFrame: widths.slice(0, widths.length / FRAMES),
  }));
}

for (const paragraphs of [200, 1000]) {
  for (const mode of ["native", "before", "after"] as const) benchmark(paragraphs, mode);
}
