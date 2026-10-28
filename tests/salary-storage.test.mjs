import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { DEFAULT_STATE } from "../lib/salary.ts";
import { createStateStorage } from "../lib/salary-storage.ts";

function backend(initial = null) {
  return {
    value: structuredClone(initial), failRead: false, failWrite: false, writes: 0,
    async read() {
      if (this.failRead) throw Error("read unavailable");
      return structuredClone(this.value);
    },
    async write(value) {
      this.writes++;
      if (this.failWrite) throw Error("QuotaExceededError");
      this.value = structuredClone(value);
    },
  };
}

test("a full localStorage does not prevent IndexedDB from saving", async () => {
  const local = backend();
  local.failWrite = true;
  const database = backend();
  const storage = createStateStorage([local, database]);
  const saved = await storage.save(DEFAULT_STATE);
  assert.equal(local.writes, 1);
  assert.equal(database.writes, 1);
  assert.deepEqual(database.value, saved);
  assert.ok(saved.updatedAt > 0);
});

test("newer mirror wins after an IndexedDB write failure and recovery", async () => {
  const local = backend(DEFAULT_STATE);
  const database = backend(DEFAULT_STATE);
  database.failWrite = true;
  const storage = createStateStorage([local, database]);
  const saved = await storage.save({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, hourlyRate: 250 } });
  database.failWrite = false;
  const restored = await createStateStorage([local, database]).load();
  assert.equal(restored.settings.hourlyRate, 250);
  assert.equal(restored.updatedAt, saved.updatedAt);
});

test("newer IndexedDB wins when the mirror is stale", async () => {
  const storage = createStateStorage([
    backend({ ...DEFAULT_STATE, updatedAt: 10 }),
    backend({ ...DEFAULT_STATE, updatedAt: 20, settings: { ...DEFAULT_STATE.settings, hourlyRate: 300 } }),
  ]);
  assert.equal((await storage.load()).settings.hourlyRate, 300);
});

test("legacy snapshots prefer the synchronous mirror on timestamp ties", async () => {
  const local = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, hourlyRate: 250 } };
  delete local.updatedAt;
  const database = { ...DEFAULT_STATE };
  delete database.updatedAt;
  assert.equal((await createStateStorage([backend(local), backend(database)]).load()).settings.hourlyRate, 250);
});

test("one invalid backend does not hide another valid snapshot", async () => {
  const valid = { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, hourlyRate: 280 } };
  assert.equal((await createStateStorage([backend({ ...DEFAULT_STATE, records: [null] }), backend(valid)]).load()).settings.hourlyRate, 280);
});

test("both storage failures reject, and a later retry can succeed", async () => {
  const local = backend();
  const database = backend();
  local.failWrite = database.failWrite = true;
  const storage = createStateStorage([local, database]);
  await assert.rejects(storage.save(DEFAULT_STATE));
  assert.equal(local.value, null);
  assert.equal(database.value, null);
  database.failWrite = false;
  await storage.save(DEFAULT_STATE);
  assert.notEqual(database.value, null);
});

test("invalid imports are rejected without writing to either backend", async () => {
  const local = backend(DEFAULT_STATE);
  const database = backend(DEFAULT_STATE);
  await assert.rejects(createStateStorage([local, database]).save({ ...DEFAULT_STATE, records: [null] }));
  assert.equal(local.writes, 0);
  assert.equal(database.writes, 0);
  assert.deepEqual(local.value, DEFAULT_STATE);
});

test("overlapping saves cannot finish in reverse order", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const slow = backend();
  const write = slow.write.bind(slow);
  let first = true;
  slow.write = async value => {
    if (first) { first = false; await gate; }
    await write(value);
  };
  const mirror = backend();
  const storage = createStateStorage([mirror, slow]);
  const earlier = storage.save(DEFAULT_STATE);
  const later = storage.save({ ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, hourlyRate: 400 } });
  await setImmediate();
  assert.equal(mirror.writes, 1);
  release();
  const [one, two] = await Promise.all([earlier, later]);
  assert.ok(two.updatedAt > one.updatedAt);
  assert.equal(slow.value.settings.hourlyRate, 400);
  assert.equal(mirror.value.settings.hourlyRate, 400);
});

test("fresh storage loads defaults, while inaccessible storage reports an error", async () => {
  assert.deepEqual(await createStateStorage([backend(), backend()]).load(), DEFAULT_STATE);
  const a = backend();
  const b = backend();
  a.failRead = b.failRead = true;
  await assert.rejects(createStateStorage([a, b]).load());
});

test("corrupt data is not silently treated as a new empty account", async () => {
  const corrupt = backend({ ...DEFAULT_STATE, records: [null] });
  await assert.rejects(createStateStorage([corrupt, backend()]).load());
  assert.equal(corrupt.writes, 0);
});
