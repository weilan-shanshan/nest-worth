/**
 * 自动给 README 截图。
 *
 * 使用：先确保 dev server 运行（npm run dev → http://localhost:5174）
 * 然后：node scripts/screenshots.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const OUT = 'docs/screenshots';

mkdirSync(OUT, { recursive: true });

const pages = [
  { name: 'home',      path: '/',          wait: 2500 },
  { name: 'assets',    path: '/assets',    wait: 1500 },
  { name: 'trend',     path: '/trend',     wait: 4000 },   // ECharts 渲染
  { name: 'goals',     path: '/goals',     wait: 1500 },
  { name: 'settings',  path: '/settings',  wait: 1500 },
  { name: 'about',     path: '/about',     wait: 1500 },
  { name: 'setup-key', path: '/setup-key', wait: 1500 }
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--hide-scrollbars']
});

for (const p of pages) {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 2 });
  await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  // 等 AppShell 出现（store.ready 完成）
  await page.waitForSelector('nav', { timeout: 15000 });
  // 等渲染稳定
  await new Promise(r => setTimeout(r, p.wait));
  await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: false });
  await page.close();
  console.log(`✓ ${p.name}.png`);
}

await browser.close();
console.log('\nDone — saved 7 screenshots to docs/screenshots/');
