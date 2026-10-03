// Harnais E2E : PWA HORS Ligne. Scénario réaliste par version (dist/main via
// vite preview 4174, vanilla via serveur statique 4175) :
//   1. chargement EN LIGNE -> service worker actif + cache rempli (message
//      CACHE_URLS de index.html) ;
//   2. ARRET COMPLET DU SERVEUR (kill du process enfant — aucune simulation,
//      le réseau est réellement coupé) ;
//   3. rechargement de la page -> elle doit démarrer DEPUIS LE CACHE SW :
//      app montée (stage Konva présent), manifeste et icône servis.
// Run : copier dans /tmp/e2e puis `node pwa_offline.mjs`.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const REPO = 'F:/_SRC/__Debrouillard/Animate_JS_PRJ';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
function check(label, cond) {
  console.log((cond ? '  OK  ' : 'FAIL  ') + label);
  if (!cond) failed++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer(port, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch('http://localhost:' + port + '/');
      if (res.ok) return true;
    } catch (e) { /* pas encore pret */ }
    await sleep(250);
  }
  return false;
}

async function swState(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { state: 'none' };
    const c = await caches.open('animatejs-v1');
    const keys = await c.keys();
    return { state: reg.active ? 'activated' : (reg.waiting ? 'waiting' : 'installing'), entries: keys.length };
  });
}

async function scenario(name, port, startServer) {
  console.log('=== ' + name + ' (port ' + port + ') ===');
  let server;
  try {
    server = startServer();
    if (!(await waitServer(port, 20000))) { check('serveur demarre', false); return; }
    check('serveur demarre', true);

    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
    await page.setViewport({ width: 900, height: 700 });
    await page.goto('http://localhost:' + port + '/', { waitUntil: 'networkidle0', timeout: 20000 });

    // SW actif + cache rempli
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await swState(page);
      if (st.state === 'activated' && st.entries >= 8) break;
      await sleep(500);
    }
    console.log('  SW : ' + JSON.stringify(st));
    check('service worker actif', st.state === 'activated');
    check('cache rempli (>= 8 entrees)', st.entries >= 8);

    // Le manifeste est servi et reference les icones
    const manifest = await page.evaluate(async () => {
      const r = await fetch('manifest.webmanifest');
      return r.ok ? await r.json() : null;
    });
    check('manifeste servi', manifest && manifest.name === 'Animate JS' && Array.isArray(manifest.icons));

    // Rechargement EN LIGNE : la page passe sous controle SW
    await page.reload({ waitUntil: 'networkidle0', timeout: 20000 });
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    check('page controlee par le SW apres rechargement', controlled);

    // ---- COUPURE REELLE : on tue le serveur ----
    await new Promise((r) => {
      if (server && server.pid) { try { process.kill(-server.pid); } catch (e) { /* windows */ } }
      if (server && server.kill) server.kill();
      setTimeout(r, 500);
    });
    await sleep(500);
    check('serveur arrete (reseau reellement coupe)', true);

    // Rechargement HORS LIGNE : la page doit demarrer depuis le cache
    await page.reload({ waitUntil: 'load', timeout: 15000 }).catch((e) => console.log('  [reload] ' + e.message));
    await sleep(1500);
    const offline = await page.evaluate(() => {
      const canvasHost = document.querySelector('.konvajs-content');
      return {
        title: document.title,
        hasApp: !!document.getElementById('app'),
        hasMenubar: !!document.getElementById('menubar'),
        hasStage: !!canvasHost && !!canvasHost.querySelector('canvas'),
        bodyText: (document.body.innerText || '').slice(0, 80),
      };
    });
    console.log('  hors ligne : ' + JSON.stringify(offline));
    check('pas de page d\'erreur navigateur (neterror)', !/ERR_|ne peut pas|Can.t be reached|introuvable/i.test(offline.bodyText));
    check('app demarree hors ligne (menubar + stage Konva)', offline.hasApp && offline.hasMenubar && offline.hasStage);

    // Manifeste et icone servis hors ligne via le SW
    const assetsOffline = await page.evaluate(async () => {
      const m = await fetch('manifest.webmanifest');
      const i = await fetch('icons/icon-512.png');
      return { manifest: m.status, icon: i.status };
    });
    console.log('  fetch hors ligne : manifeste=' + assetsOffline.manifest + ' icone=' + assetsOffline.icon);
    check('manifeste + icone servis hors ligne', assetsOffline.manifest === 200 && assetsOffline.icon === 200);

    await page.close();
  } catch (err) {
    console.log('EXCEPTION ' + name + ' : ' + err.message);
    failed++;
    if (server && server.kill) server.kill();
  }
}

// --- Scenario 1 : build main (dist) via vite preview ---
await scenario('DIST (main)', 4174, () => {
  const p = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { cwd: REPO, shell: true, detached: false });
  return p;
});

// --- Scenario 2 : PureVanilla (le dossier deploye sur LWS) via serveur statique ---
await scenario('PURE VANILLA', 4175, () => {
  const p = spawn('node', ['vanilla_server.mjs'], { cwd: process.cwd(), shell: true, detached: false });
  return p;
});

await browser.close();
console.log(failed === 0 ? '\nTOUS LES CONTROLES OK' : '\nECHECS : ' + failed);
process.exit(failed === 0 ? 0 : 1);
