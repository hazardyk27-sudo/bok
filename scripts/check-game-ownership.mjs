import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../.github/game-ownership.json", import.meta.url), "utf8"));
const game = process.env.GAME_SCOPE;
const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA || "HEAD";

if (!game || !manifest.games[game]) {
  console.error("GAME_SCOPE must name a game from .github/game-ownership.json");
  process.exit(2);
}
if (!base) {
  console.error("BASE_SHA is required");
  process.exit(2);
}

const roots = manifest.games[game].roots.map((root) => root.replace(/\/+$/, ""));
const shared = manifest.shared.map((root) => root.replace(/\/+$/, ""));
const out = execFileSync("git", ["diff", "--name-only", base, head], { encoding: "utf8" }).trim();
const files = out ? out.split("\n").filter(Boolean) : [];

const inside = (file, root) => file === root || file.startsWith(root + "/");
const owned = (file) => roots.some((root) => inside(file, root));
const sharedFile = (file) => shared.some((root) => inside(file, root));
const violations = files.filter((file) => !owned(file));
const sharedTouches = violations.filter(sharedFile);
const foreignTouches = violations.filter((file) => !sharedFile(file));

console.log(`Ownership scope: ${game}`);
console.log(`Changed files: ${files.length}`);
console.log(`Owned changes: ${files.filter(owned).length}`);

if (sharedTouches.length) {
  console.error("\nShared/platform files changed by a game branch:");
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
