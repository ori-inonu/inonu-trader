import { loadRealConfig, publicRealConfig } from '../src/real/config';

try {
 const config = loadRealConfig();
 console.log(JSON.stringify({ ...publicRealConfig(config), runtime: { bun: Bun.version, node: process.version }, accessProof: 'unverified', financialExecution: 'disabled', checks: { privateKeyNeeded: false, kuruNeededForBootstrap: false } }, null, 2));
} catch { console.error('Invalid independent pipeline configuration. Values are withheld.'); process.exitCode = 1; }
