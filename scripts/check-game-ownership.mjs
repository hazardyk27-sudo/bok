import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../.github/game-ownership.json", import.meta.url), "utf8"));
const game = process.env.GAME_SCOPE;
const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA || "HEAD";
const preview = process.env.PREVIEW_SHA || "";

if (!game || !manifest.games[game]) {
  console.error("GAME_SCOPE must name a game from .github/game-ownership.json");
  process.exit(2);
}
if (!base) {
  console.error("BASE_SHA is required");
  process.exit(2);
}

const roots = manifest.games[game].roots.map((root) => root.replace(/\/+$/, ""));
const developmentRoots = (manifest.games[game].developmentRoots ?? []).map((root) => root.replace(/\/+$/, ""));
const developmentPrefixes = manifest.games[game].developmentPrefixes ?? [];
const allowedRoots = [...roots, ...developmentRoots];
const shared = manifest.shared.map((root) => root.replace(/\/+$/, ""));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const inside = (file, root) => file === root || file.startsWith(root + "/");
const owned = (file) =>
  allowedRoots.some((root) => inside(file, root)) ||
  developmentPrefixes.some((prefix) => file.startsWith(prefix));
const sharedFile = (file) => shared.some((root) => inside(file, root));

const parents = git("rev-list", "--parents", "-n", "1", head).split(/\s+/).slice(1);
const isBaselineMerge = Boolean(
  preview &&
  parents.includes(base) &&
  parents.includes(preview),
);
const compareBase = isBaselineMerge ? preview : base;

const out = git("diff", "--name-only", compareBase, head);
const files = out ? out.split("\n").filter(Boolean) : [];
const violations = files.filter((file) => !owned(file));
const sharedTouches = violations.filter(sharedFile);
const foreignTouches = violations.filter((file) => !sharedFile(file));

console.log(`Ownership scope: ${game}`);
console.log(`Mode: ${isBaselineMerge ? "isolation-baseline-merge" : "normal-game-change"}`);
console.log(`Changed files: ${files.length}`);
console.log(`Owned changes: ${files.filter(owned).length}`);

if (sharedTouches.length) {
  console.error("\nShared/platform files changed outside the approved baseline:");
  sharedTouches.forEach((file) => console.error(`  - ${file}`));
}
if (foreignTouches.length) {
  console.error("\nFiles outside this game's ownership changed:");
  foreignTouches.forEach((file) => console.error(`  - ${file}`));
}
if (violations.length) {
  console.error("\nRejected: game branches may not modify shared or foreign ownership areas.");
  process.exit(1);
}
