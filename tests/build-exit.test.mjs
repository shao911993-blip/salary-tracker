import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const preload = new URL("../scripts/graceful-build-exit.mjs", import.meta.url).href;

test("successful Windows build exit allows pending work to finish", () => {
  const result = spawnSync(process.execPath, ["--import", preload, "--eval", 'setTimeout(() => console.log("drained"), 10); process.exit(0);'], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "drained");
});

test("build exit compatibility does not turn failures into successes", () => {
  const result = spawnSync(process.execPath, ["--import", preload, "--eval", "process.exit(7);"], { encoding: "utf8" });
  assert.equal(result.status, 7);
});
