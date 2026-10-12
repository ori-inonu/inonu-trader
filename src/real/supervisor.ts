export interface OwnedChild { exited: Promise<number>; requestStop(): void; forceStop(): void }
export interface ShutdownResult { resourcesClosed: boolean; forced: boolean; unexpectedExit: boolean }

/** Owns exactly the processes it creates. No global PID discovery or unrelated termination. */
export function createConsoleSupervisor(deps: { spawn: (name: 'backend' | 'frontend') => OwnedChild; graceMs: number }) {
 if (!Number.isSafeInteger(deps.graceMs) || deps.graceMs < 1 || deps.graceMs > 60_000) throw new Error('Invalid shutdown grace');
 const children: OwnedChild[] = [];
 let started = false; let stopping: Promise<ShutdownResult> | null = null;
 let unexpectedExit = false;
 let finish!: (value: ShutdownResult) => void;
 const done = new Promise<ShutdownResult>(resolve => { finish = resolve; });
 const supervisor = {
  done,
  start() {
   if (started || stopping) throw new Error('Console supervisor already started or stopped'); started = true;
   try { children.push(deps.spawn('backend')); children.push(deps.spawn('frontend')); }
   catch (error) { unexpectedExit = true; void supervisor.stop(); throw error; }
   for (const child of children) void child.exited.then(
    () => { if (!stopping) unexpectedExit = true; return supervisor.stop(); },
    () => { unexpectedExit = true; return supervisor.stop(); },
   );
  },
  stop(): Promise<ShutdownResult> {
   if (stopping) return stopping;
   stopping = (async () => {
    for (const child of children) { try { child.requestStop(); } catch { /* A failed signal still requires observing exit. */ } }
    const allExited = Promise.all(children.map(child => child.exited.then(() => true, () => false))).then(results => results.every(Boolean));
    const waitForExit = async () => {
     let timeout: ReturnType<typeof setTimeout> | undefined;
     const exited = await Promise.race([allExited, new Promise<false>(resolve => { timeout = setTimeout(() => resolve(false), deps.graceMs); })]);
     if (timeout) clearTimeout(timeout); return exited;
    };
    const clean = await waitForExit();
    if (!clean) for (const child of children) { try { child.forceStop(); } catch { /* Do not report unobserved termination as closed. */ } }
    const resourcesClosed = clean || await waitForExit();
    const result = { resourcesClosed, forced: !clean, unexpectedExit }; finish(result); return result;
   })();
   return stopping;
  },
 };
 return supervisor;
}
