import { DEFAULT_STATE, parseState } from "./salary.ts";
import type { AppState } from "./salary.ts";

export interface StateBackend {
  read(): Promise<unknown>;
  write(state: AppState): Promise<void>;
}

const DB_NAME = "salary-time-tracker";
const STORE_NAME = "app-state";
const STATE_KEY = "main";
const FALLBACK_KEY = "salary-time-tracker-v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("資料庫暫時無法開啟"));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

const indexedDBBackend: StateBackend = {
  async read() {
    const database = await openDatabase();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("讀取已中止"));
      });
    } finally {
      database.close();
    }
  },
  async write(state) {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("儲存已中止"));
      });
    } finally {
      database.close();
    }
  },
};

const localStorageBackend: StateBackend = {
  async read() {
    const saved = localStorage.getItem(FALLBACK_KEY);
    return saved === null ? null : JSON.parse(saved);
  },
  async write(state) {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
  },
};

export type StateLock = <T>(run: () => Promise<T>) => Promise<T>;

// Web Locks serialise writes across every tab of this origin. Browsers without
// it fall back to no lock; re-reading before each write still narrows the gap.
const browserLock: StateLock = <T,>(run: () => Promise<T>) =>
  typeof navigator !== "undefined" && navigator.locks
    // request() resolves with the callback's own result, so Promise<T> here.
    ? (navigator.locks.request("salary-time-tracker-write", run) as Promise<T>)
    : run();

const CHANNEL_NAME = "salary-time-tracker";

// A short-lived channel, so nothing stays open (and test runs can exit).
function notifyOtherTabs(updatedAt: number) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(updatedAt);
  channel.close();
}

export function createStateStorage(
  backends: StateBackend[] = [localStorageBackend, indexedDBBackend],
  withLock: StateLock = browserLock,
) {
  let lastUpdatedAt = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const storage = {
    async load(): Promise<AppState> {
      let invalidSnapshot = false;
      const results = await Promise.allSettled(backends.map(async (backend) => {
        let value: unknown;
        try {
          value = await backend.read();
        } catch (error) {
          if (error instanceof SyntaxError) invalidSnapshot = true;
          throw error;
        }
        if (value == null) return null;
        try {
          return parseState(value);
        } catch (error) {
          invalidSnapshot = true;
          throw error;
        }
      }));
      const candidates = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
      // For legacy snapshots without a timestamp, prefer the old synchronous mirror.
      candidates.sort((a, b) => b.updatedAt - a.updatedAt);
      const newest = candidates[0];
      if (newest) {
        lastUpdatedAt = Math.max(lastUpdatedAt, newest.updatedAt);
        return newest;
      }
      if (invalidSnapshot) throw new Error("裝置資料格式無效，請匯入有效備份；原始儲存內容尚未變更");
      if (results.every((result) => result.status === "rejected")) {
        throw new Error("無法讀取裝置資料，請檢查瀏覽器儲存權限或匯入備份");
      }
      return parseState(DEFAULT_STATE);
    },
    save(state: AppState): Promise<AppState> {
      const operation = pending.then(async () => {
        const snapshot = parseState({ ...state, updatedAt: Math.max(Date.now(), lastUpdatedAt + 1, state.updatedAt + 1) });
        const results = await Promise.allSettled(backends.map(async (backend) => backend.write(snapshot)));
        if (!results.some((result) => result.status === "fulfilled")) {
          throw new Error("儲存失敗：請檢查瀏覽器儲存權限或可用空間後重試");
        }
        lastUpdatedAt = snapshot.updatedAt;
        notifyOtherTabs(snapshot.updatedAt);
        return snapshot;
      });
      pending = operation.catch(() => undefined);
      return operation;
    },
    // Another tab may have saved since this one loaded, so each change is
    // applied to the newest stored copy rather than to this tab's memory.
    // `known` is this tab's copy; it wins only when storage holds something
    // older (e.g. site data was cleared while the tab stayed open).
    update(change: (current: AppState) => AppState, known: AppState): Promise<AppState> {
      return withLock(async () => {
        let stored: AppState | null = null;
        try {
          stored = await storage.load();
        } catch {
          // Unreadable storage: fall back to the copy this tab already has.
        }
        const base = stored && stored.updatedAt >= known.updatedAt ? stored : known;
        return storage.save(change(base));
      });
    },
    // Imports replace everything, so there is nothing to re-read first.
    replace(state: AppState): Promise<AppState> {
      return withLock(() => storage.save(state));
    },
    // Calls `onChange` with the newest stored state whenever another tab saves.
    subscribe(onChange: (state: AppState) => void): () => void {
      if (typeof BroadcastChannel === "undefined") return () => undefined;
      const listener = new BroadcastChannel(CHANNEL_NAME);
      listener.onmessage = () => {
        storage.load().then(onChange).catch(() => undefined);
      };
      return () => listener.close();
    },
  };
  return storage;
}

export const stateStorage = createStateStorage();
