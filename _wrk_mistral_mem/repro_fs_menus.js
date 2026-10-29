// Repro du bug « menus inertes en plein écran » : charge la version main
// (dist/) sur http://localhost, ouvre le menu Fichier, entre en plein écran
// (repli CSS car HTTP), rouvre le menu et vérifie que le panneau est monté
// DANS l'élément plein écran et visible.
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

(async () => {
  await new Promise(r => server.listen(8127, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--window-size=1280,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.goto('http://127.0.0.1:8127/', { waitUntil: 'networkidle0' });

  // 1. fenêtre normale : Fichier ouvre un panneau monté dans body, visible
  await page.click('#menubar .file-menu-btn');
  let state = await page.evaluate(() => {
    const panel = document.querySelector('.file-menu-panel.open');
    if (!panel) return { mounted: null };
    const r = panel.getBoundingClientRect();
    return { mounted: panel.parentNode.tagName, visible: r.width > 0 && r.height > 0, top: Math.round(r.top) };
  });
  check('fenêtre normale : panneau ouvert dans <' + state.mounted + '>, visible=' + state.visible, state.mounted === 'BODY' && state.visible);
  await page.keyboard.press('Escape');

  // 2. plein écran (repli CSS sur http) : #app.fs-css-active + body.fs-css
  const fsBtn = await page.evaluateHandle(() => [...document.querySelectorAll('#menubar button')].find(b => b.textContent.includes('Plein écran')));
  await fsBtn.asElement().click();
  await new Promise(r => setTimeout(r, 300));
  let fsState = await page.evaluate(() => ({
    fsActive: !!document.querySelector('.fs-css-active'),
    isApp: document.querySelector('.fs-css-active')?.id === 'app',
    bodyFs: document.body.classList.contains('fs-css'),
  }));
  check('plein écran (repli CSS) actif sur #app', fsState.fsActive && fsState.isApp && fsState.bodyFs);

  // 3. LE BUG : ouvrir Fichier EN plein écran -> panneau doit être dans
  //    l'élément plein écran et rester visible
  await page.click('#menubar .file-menu-btn');
  await new Promise(r => setTimeout(r, 150));
  state = await page.evaluate(() => {
    const panel = document.querySelector('.file-menu-panel.open');
    if (!panel) return { mounted: null, visible: false, top: -1 };
    const r = panel.getBoundingClientRect();
    const fsEl = document.querySelector('.fs-css-active');
    return {
      mounted: panel.parentNode === fsEl ? 'FULLSCREEN-EL' : panel.parentNode.tagName,
      visible: r.width > 0 && r.height > 0 && r.top >= 0,
      top: Math.round(r.top),
    };
  });
  check('plein écran : panneau ouvert dans <' + state.mounted + '>, visible=' + state.visible + ', top=' + state.top, state.mounted === 'FULLSCREEN-EL' && state.visible);

  // 4. un item du menu reste cliquable (le panneau réagit)
  const clickRes = await page.evaluate(() => {
    const panel = document.querySelector('.file-menu-panel.open');
    const btn = panel && panel.querySelector('button');
    if (!btn) return 'aucun bouton';
    btn.click();
    return 'clic émis';
  });
  check('plein écran : item cliquable (' + clickRes + ')', clickRes === 'clic émis');
  await page.keyboard.press('Escape');

  // 5. sortie de plein écran : retour au comportement normal (body)
  await page.evaluate(() => document.querySelector('#menubar button')?.blur());
  const exitBtn = await page.evaluateHandle(() => [...document.querySelectorAll('#menubar button')].find(b => b.textContent.includes('Quitter le plein écran')));
  await exitBtn.asElement().click();
  await new Promise(r => setTimeout(r, 300));
  const afterExit = await page.evaluate(() => ({ fsActive: !!document.querySelector('.fs-css-active') }));
  check('sortie du plein écran', !afterExit.fsActive);
  await page.click('#menubar .file-menu-btn');
  state = await page.evaluate(() => {
    const panel = document.querySelector('.file-menu-panel.open');
    return { mounted: panel ? panel.parentNode.tagName : null };
  });
  check('après sortie : panneau dans <' + state.mounted + '>', state.mounted === 'BODY');

  check('aucune pageerror', pageErrors.length === 0);
  if (pageErrors.length) console.log(pageErrors.join('\n'));

  await browser.close();
  server.close();
  console.log(failures === 0 ? 'TOUS LES CONTROLES OK' : failures + ' ECHEC(S)');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR E2E:', e); process.exit(1); });
