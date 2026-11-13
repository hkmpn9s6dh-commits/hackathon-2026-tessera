/**
 * Gate D assets: capture candidate references and our own main screen at 1440×900, then build a
 * shuffled, label-free A–F set for blind ranking.
 *
 *   node scripts/rank-shots.mjs            # capture candidates + build the set
 *   node scripts/rank-shots.mjs --capture  # capture only, so the set can be chosen by eye first
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe');
const SRC = 'proof/rank/src';
const OUT = 'proof/rank';
mkdirSync(SRC, { recursive: true });

const LOCAL = process.env.SITE_URL ?? 'http://127.0.0.1:4319/';

const candidates = [
  { id: 'ours', url: LOCAL, wait: 1200, local: true },
  { id: 'linear', url: 'https://linear.app/', wait: 2500 },
  { id: 'stripe', url: 'https://stripe.com/payments', wait: 2500 },
  { id: 'arena', url: 'https://www.are.na/', wait: 2500 },
  { id: 'tailscale', url: 'https://tailscale.com/', wait: 2500 },
  { id: 'sigstore', url: 'https://www.sigstore.dev/', wait: 2000 },
  { id: 'hackernoon', url: 'https://hackernoon.com/tagged/decentralize-ai-hackathon', wait: 2500 },
  { id: 'viewblock', url: 'https://viewblock.io/arweave', wait: 3000 },
  { id: 'decentralize', url: 'https://decentralizeai.tech/', wait: 2500 },
  { id: 'github', url: 'https://github.com/hkmpn9s6dh-commits/hackathon-2026-tessera', wait: 2500 },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
for (const c of candidates) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(c.wait ?? 2000);
    await page.screenshot({ path: `${SRC}/${c.id}.jpg`, type: 'jpeg', quality: 86 });
    console.log(`captured ${c.id}`);
  } catch (error) {
    console.log(`skipped ${c.id}: ${String(error).slice(0, 80)}`);
  }
  await page.close();
}
await browser.close();

if (process.argv.includes('--capture')) process.exit(0);

// Five references plus ours. Names are stripped, letters are shuffled, and the mapping is written
// to order.json so the result can be audited afterwards.
const refs = (process.env.REFS ?? 'linear,stripe,arena,tailscale,hackernoon').split(',').filter(Boolean);
const picks = ['ours', ...refs].filter((id) => existsSync(`${SRC}/${id}.jpg`));
if (picks.length < 6) {
  console.log(`only ${picks.length} images available; need 6`);
  process.exit(1);
}
const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
const shuffled = [...picks];
for (let i = shuffled.length - 1; i > 0; i -= 1) {
  const j = Math.floor(Math.random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
shuffled.forEach((id, i) => copyFileSync(`${SRC}/${id}.jpg`, `${OUT}/${letters[i]}.jpg`));
writeFileSync(`${OUT}/order.json`, `${JSON.stringify({ [process.env.SEED ?? 'seed']: shuffled }, null, 2)}\n`);
console.log(`set: ${letters.slice(0, shuffled.length).join(',')}`);
console.log(`order: ${shuffled.join(' → ')}`);
console.log(`files: ${readdirSync(OUT).filter((f) => f.endsWith('.jpg')).join(', ')}`);
