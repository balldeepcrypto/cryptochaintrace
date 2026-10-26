import type { ClusterChain, ClusterFinderResult, ClusterProgress, ClusterHopDepth } from "./cluster-finder-engine";

export interface ClusterCheckpoint {
  version: 1;
  runId: string;
  savedAt: string;
  chain: ClusterChain;
  maxHops?: ClusterHopDepth;
  focusText?: string;
  addressText: string;
  primaryAddress: string;
  state: "running" | "complete" | "cancelled" | "failed";
  result: ClusterFinderResult | null;
  progress: ClusterProgress | null;
  error: string;
  persistenceError?: boolean;
}

// Only the latest scan per signed-in account is retained on this browser.
// No auth tokens or credentials are stored with investigation results.
const memory = new Map<string, ClusterCheckpoint>();
const generations = new Map<string, string>();
let writes: Promise<unknown> = Promise.resolve();

export function beginClusterCheckpoint(owner: string): string {
  const id = crypto.randomUUID();
  generations.set(owner, id);
  return id;
}

function database<T>(operation: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let db: IDBDatabase | undefined;
    let transaction: IDBTransaction | undefined;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      db?.close();
      reject(new Error("Cluster Finder could not access browser storage."));
    };
    const timer = setTimeout(() => {
      fail();
      transaction?.abort();
    }, 5_000);
    try {
      const open = indexedDB.open("cluster-finder-checkpoints", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("checkpoints");
      open.onerror = fail;
      open.onblocked = fail;
      open.onsuccess = () => {
        db = open.result;
        if (settled) { db.close(); return; }
        transaction = db.transaction("checkpoints", "readwrite");
        let value: T;
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          db?.close();
          resolve(value);
        };
        transaction.onerror = fail;
        transaction.onabort = fail;
        try { operation(transaction.objectStore("checkpoints"), (result) => { value = result; }); }
        catch { transaction.abort(); fail(); }
      };
    } catch { fail(); }
  });
}

export function saveClusterCheckpoint(owner: string, checkpoint: ClusterCheckpoint): Promise<boolean> {
  if (generations.get(owner) !== checkpoint.runId) return Promise.resolve(false);
  memory.set(owner, checkpoint);
  const pending = writes.then(async () => {
    if (generations.get(owner) !== checkpoint.runId) return false;
    await database<void>((store, done) => {
      store.put(checkpoint, owner);
      done(undefined);
    });
    return true;
  }).catch((error) => {
    if (memory.get(owner) === checkpoint) memory.set(owner, { ...checkpoint, persistenceError: true });
    throw error;
  });
  writes = pending.catch(() => undefined);
  return pending;
}

export async function loadClusterCheckpoint(owner: string): Promise<ClusterCheckpoint | null> {
  await writes;
  if (memory.has(owner)) return memory.get(owner)!;
  const checkpoint = await database<ClusterCheckpoint | null>((store, done) => {
    const request = store.get(owner);
    request.onsuccess = () => done(request.result ?? null);
  });
  if (!checkpoint) return null;
  if (checkpoint.version !== 1 || !checkpoint.runId || !checkpoint.primaryAddress
    || !["running", "complete", "cancelled", "failed"].includes(checkpoint.state)
    || !checkpoint.savedAt) throw new Error("Saved Cluster Finder checkpoint is invalid.");
  // Never replace a newer in-memory scan with a delayed read.
  if (memory.has(owner)) return memory.get(owner)!;
  generations.set(owner, checkpoint.runId);
  memory.set(owner, checkpoint);
  return checkpoint;
}

export function clearClusterCheckpoint(owner: string): Promise<void> {
  beginClusterCheckpoint(owner); // Invalidates any late callback from an old scan.
  memory.delete(owner);
  const pending = writes.then(() => database<void>((store, done) => {
    store.delete(owner);
    done(undefined);
  }));
  writes = pending.catch(() => undefined);
  return pending;
}
