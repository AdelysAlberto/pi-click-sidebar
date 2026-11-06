# pi-click-sidebar — repository contract

> Harness-global rules (response language, documentation frontmatter, agent routing, universal
> engineering invariants) live in `~/.pi/agent/AGENTS.md`. This file holds only what is specific to
> this repository.

## 0. Completion gate

Run before declaring a task done and paste the real output:

```bash
npx tsc --noEmit                 # must exit 0, strict, noUncheckedIndexedAccess
node --test "src/**/*.test.ts"   # must exit 0
```

The test runner takes a glob, not a directory: on Node 24.22.1 `node --test src` tries to execute `src`
as a module and fails with `MODULE_NOT_FOUND` (verified in isolation with a directory holding one
`*.test.js`). `node --test "src/**/*.test.ts"` collects the suites and exits 0.

Slice-level gates live in `docs/04-plan.md`. A slice is done when its acceptance criteria are observed
in a live `pi -e .` session; unit tests alone do not satisfy them.

## 1. Stack

TypeScript (ESM, no build step — Pi loads `.ts` through jiti), Node ≥ 22.19. Components are pi-tui
component shapes (`{render, handleMouse?, handleInput?, invalidate, dispose?}`), never classes. No
runtime dependency; `@earendil-works/pi-*` are host-provided and belong in `peerDependencies` with
`"*"`.

## 2. Integration branch

`main`. Work happens on `feat/<slug>`, `fix/<slug>`, `docs/<slug>` branches cut from an up-to-date
`main`, and lands through a pull request. Branch, commit and PR shape:
`${AGENTS_DIR:-$HOME/.agents}/policies/commits.md`.

## 3. Non-negotiables

1. **No `class`, no `this`, no `any`, no `@ts-ignore`, no non-null assertions on possibly-missing
   values.** The only structural cast is the layout-root probe in `src/host/dock.ts`, behind
   `probeDockSupport()`.
2. **250 LOC per file.** Extract before growing.
3. **argv only.** Every process call is `pi.exec("git", ["…"], {cwd, timeout})`. No shell strings, no
   interpolation of a branch name into a command. Validate names with `git check-ref-format --branch`
   and reject a leading `-`.
4. **Writes are operator-initiated.** No timer, event or model request may run `fetch`, `pull`, `push`,
   `switch` or `switch -c`. Only a click or a keystroke does.
5. **No `--force`, no `--force-with-lease`, no automatic stash, no rebase.** `pull` is `--ff-only`.
6. **Theme tokens only.** No hardcoded colour in a render path; `accentOverride` is the documented
   escape hatch.
7. **Layering.** `extensions/` wires, `src/host/` knows Pi, `src/git/` spawns and parses, `src/view/`
   formats. A view never imports `git/exec`; a git module never imports a pi-tui component.
8. **Soft failure.** A failed probe, spawn or parse degrades one section and never throws into Pi's
   session loop.
9. **No absolute paths to locate anything.** `ctx.cwd`, the agent dir from `PI_CODING_AGENT_DIR`, and
   package-relative resource declarations only. `import.meta.dirname` is for diagnostics only.
10. **No new dependency** without an explicit operator decision.

## 4. Documentation

Every Markdown file starts with the harness YAML frontmatter block. Plan documents live in `docs/` and
must stay true: when code contradicts a document, fix the document in the same deliverable and say what
proves it.

## 5. What not to touch

The installed Pi tree. Findings about Pi internals are recorded in this repository under `docs/`, and
an upstream proposal is written as a file, never edited into `node_modules`.
