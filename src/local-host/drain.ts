/** A timeout keeps the financial lock. Retry the SAME drain instead of terminating a process that may still have work in flight. */
export async function drainLocal(stop: () => Promise<void>, wait: (ms: number) => Promise<void>, failed: () => void): Promise<void> {
  while (true) {
    try { await stop(); return; }
    catch { failed(); await wait(30_000); }
  }
}

/** On startup failure there is no service; when one exists, all exit paths drain it first. IPC cannot keep a failed entry alive forever. */
export async function exitLocal(code: number, stop: (() => Promise<void>) | null = null): Promise<never> {
  if (stop !== null) await drainLocal(stop, ms => Bun.sleep(ms), () => console.error("local_close_timeout"));
  process.exit(code);
}
