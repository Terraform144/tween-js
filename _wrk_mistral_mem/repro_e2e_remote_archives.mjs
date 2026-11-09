// E2E archives EN LIGNE (dossier ./Archives, clé ?adm=4321) :
// 1) avec ?adm=4321 : le menu Archives affiche la section « En ligne » ;
// 2) « Sauvegarder en ligne » écrit un fichier dans ./Archives (vu par l'API et sur disque) ;
// 3) la liste en ligne s'affiche ; clic sur une archive -> le projet est rechargé ;
// 4) le bouton 🗑 supprime (API + disque) ;
// 5) SANS la clé : la section en ligne est ABSENTE (menu Archives local seul) ;
// 6) 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_remote_archives.mjs  (dev-server.py sur :8091)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.TJS_URL || 'http://127.0.0.1:8091';
const ROOT = path.resolve(process.cwd());
const ARCHIVES = path.join(ROOT, 'Archives');

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });

async function openApp(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('dialog', (d) => d.accept());
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('#menubar .file-menu-btn', { timeout: 15000 });
  return { page, errs };
}

async function openArchivesMenu(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#menubar .file-menu-btn')]
      .find(b => b.textContent.includes('Archives'));
    btn.click();
  });
  await page.waitForSelector('.archives-menu-panel.open', { timeout: 5000 });
}

async function apiList(page) {
  return page.evaluate(async () => {
    const r = await fetch('/api/archives?adm=4321');
    return r.ok ? r.json() : null;
  });
}

// --- 1-4 : avec la clé ----------------------------------------------------
{
  const { page, errs } = await openApp(BASE + '/?adm=4321');

  await openArchivesMenu(page);
  ok(await page.$('.archives-remote-sep') !== null, 'avec ?adm=4321 : section « En ligne » visible dans Archives');
  ok(await page.$('.archive-remote-save-btn') !== null, 'avec ?adm=4321 : bouton « Sauvegarder en ligne » présent');

  // Renommer le doc pour reconnaître le rechargement
  await page.$eval('#menubar input[type="text"]', (el) => {
    el.value = 'E2E_Archives';
    el.dispatchEvent(new Event('change'));
  });

  // 2) Sauvegarder en ligne
  await page.click('.archive-remote-save-btn');
  let files = [];
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    files = await apiList(page);
    if (files && files.length >= 1) break;
  }
  ok(files && files.length === 1 && /^e2e_archives-\d{8}-\d{6}(-\d+)?\.json$/.test(files[0].name),
    'sauvegarde en ligne : 1 fichier dans ./Archives via l\'API (' + (files[0] && files[0].name) + ')');
  const onDisk = fs.existsSync(path.join(ARCHIVES, files[0].name));
  ok(onDisk, 'sauvegarde en ligne : fichier présent sur disque dans ./Archives');
  const diskContent = onDisk ? fs.readFileSync(path.join(ARCHIVES, files[0].name), 'utf8') : '';
  ok(diskContent.includes('"E2E_Archives"'), 'contenu du fichier = JSON du document (nom présent)');

  // 3) réouvrir le menu : la liste en ligne affiche le fichier
  await page.evaluate(() => document.body.click()); // ferme le menu
  await openArchivesMenu(page);
  await page.waitForSelector('.archive-remote-item', { timeout: 5000 });
  ok(true, 'liste en ligne : 1 archive affichée dans le menu');

  // modifier le nom SANS sauvegarder, puis recharger l'archive -> nom restauré
  await page.$eval('#menubar input[type="text"]', (el) => {
    el.value = 'Modifie_Sans_Sauver';
    el.dispatchEvent(new Event('change'));
  });
  await page.click('.archive-remote-name');
  let nameAfterLoad = '';
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    nameAfterLoad = await page.$eval('#menubar input[type="text"]', (el) => el.value);
    if (nameAfterLoad === 'E2E_Archives') break;
  }
  ok(nameAfterLoad === 'E2E_Archives', 'clic sur l\'archive en ligne recharge le projet (nom restauré : ' + nameAfterLoad + ')');

  // 4) suppression via 🗑
  await page.evaluate(() => document.body.click());
  await openArchivesMenu(page);
  await page.waitForSelector('.archive-remote-del', { timeout: 5000 });
  await page.click('.archive-remote-del'); // confirm() auto-accept
  let after = [{ name: 'sentinel' }];
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    after = await apiList(page);
    if (after && after.length === 0) break;
  }
  ok(after && after.length === 0, 'suppression : liste API vide après 🗑');
  ok(!fs.existsSync(path.join(ARCHIVES, files[0].name)), 'suppression : fichier retiré du disque');

  ok(errs.length === 0, '0 pageerror (avec clé)' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await page.close();
}

// --- 5 : sans la clé -------------------------------------------------------
{
  const { page, errs } = await openApp(BASE + '/');
  await openArchivesMenu(page);
  ok(await page.$('.archives-remote-sep') === null, 'SANS clé : section « En ligne » ABSENTE du menu Archives');
  ok(await page.$('.archive-remote-save-btn') === null, 'SANS clé : pas de bouton « Sauvegarder en ligne »');
  ok(await page.$('.archive-save-btn') !== null, 'SANS clé : le menu Archives local (localStorage) fonctionne toujours');
  ok(errs.length === 0, '0 pageerror (sans clé)' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await page.close();
}

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
