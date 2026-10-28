import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const windows = process.platform === "win32";
const child = spawn(
  windows ? process.execPath : "bash",
  windows ? [
    "--import", new URL("./graceful-build-exit.mjs", import.meta.url).href,
    fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url)), "build",
  ] : ["scripts/build-verified.sh"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_WRITE_LOGS: "false",
      WRANGLER_LOG_PATH: ".wrangler/logs",
      MINIFLARE_REGISTRY_PATH: ".wrangler/registry",
    },
    ...(windows ? { timeout: 180_000, windowsHide: true } : {}),
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
