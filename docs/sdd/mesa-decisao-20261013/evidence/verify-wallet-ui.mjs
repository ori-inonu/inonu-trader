import { chromium } from 'file:///C:/Users/gabri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';

const base = 'C:/Users/gabri/.codex/visualizations/2026/10/13/01a135ff-362e-7cf0-ac4f-ef678d322188';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [];
const ensure = (value, message) => { if (!value) throw new Error(message); };
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const posts = [], deletes = [], pageErrors = [];
    let hold = false, release;
    page.on('pageerror', err => pageErrors.push(String(err)));
    await page.addInitScript(() => {
      const listeners = new Map();
      const nativeNow = Date.now;
      window.__clockDelta = 0;
      window.__walletConnected = false;
      Date.now = () => nativeNow() + window.__clockDelta;
      window.__walletEmit = (event, value) => { for (const cb of listeners.get(event) ?? []) cb(value); };
      window.okxwallet = {
        request: async ({ method }) => {
          if (method === 'eth_requestAccounts') { window.__walletConnected = true; return ['0x' + 'a'.repeat(40)]; }
          if (method === 'eth_accounts') return window.__walletConnected ? ['0x' + 'a'.repeat(40)] : [];
          if (method === 'eth_chainId') return '0x8f';
          if (method === 'eth_blockNumber') return '0x10';
          if (method === 'eth_getBalance') return '0x0';
          if (method === 'eth_call') return '0x' + '0'.repeat(64);
          throw new Error('Unqualified synthetic method: ' + method);
        },
        on: (event, cb) => listeners.set(event, [...(listeners.get(event) ?? []), cb]),
        removeListener: (event, cb) => listeners.set(event, (listeners.get(event) ?? []).filter(fn => fn !== cb)),
      };
    });
    await page.route('**/inonu/request/*', async route => {
      deletes.push({ url: route.request().url(), method: route.request().method() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.route('**/inonu/ask', async route => {
      const request = route.request();
      const payload = request.postDataJSON();
      posts.push({ payload, headers: request.headers() });
      if (hold) await new Promise(resolve => { release = resolve; });
      const cartera = payload.carteira;
      const answer = { ok: true, id: 'synthetic-wallet-fixture', status: 'respondido', briefHash: 'synthetic-fixture', advisory: true, execution: 'never', custo: { chamadasOnchainos: 0, tokens: null, usd: null }, carteira: { ...cartera, netWorthUsd: null, positionsEmpty: true, assets: cartera.assets.map(a => ({ ...a, candidateId: `token:${cartera.chainIndex}:${a.contract.toLowerCase()}`, action: 'abstain', model: 'synthetic_fixture', evidence: { origin: 'onchainos', ageMs: 0, gaps: ['synthetic_fixture'], flow: null, risk: null } })) } };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) }).catch(() => {});
    });
    await page.goto('http://127.0.0.1:3017/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: 'Analisar carteira', exact: true }).first().click();
    const section = page.getByRole('region', { name: 'Gestao de carteira com Inonu' });
    await section.getByRole('button', { name: 'Conectar carteira para leitura' }).click();
    await section.getByText('2 ativos nesta leitura', { exact: true }).waitFor();
    const consult = section.getByRole('button', { name: 'Consultar carteira com Inonu' });
    ensure(posts.length === 0, 'Connection must not call model');
    ensure(await consult.isDisabled(), 'Consent must be required');
    await section.getByRole('button', { name: 'Atualizar leitura da carteira' }).click();
    ensure(posts.length === 0, 'Refresh must not call model');
    await section.getByRole('checkbox').check();
    await consult.click();
    await section.getByRole('heading', { name: 'Plano por ativo' }).waitFor();
    ensure(posts.length === 1, 'One manual click must cause one POST');
    ensure(!JSON.stringify(posts[0].payload).includes('a'.repeat(40)), 'Wallet address leaked');
    ensure(posts[0].payload.carteira.assets[1].symbol === 'USDCNATIVO', 'Real wallet label was not normalized');
    const screenshot = `${base}/wallet-${name}.png`;
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshot, fullPage: true });
    const beforeExpiration = await section.innerText();
    await page.evaluate(() => { window.__clockDelta = 61001; });
    await page.waitForTimeout(1300);
    ensure(await section.getByRole('heading', { name: 'Plano por ativo' }).count() === 0, 'Expired answer remained visible');
    ensure(!await section.getByRole('checkbox').isChecked(), 'Expired consent remained');
    ensure(await consult.isDisabled(), 'Expired reading still allowed consultation');
    await page.evaluate(() => { window.__clockDelta = 0; });
    await section.getByRole('button', { name: 'Atualizar leitura da carteira' }).click();
    await section.getByRole('checkbox').check();
    hold = true;
    await consult.click();
    await section.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.waitForTimeout(250);
    ensure(deletes.length === 1, 'Cancel must send owned DELETE');
    const lastPost = posts.at(-1);
    ensure(deletes[0].url.endsWith(lastPost.headers['x-inonu-request-id']), 'Cancel targeted a different request');
    if (release) release();
    await page.evaluate(() => window.__walletEmit('accountsChanged', ['0x' + 'b'.repeat(40)]));
    await page.waitForTimeout(150);
    ensure(!await section.getByRole('checkbox').isChecked(), 'Account change kept consent');
    ensure(await consult.isDisabled(), 'Account change kept old reading available');
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    ensure(geometry.width <= geometry.viewport, 'Horizontal overflow');
    ensure(pageErrors.length === 0, 'Browser runtime errors: ' + pageErrors.join(';'));
    ensure(!/[\u00b7\u2013\u2014]/.test(beforeExpiration), 'Banned character in consultation');
    results.push({ name, posts: posts.length, deletes: deletes.length, geometry, pageErrors, screenshot, claims: ['no-auto-model', 'minimal-payload', 'single-manual-post', 'real-wallet-label', 'owned-cancel', 'expiry-invalidation', 'account-invalidation'], qualification: 'synthetic wallet and intercepted model response, no live wallet/model/order qualification' });
    await page.close();
  }
} finally { await browser.close(); await writeFile(`${base}/wallet-ui-results.json`, JSON.stringify(results, null, 2)); }
console.log(JSON.stringify(results));
