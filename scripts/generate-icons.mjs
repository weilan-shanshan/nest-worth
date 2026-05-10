/**
 * 从 public/favicon.svg 生成 PWA 所需的 PNG icon。
 * 使用：node scripts/generate-icons.mjs
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svg = readFileSync('public/favicon.svg', 'utf8');

const sizes = [
  { name: 'icon-192.png',          size: 192, padding: 0 },
  { name: 'icon-512.png',          size: 512, padding: 0 },
  { name: 'icon-512-maskable.png', size: 512, padding: 64 },   // maskable 安全区
  { name: 'apple-touch-icon.png',  size: 180, padding: 0 }
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

for (const cfg of sizes) {
  const page = await browser.newPage();
  await page.setViewport({ width: cfg.size, height: cfg.size, deviceScaleFactor: 1 });
  const inner = cfg.size - cfg.padding * 2;
  const html = `<!DOCTYPE html><html><head><style>
    html, body { margin: 0; padding: 0; }
    body {
      width: ${cfg.size}px; height: ${cfg.size}px;
      background: #2E9E60;
      display: flex; align-items: center; justify-content: center;
    }
    .wrap { width: ${inner}px; height: ${inner}px; }
    svg { display: block; width: 100%; height: 100%; }
  </style></head><body><div class="wrap">${svg}</div></body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: `public/${cfg.name}`, omitBackground: false });
  await page.close();
  console.log(`✓ public/${cfg.name}`);
}

await browser.close();
