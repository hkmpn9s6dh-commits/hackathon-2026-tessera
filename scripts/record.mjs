/**
 * Records a silent, caption-burned picture lock of the demo, in one take, against dist/.
 *
 *   node scripts/record.mjs      # writes video/raw/*.webm
 *   node scripts/video.mjs       # converts to mp4 (and muxes video/voice.wav if present)
 *
 * Silent on purpose: the entry's voice-over has to be the entrant's own, so this leaves a picture
 * a person can narrate over, or watch without sound.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const OUT = 'video/raw';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4319/';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(BASE, { waitUntil: 'networkidle' });

await page.addStyleTag({
  content: `
  #film { position: fixed; inset: auto 0 0 0; z-index: 99999; pointer-events: none;
    padding: 26px 48px 30px; font: 400 26px/1.35 "Plex Sans", system-ui, sans-serif;
    color: #f6f3ea; letter-spacing: .01em;
    background: linear-gradient(180deg, rgba(21,23,27,0) 0%, rgba(21,23,27,.84) 44%, rgba(21,23,27,.95) 100%);
    opacity: 0; transition: opacity 300ms ease; }
  #film.on { opacity: 1; }
  #film b { color: #e0a08a; font-weight: 500; }
  #endcard { position: fixed; inset: 0; z-index: 99998; background: #f6f3ea; display: grid;
    align-content: center; justify-items: center; gap: 18px; text-align: center; }
  #endcard .mark { font-family: "Plex Mono", monospace; font-size: 30px; letter-spacing: .3em; color: #15171b; }
  #endcard .line { font-family: Fraunces, Georgia, serif; font-size: 74px; line-height: .98; letter-spacing: -.02em; color: #15171b; }
  #endcard .url { font-family: "Plex Mono", monospace; font-size: 21px; color: #2e6b4f; margin-top: 10px; }
  #endcard .meta { font-family: "Plex Mono", monospace; font-size: 16px; color: #6b675c; }
  html { scroll-behavior: smooth; }
  `,
});

const caption = async (html, ms) => {
  await page.evaluate((h) => {
    let el = document.getElementById('film');
    if (!el) {
      el = document.createElement('div');
      el.id = 'film';
      document.body.append(el);
    }
    el.innerHTML = h;
    el.classList.add('on');
  }, html);
  if (ms) await wait(ms);
};

const scrollTo = async (selector, offset = 0) => {
  await page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: 'smooth' });
    },
    [selector, offset],
  );
  await wait(1100);
};

// --- 1. the problem
await caption('Every agent hands you a <b>log</b>.', 0);
await wait(6000);
await caption('None of them hands you <b>evidence</b>.', 0);
await wait(5600);

// --- 2. run
await scrollTo('#record', 90);
await caption('An agent does twelve small things.', 0);
await page.click('#run-agent');
await wait(2000);
await caption('Each one becomes a tile: the tool, what it read, what came back.', 0);
await page.waitForFunction(() => (document.querySelector('#record-status')?.textContent ?? '').includes('sealed'), null, { timeout: 15000 });
await wait(1600);
await caption('Seal them: twelve hashes become one root, signed with the operator&rsquo;s key.', 0);
await wait(6000);

// --- 3. verify clean
await scrollTo('body', 0);
await page.click('[data-sample="clean"]');
await wait(1400);
await caption('Anyone can check it — offline, in a browser, with nothing installed.', 0);
await wait(5600);

// --- 4. tampered
await page.click('[data-sample="tampered"]');
await wait(1000);
await caption('One field edited after sealing. It names the <b>step</b>, and the <b>field</b>.', 0);
await wait(6000);

// --- 5. forged
await page.click('[data-sample="forged"]');
await wait(1400);
await caption('The chain still adds up — but without the key, the seal breaks.', 0);
await wait(5600);

// --- 6. disclose
await scrollTo('#disclose', 90);
await page.click('#make-proof');
await wait(700);
await page.click('#check-proof');
await wait(700);
await caption('Prove one step, without handing over the other eleven.', 0);
await wait(5600);

// --- 7. end card
await scrollTo('body', 0);
await page.evaluate(() => {
  const film = document.getElementById('film');
  if (film) film.remove();
  const card = document.createElement('div');
  card.id = 'endcard';
  card.innerHTML = `
    <div class="mark">TESSERA</div>
    <div class="line">Receipts an agent<br/>cannot edit after the fact.</div>
    <div class="url">hkmpn9s6dh-commits.github.io/hackathon-2026-tessera</div>
    <div class="meta">MIT &nbsp;·&nbsp; 0 external requests &nbsp;·&nbsp; 200/200 mutations located</div>`;
  document.body.append(card);
});
await wait(6200);

const video = context.pages()[0]?.video();
await context.close();
await browser.close();
if (video) {
  const saved = await video.path();
  const target = path.join(OUT, 'take.webm');
  renameSync(saved, target);
  console.log(`recorded ${target}`);
}
console.log(`files: ${readdirSync(OUT).join(', ')}`);
