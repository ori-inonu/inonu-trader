import { expect, test } from 'bun:test';
import { createConsoleSupervisor, type OwnedChild } from './supervisor';

function child() {
 let resolve!: (code: number) => void;
 const state = { stop: 0, kill: 0 };
 const owned: OwnedChild = { exited: new Promise<number>(r => { resolve = r; }), requestStop: () => { state.stop++; resolve(0); }, forceStop: () => { state.kill++; resolve(1); } };
 return { owned, state, exit: (code: number) => resolve(code) };
}
test('starts only its two children, stops both once and awaits actual exit', async () => {
 const backend = child(); const frontend = child(); const spawned: string[] = [];
 const supervisor = createConsoleSupervisor({ spawn: name => { spawned.push(name); return name === 'backend' ? backend.owned : frontend.owned; }, graceMs: 100 });
 supervisor.start(); expect(spawned).toEqual(['backend', 'frontend']);
 const result = await supervisor.stop();
 expect(result).toEqual({ resourcesClosed: true, forced: false, unexpectedExit: false });
 expect(backend.state).toEqual({ stop: 1, kill: 0 }); expect(frontend.state).toEqual({ stop: 1, kill: 0 });
 await supervisor.stop(); expect(backend.state.stop).toBe(1);
});
test('unexpected child exit shuts the peer and a partial launch cleans its owned backend', async () => {
 const backend = child(); const frontend = child();
 const supervisor = createConsoleSupervisor({ spawn: name => name === 'backend' ? backend.owned : frontend.owned, graceMs: 100 });
 supervisor.start(); frontend.exit(1); expect((await supervisor.done).unexpectedExit).toBe(true);
 expect(backend.state.stop).toBe(1);
 const first = child(); const failed = createConsoleSupervisor({ spawn: name => { if (name === 'frontend') throw new Error('bind'); return first.owned; }, graceMs: 100 });
 expect(() => failed.start()).toThrow('bind'); await failed.done; expect(first.state.stop).toBe(1);
});

test('failed stop signals cannot claim closed resources or hang shutdown', async () => {
 const pending = new Promise<number>(() => {});
 const supervisor = createConsoleSupervisor({ spawn: () => ({ exited: pending, requestStop: () => { throw new Error('signal'); }, forceStop: () => { throw new Error('kill'); } }), graceMs: 5 });
 supervisor.start();
 const result = await supervisor.stop();
 expect(result.resourcesClosed).toBe(false);
 expect(result.forced).toBe(true);
});
