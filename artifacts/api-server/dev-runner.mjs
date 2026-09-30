import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const build = spawnSync("pnpm", ["run", "build"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});

if ((build.status ?? 1) !== 0) {
  process.exit(build.status ?? 1);
}

await import(pathToFileURL(resolve(process.cwd(), "dist/index.mjs")).href);
