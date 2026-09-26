import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const manifest = JSON.parse(readFileSync(new URL("../.github/game-ownership.json", import.meta.url), "utf8"));
const game = process.env.GAME;
const source = process.env.SOURCE_COMMIT;
const target = process.env.TARGET_COMMIT || "HEAD";

if (!game || !manifest.games[game]) throw new Error("Unknown GAME");
if (!source) throw new Error("SOURCE_COMMIT is required");

const normalize = (p) => p.replace(/\/+$/, "");
const ownedRoots = manifest.games[game].roots.map(normalize);
const foreignRoots = Object.entries(manifest.games)
  .filter(([name]) => name !== game)
  .flatMap(([, cfg]) => cfg.roots.map(normalize));

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const isInside = (file, root) => file === root || file.startsWith(root + "/");

const treeHash = (commit, roots) => {
  const lines = roots.flatMap((root) => {
    const out = git("ls-tree", "-r", commit, "--", root);
    return out ? out.split("\n") : [];
  }).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
};

const beforeForeign = treeHash(target, foreignRoots);

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

const afterForeign = treeHash("HEAD", foreignRoots);
if (beforeForeign !== afterForeign) {
  throw new Error("Foreign game tree hash changed during promotion");
}

console.log(`Promotion scope verified for ${game}. ${changed.length} changed file(s), all owned.`);
