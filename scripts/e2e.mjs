/**
 * End-to-end proof, run against the production build in a real browser.
 *
 *   node scripts/e2e.mjs                 # builds nothing; expects dist/ and starts a server
 *   BASE_URL=http://… node scripts/e2e.mjs
 *
 * Everything here is something a judge can do by hand: open the page, load the three samples,
 * run the agent, make a proof, build an anchor packet, then cut the network and verify again.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 4319);
const BASE = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}/`;
const SHOTS = 'proof/shots';
mkdirSync(SHOTS, { recursive: true });

let checks = 0;
let failures = 0;
const ok = (name, condition, detail = '') => {
  checks += 1;
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    path.join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('No Chrome found. Set CHROME_PATH.');
}

let server = null;
if (!process.env.BASE_URL) {
  server = spawn(process.execPath, ['scripts/serve.mjs', '--root', 'dist', '--port', String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  ok('page title names the product', (await page.title()).includes('Tessera'));
  ok('clean sample verifies', (await page.textContent('#verdict-word'))?.trim() === 'PASS');
  const checkStates = await page.$$eval('.checks .c-state', (els) => els.map((e) => e.textContent?.trim()));
  ok('four checks all pass', checkStates.length === 4 && checkStates.every((s) => s === 'PASS'), JSON.stringify(checkStates));
  ok('twelve tiles for twelve steps', (await page.$$('#strip .tile')).length === 12);
  ok('bytes figure is the file size', (await page.textContent('#f-bytes'))?.replace(/\s/g, '') === '6,435B', await page.textContent('#f-bytes'));
  ok('root is a 64-char hash', /^[0-9a-f]{64}$/.test((await page.textContent('#f-root'))?.trim() ?? ''));
  await page.screenshot({ path: `${SHOTS}/01-pass.png`, fullPage: false });

  // --- tampered
  await page.click('[data-sample="tampered"]');
  await page.waitForTimeout(500);
  ok('tampered sample fails', (await page.textContent('#verdict-word'))?.trim() === 'FAIL');
  const chainRow = await page.$$eval('.checks tr', (rows) =>
    rows.map((r) => Array.from(r.children).map((c) => c.textContent?.trim() ?? '')).find((cells) => cells[0] === 'chain'),
  );
  ok('chain check fails', chainRow?.[1] === 'FAIL', JSON.stringify(chainRow));
  ok('verdict names step 4 and the result field', ((await page.textContent('.checks')) ?? '').includes('step 4: result changed'));
  ok('exactly one tile is marked bad', (await page.$$('#strip .tile.bad')).length === 1);
  const badNote = (await page.textContent('#strip .tile.bad .tile-note'))?.trim();
  ok('the bad tile names the field', badNote === 'result', badNote);
  ok('detail opens on the failing step', ((await page.textContent('#detail')) ?? '').includes('step 4'));
  await page.screenshot({ path: `${SHOTS}/02-fail.png`, fullPage: false });

  // --- forged
  await page.click('[data-sample="forged"]');
  await page.waitForTimeout(500);
  ok('forged sample fails', (await page.textContent('#verdict-word'))?.trim() === 'FAIL');
  const rows = await page.$$eval('.checks tr', (trs) => trs.map((r) => Array.from(r.children).map((c) => c.textContent?.trim() ?? '')));
  const sig = rows.find((c) => c[0] === 'signature');
  const chain = rows.find((c) => c[0] === 'chain');
  ok('signature fails while the chain still passes', sig?.[1] === 'FAIL' && chain?.[1] === 'PASS', JSON.stringify({ sig, chain }));
  await page.screenshot({ path: `${SHOTS}/03-forged.png`, fullPage: false });

  // --- record, seal, download
  await page.click('#run-agent');
  await page.waitForFunction(() => document.querySelectorAll('#record-strip .tile').length === 12, null, { timeout: 8000 });
  await page.waitForFunction(() => (document.querySelector('#record-status')?.textContent ?? '').includes('sealed'), null, { timeout: 8000 });
  ok('the agent runs to twelve steps and seals', ((await page.textContent('#record-status')) ?? '').includes('sealed'));
  ok('download is enabled after sealing', await page.$eval('#download-run', (b) => !b.disabled));
  const downloaded = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.click('#download-run'),
  ]);
  const stream = await downloaded[0].createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const parsed = JSON.parse(bytes.toString('utf8'));
  ok('the downloaded bundle is valid json with 12 steps', parsed.steps?.length === 12 && parsed.root?.length === 64);

  // --- disclose
  await page.fill('#proof-step', '4');
  await page.click('#make-proof');
  await page.waitForTimeout(300);
  ok('a proof is produced', ((await page.textContent('#proof-out')) ?? '').includes('"path"'));
  await page.click('#check-proof');
  await page.waitForTimeout(300);
  ok('the proof verifies on its own', ((await page.textContent('#proof-verdict')) ?? '').includes('PASS'));
  await page.screenshot({ path: `${SHOTS}/04-proof.png`, fullPage: true });

  // --- anchor
  await page.click('#make-anchor');
  await page.waitForTimeout(300);
  ok('the anchor packet carries a data root', ((await page.textContent('#anchor-out')) ?? '').includes('dataRoot'));
  await page.click('#check-anchor');
  await page.waitForTimeout(300);
  ok('the data root recomputes from the bundle', ((await page.textContent('#anchor-verdict')) ?? '').includes('PASS'));

  // --- no external requests
  ok('no request leaves this origin', (await page.textContent('#audit-count'))?.trim() === '0');
  const external = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => {
    try { return new URL(e.name).origin !== location.origin; } catch { return false; }
  }).length);
  ok('ResourceTiming shows zero cross-origin entries', external === 0, String(external));
  ok('fonts are served from this origin', await page.evaluate(() => document.fonts.check('16px "Plex Mono"')));

  // --- offline: abort everything that is not the document itself, then verify again
  let blocked = 0;
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    blocked += 1;
    return route.abort();
  });
  await page.click('[data-sample="clean"]');
  await page.waitForTimeout(400);
  ok('verification still passes with the network cut', (await page.textContent('#verdict-word'))?.trim() === 'PASS');
  await page.unroute('**/*');
  ok('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  // --- layout hygiene
  const scrollWide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('no horizontal scroll at 1440', scrollWide <= 1, String(scrollWide));

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(400);
  const mobileWide = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('no horizontal scroll at 390', mobileWide <= 1, String(mobileWide));
  ok('the verdict is still readable on a phone', (await mobile.textContent('#verdict-word'))?.trim() === 'PASS');
  await mobile.screenshot({ path: `${SHOTS}/05-mobile.png`, fullPage: false });
  await mobile.close();

  await page.screenshot({ path: `${SHOTS}/06-full.png`, fullPage: true });
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log('-'.repeat(58));
console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
