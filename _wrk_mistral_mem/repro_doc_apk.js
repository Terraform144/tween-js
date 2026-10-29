// Repro « la doc n'est pas téléchargeable dans l'app Android » :
// 1. contexte APK simulé (window.Capacitor.isNativePlatform() === true) :
//    le menu Documentation doit ouvrir docs/Animate-JS-Documentation.html
//    dans la MÊME fenêtre (window.open est inopérant en WebView Capacitor,
//    et le WebView ne rend pas les PDF).
// 2. contexte navigateur (pas de Capacitor) : window.open reçoit le chemin
//    du PDF, inchangé.
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = '/run/media/zulup/TOSHIBA EXT/_SRC/__Debrouillard/Animate_JS_PRJ/dist';
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf' };

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

let failures = 0;
function check(name, ok) {
  console.log((ok ? 'OK   ' : 'ECHEC') + ' ' + name);
  if (!ok) failures++;
}

async function openMenu(page) {
  await page.evaluate(() => {
    [...document.querySelectorAll('#menubar button')].find(b => b.textContent.includes('À propos')).click();
  });
  await new Promise(r => setTimeout(r, 150));
}

(async () => {
  await new Promise(r => server.listen(8128, r));

  // ---- contexte APK (Capacitor natif simulé) ----
  let browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  let page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.Capacitor = { isNativePlatform: () => true };
  });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('http://127.0.0.1:8128/', { waitUntil: 'networkidle0' });
  await openMenu(page);
  await page.evaluate(() => {
    [...document.querySelectorAll('.file-menu-panel.open button')].find(b => b.textContent.includes('Documentation')).click();
  });
  await page.waitForNavigation({ waitUntil: 'load', timeout: 5000 }).catch(() => {});
  const url = page.url();
  const html = await page.evaluate(() => ({
    isDoc: document.body && !!document.body.innerHTML.includes('Animate JS'),
    hasChap9: document.body ? document.body.innerHTML.includes('9. Coder avec TweenJS') : false,
  }));
  check('APK simulé : navigation vers ' + url, url.includes('/docs/Animate-JS-Documentation.html'));
  check('APK simulé : la page doc rendue contient le titre', html.isDoc);
  check('APK simulé : la doc est bien la version fusionnée (chapitre 9)', html.hasChap9);
  check('APK simulé : 0 pageerror', pageErrors.length === 0);
  await browser.close();

  // ---- contexte navigateur (pas de Capacitor) : comportement inchangé ----
  browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__openCalls = [];
    const orig = window.open.bind(window);
    window.open = (...args) => { window.__openCalls.push(args[0]); return orig(...args); };
  });
  await page.goto('http://127.0.0.1:8128/', { waitUntil: 'networkidle0' });
  await openMenu(page);
  await page.evaluate(() => {
    [...document.querySelectorAll('.file-menu-panel.open button')].find(b => b.textContent.includes('Documentation')).click();
  });
  const calls = await page.evaluate(() => window.__openCalls);
  check('navigateur : window.open("' + (calls[0] || '') + '")', calls.length === 1 && calls[0] === '/docs/Animate-JS-Documentation.pdf');
  await browser.close();

  server.close();
  console.log(failures === 0 ? 'TOUS LES CONTROLES OK' : failures + ' ECHEC(S)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR E2E:', e); process.exit(1); });
