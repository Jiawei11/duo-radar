import type { DownloadEvent } from "@tauri-apps/plugin-updater";

export interface UpdatePackage {
  version: string;
  body?: string;
  download: (progress: (event: DownloadEvent) => void, options: { timeout: number }) => Promise<void>;
  install: () => Promise<void>;
  close: () => Promise<void>;
}
export type UpdatePhase = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "installing" | "error";
export interface UpdateState { phase: UpdatePhase; version?: string; notes?: string; received: number; total?: number; error?: string }

// One controller per application, including React StrictMode remounts. No polling timer.
export function createUpdater(check: () => Promise<UpdatePackage | null>) {
  let state: UpdateState = { phase: "idle", received: 0 };
  let update: UpdatePackage | null = null;
  let locked = false;
  let started = false;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<UpdateState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const release = async () => { const previous = update; update = null; if (previous) await previous.close().catch(() => {}); };
  const fail = (error: unknown) => publish({ phase: "error", error: String(error) });
  async function checkNow() {
    if (locked || state.phase === "ready" || state.phase === "installing") return;
    locked = true;
    publish({ phase: "checking", error: undefined, version: undefined, notes: undefined, received: 0, total: undefined });
    try {
      await release();
      update = await check();
      publish(update ? { phase: "available", version: update.version, notes: update.body } : { phase: "current" });
    } catch (error) { fail(error); }
    finally { locked = false; }
  }
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => state,
    checkNow,
    start() { if (!started) { started = true; void checkNow(); } },
    async download() {
      if (locked || !update || state.phase !== "available") return;
      locked = true;
      publish({ phase: "downloading", received: 0, total: undefined, error: undefined });
      try {
        await update.download(event => {
          if (event.event === "Started") publish({ total: event.data.contentLength });
          if (event.event === "Progress") publish({ received: state.received + event.data.chunkLength });
          // Finished only means network transfer ended. Wait for signature validation below.
        }, { timeout: 120000 });
        publish({ phase: "ready" });
      } catch (error) { await release(); fail(error); }
      finally { locked = false; }
    },
    async install(prepare: () => Promise<void>) {
      if (locked || !update || state.phase !== "ready") return;
      locked = true;
      publish({ phase: "installing", error: undefined });
      try { await prepare(); await update.install(); }
      catch (error) { publish({ phase: "ready", error: String(error) }); }
      finally { locked = false; }
    },
    async discard() {
      if (locked || state.phase === "installing") return;
      locked = true;
      try {
        await release();
        publish({ phase: "idle", version: undefined, notes: undefined, received: 0, total: undefined, error: undefined });
      } finally { locked = false; }
    },
  };
}
