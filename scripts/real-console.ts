import { resolve } from 'node:path';
import { loadRealConfig } from '../src/real/config';
import { backendChildEnv, frontendChildEnv } from '../src/real/console-env';
import { createConsoleSupervisor } from '../src/real/supervisor';

const root = resolve(import.meta.dir, '..');
const portText = process.env.REAL_UI_PORT ?? '3001';
if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) throw new Error('Invalid REAL_UI_PORT');
const uiPort = Number(portText);
const mode = process.env.REAL_UI_MODE ?? 'dev';
if (!['dev', 'production'].includes(mode)) throw new Error('Invalid REAL_UI_MODE');
// Each child gets an explicit allowlisted environment (src/real/console-env.ts). Neither the shell nor a .env passes through.
const backendEnv = backendChildEnv(process.env, uiPort);
const config = loadRealConfig(backendEnv);
if (config.port === uiPort) throw new Error('Backend and UI ports must differ');
const frontendEnv = frontendChildEnv(process.env, config.port);
const supervisor = createConsoleSupervisor({ graceMs: 35_000, spawn(name) {
 if (name === 'backend') {
  const child = Bun.spawn([process.execPath, '--no-env-file', 'run', resolve(root, 'scripts/real-start.ts')], { cwd: root, env: backendEnv, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit', ipc() {}, serialization: 'json' });
  return { exited: child.exited, requestStop: () => { try { child.send({ kind: 'shutdown-real-console' }); } catch { child.kill(); } }, forceStop: () => child.kill() };
 }
 const child = Bun.spawn([process.env.REAL_NODE_EXECUTABLE ?? 'node', resolve(root, 'web/node_modules/next/dist/bin/next'), mode === 'dev' ? 'dev' : 'start', '--port', String(uiPort), '--hostname', '127.0.0.1'], { cwd: resolve(root, 'web'), env: frontendEnv, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' });
 return { exited: child.exited, requestStop: () => child.kill('SIGTERM'), forceStop: () => child.kill() };
} });
process.on('SIGINT', () => { void supervisor.stop(); });
process.on('SIGTERM', () => { void supervisor.stop(); });
process.on('message', (message: unknown) => { if (typeof message === 'object' && message !== null && (message as { kind?: unknown }).kind === 'shutdown-real-console') void supervisor.stop(); });
supervisor.start();
console.log(JSON.stringify({ mode: 'paper', executionEnabled: false, backend: `http://127.0.0.1:${config.port}`, ui: `http://127.0.0.1:${uiPort}`, uiMode: mode }));
const result = await supervisor.done;
console.log(JSON.stringify({ event: 'console-closed', ...result }));
process.exit(!result.resourcesClosed || result.forced || result.unexpectedExit ? 1 : 0);
