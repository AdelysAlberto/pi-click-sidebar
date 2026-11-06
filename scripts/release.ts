#!/usr/bin/env node
/**
 * Release helper: `node scripts/release.ts <patch|minor|major|tag> [--push]`.
 *
 * There is no release dependency and no CI to trust, so the sequence is written
 * down and the checks it performs are the ones the repository contract declares:
 *
 *   clean tree → on main → gate green → bump → CHANGELOG → commit → annotated tag
 *
 * `--push` sends `main` and the tag together with `--follow-tags`. Without it the
 * command prints what it created and leaves the push to the operator, because a
 * push is the one irreversible step here.
 *
 * `tag` releases the version already in package.json: that is how the first
 * release works, since the package started at 0.1.0.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = path.join(ROOT, "package.json");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const REPO_URL = "https://github.com/AdelysAlberto/pi-click-sidebar";

type Bump = "patch" | "minor" | "major" | "tag";

function fail(message: string): never {
  process.stderr.write(`release: ${message}\n`);
  process.exit(1);
}

function git(args: string[], capture = true): string {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr ?? "").trim();
    fail(`git ${args.join(" ")} failed${detail.length > 0 ? `: ${detail}` : ""}`);
  }
  return capture ? (result.stdout ?? "").trim() : "";
}

function run(command: string, args: string[]): void {
  process.stdout.write(`release: ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed`);
}

/** A fresh clone has no node_modules; the gate needs the dev toolchain. */
function ensureToolchain(): void {
  if (existsSync(path.join(ROOT, "node_modules", ".bin", "tsc"))) return;
  process.stdout.write("release: installing the dev toolchain\n");
  run("npm", ["install", "--no-audit", "--no-fund"]);
}

function nextVersion(current: string, bump: Bump): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (match === null) fail(`package.json version ${current} is not x.y.z`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function updateChangelog(version: string, date: string): void {
  const original = readFileSync(CHANGELOG, "utf8");
  // Anchored to the heading line: the same words appear in the explanatory prose.
  const unreleased = /^## \[Unreleased\]$/m;
  if (!unreleased.test(original)) fail("CHANGELOG.md has no '## [Unreleased]' heading to release");

  let next = original.replace(unreleased, `## [Unreleased]\n\n## [${version}] - ${date}`);

  // Keep the compare links honest: Unreleased moves to the new tag.
  next = next.replace(
    /^\[Unreleased\]: .*$/m,
    `[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD`,
  );
  if (!next.includes(`[${version}]:`)) {
    next = next.replace(
      /^(\[Unreleased\]: .*)$/m,
      `$1\n[${version}]: ${REPO_URL}/releases/tag/v${version}`,
    );
  }
  writeFileSync(CHANGELOG, next, "utf8");
}

function main(): void {
  const args = process.argv.slice(2);
  const bump = args.find((arg) => ["patch", "minor", "major", "tag"].includes(arg));
  const push = args.includes("--push");
  if (bump === undefined) {
    fail("usage: node scripts/release.ts <patch|minor|major|tag> [--push]");
  }

  if (git(["status", "--porcelain"]).length > 0) fail("the working tree is not clean; commit or stash first");
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") fail(`releases are cut from main, not ${branch}`);

  const current = JSON.parse(readFileSync(PACKAGE, "utf8")) as { version: string };
  const version = bump === "tag" ? current.version : nextVersion(current.version, bump);
  const tag = `v${version}`;
  if (git(["tag", "--list", tag]).length > 0) fail(`${tag} already exists`);

  // The gate the repository contract declares, before anything is written.
  ensureToolchain();
  run("npx", ["tsc", "--noEmit"]);
  run("node", ["--test", "src/**/*.test.ts"]);

  if (bump !== "tag") {
    const document = JSON.parse(readFileSync(PACKAGE, "utf8")) as Record<string, unknown>;
    document["version"] = version;
    writeFileSync(PACKAGE, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    updateChangelog(version, new Date().toISOString().slice(0, 10));
    git(["add", "package.json", "CHANGELOG.md"]);
    git(["commit", "-m", `chore(release): ${tag}`, "-m", `Bump to ${version}.`], false);
  }

  git(["tag", "-a", tag, "-m", `${tag}: the version the README installs`], false);
  process.stdout.write(`release: created ${tag}\n`);

  if (push) {
    git(["push", "origin", "main", "--follow-tags"], false);
    process.stdout.write(`release: pushed main and ${tag}\n`);
    return;
  }
  process.stdout.write(`release: next step is \`git push origin main --follow-tags\`\n`);
}

main();
