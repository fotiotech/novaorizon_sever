#!/usr/bin/env node
/**
 * Local production build + smoke test.
 *
 *   1. compiles the server to `dist/` (same compiler options as production,
 *      minus sourcemaps),
 *   2. boots `node dist/server.js` with NODE_ENV=production on a free port,
 *   3. polls `GET /api/health` until it answers, then shuts the server down.
 *
 * Run with:  npm run test:build      (or: node scripts/verify-build.mjs)
 * Set SERVER_BUILD_PORT to change the port (default 4123).
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
const port = process.env.SERVER_BUILD_PORT || "4123";

console.log("\n[1/3] compiling (tsc -p tsconfig.build.json)…");
const build = spawnSync(process.execPath, [tsc, "-p", "tsconfig.build.json"], {
  cwd: root,
  stdio: "inherit",
});
if (build.error) {
  console.error("failed to run tsc:", build.error);
  process.exit(1);
}
if (build.status !== 0) {
  console.error("\nBuild failed (exit " + build.status + ")");
  process.exit(build.status ?? 1);
}

console.log("\n[2/3] starting dist/server.js (NODE_ENV=production, port " + port + ")…");
const child = spawn(process.execPath, ["dist/server.js"], {
  cwd: root,
  // "inherit" keeps stdio out of pipes so the script also works in sandboxes
  // that block piped child processes.
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", PORT: port },
});

let exited = false;
child.on("exit", (code) => {
  exited = true;
  if (code && code !== 0) console.error("server exited early with code", code);
});

console.log("\n[3/3] waiting for http://127.0.0.1:" + port + "/api/health …");
const deadline = Date.now() + 25_000;
let healthy = false;

while (!healthy && !exited && Date.now() < deadline) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (res.ok) {
      console.log("health:", await res.text());
      healthy = true;
      break;
    }
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}

child.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 500));
if (!child.killed) child.kill("SIGKILL");

if (!healthy) {
  console.error("\nFAILED: the server did not become healthy within 25s");
  process.exit(1);
}

console.log("\nOK: production build compiles and the compiled server serves /api/health\n");
process.exit(0);
