// Génère les icônes PWA depuis l'icône launcher Android du projet (192x192,
// même image que l'APK pour cohérence) : icon-192.png (taille native),
// icon-512.png (agrandi — requis par Chrome pour l'installabilité) et
// apple-touch-icon.png (180). Écrit dans public/icons/.
// Run : copier dans /tmp/e2e puis `node make_pwa_icons.mjs`.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const SRC = 'F:/_SRC/__Debrouillard/Animate_JS_PRJ/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png';
const OUT_DIR = 'F:/_SRC/__Debrouillard/Animate_JS_PRJ/public/icons';

mkdirSync(OUT_DIR, { recursive: true });
const b64 = readFileSync(SRC).toString('base64');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
const results = await page.evaluate(async (dataUrl) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + dataUrl;
  await img.decode();
  const render = (size) => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size, size);
    return c.toDataURL('image/png');
  };
  return {
    'icon-192.png': render(192),
    'icon-512.png': render(512),
    'apple-touch-icon.png': render(180),
  };
}, b64);
await browser.close();

for (const [name, dataUrl] of Object.entries(results)) {
  writeFileSync(OUT_DIR + '/' + name, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('OK  ' + name + ' (' + Math.round((dataUrl.length - 22) * 3 / 4 / 1024) + ' Ko)');
}
