import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const manifest = JSON.parse(readFileSync(new URL("../.github/game-ownership.json", import.meta.url), "utf8"));
const game = process.env.GAME;
const source = process.env.SOURCE_COMMIT;

if (!game || !manifest.games[game]) throw new Error("Unknown GAME");
if (!source) throw new Error("SOURCE_COMMIT is required");

const normalize = (p) => p.replace(/\/+$/, "");
const ownedRoots = manifest.games[game].roots.map(normalize);
const foreignRoots = Object.entries(manifest.games)
  .filter(([name]) => name !== game)
  .flatMap(([, cfg]) => cfg.roots.map(normalize));

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const isInside = (file, root) => file === root || file.startsWith(root + "/");

let sourceVersion = "";
try {
  sourceVersion = git("show", `${source}:.github/isolation-version`);
} catch {
  throw new Error("Source ref is not migrated to the isolated game layout");
}
if (sourceVersion !== String(manifest.version)) {
  throw new Error(`Source isolation version ${sourceVersion || "<missing>"} does not match preview version ${manifest.version}`);
}

for (const root of ownedRoots) {
  const listing = git("ls-tree", "-r", "--name-only", source, "--", root);
  if (!listing) {
    throw new Error(`Source ref is missing required owned root: ${root}`);
  }
}

for (const root of ownedRoots) {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}

const sourceFilesRaw = git("ls-tree", "-r", "--name-only", source, "--", ...ownedRoots);
const sourceFiles = sourceFilesRaw ? sourceFilesRaw.split("\n").filter(Boolean) : [];
for (const file of sourceFiles) {
  const content = execFileSync("git", ["show", `${source}:${file}`]);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const changedRaw = git("diff", "--name-only");
const changed = changedRaw ? changedRaw.split("\n").filter(Boolean) : [];
const illegal = changed.filter((file) => !ownedRoots.some((root) => isInside(file, root)));
if (illegal.length) {
  throw new Error("Promotion touched non-owned files:\n" + illegal.join("\n"));
}

const foreignTrackedChanges = foreignRoots.flatMap((root) => {
  const out = git("diff", "--name-only", "HEAD", "--", root);
  return out ? out.split("\n").filter(Boolean) : [];
});
if (foreignTrackedChanges.length) {
  throw new Error("Foreign game files changed during promotion:\n" + foreignTrackedChanges.join("\n"));
}

console.log(`Promotion scope verified for ${game}. ${changed.length} changed file(s), all owned.`);
