/** Renders submission/cover.html at 1500×1000 and a 3:2 gallery size. */
import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe');
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(`file://${path.resolve('submission/cover.html')}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: 'submission/cover-1500x1000.png' });
await page.setViewportSize({ width: 1200, height: 800 });
await page.addStyleTag({ content: 'body{transform:scale(.8);transform-origin:top left}' });
await page.waitForTimeout(300);
await page.screenshot({ path: 'submission/cover-3x2.png' });
await browser.close();
console.log('wrote submission/cover-1500x1000.png and cover-3x2.png');
