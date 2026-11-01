// Harnais v2 "Ouvrir un dossier" (projectExport.js) : round-trip export -> modif
// externe -> relecture. buildProjectTree -> on modifie un .js et un binaire dans
// l'arbre -> resolveAssetsFromFiles + applyScriptFiles -> le doc reconstitué a
// les .js prioritaires et les dataUrl restaurés. Pur (Node).
import { buildProjectTree, resolveAssetsFromFiles, applyScriptFiles } from '../src/export/projectExport.js';
import { createDocument, createKeyframe, createSymbol, createScript, createAsset, addAsset } from '../src/core/model.js';

let passed = 0, failed = 0;
const ok = (c, name) => { if (c) { passed++; console.log('  OK  ' + name); } else { failed++; console.log('  FAIL ' + name); } };
const enc = new TextEncoder(), dec = new TextDecoder();

// --- doc original ---
const doc = createDocument({ name: 'RT' });
const pngBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const pngUrl = 'data:image/png;base64,' + Buffer.from(pngBytes).toString('base64');
const a1 = addAsset(doc, createAsset({ name: 'pix', type: 'image/png', dataUrl: pngUrl }));
doc.scripts = [createScript('Principal', 'Scene.play();')];
const sym = createSymbol('Logo');
sym.script = 'this.x = 0;';
const skf = createKeyframe(3, []); skf.script = 'Scene.stop();';
sym.layers[0].keyframes.push(skf);
doc.symbols[sym.id] = sym;
const kf = createKeyframe(5, []); kf.script = 'Scene.gotoAndPlay(1);';
doc.layers[0].keyframes.push(kf);

// --- export vers arbre (Map path -> bytes) ---
const tree = buildProjectTree(doc);
const files = new Map(tree.files.map((f) => [f.path, f.data]));

// --- modif "externe" dans le dossier : un .js et un binaire ---
files.set('scripts/Principal.js', enc.encode('Scene.stop(); // modifié dans VS Code'));
files.set('scripts/Logo_class.js', enc.encode('this.x = 99; // modifié'));
files.set('scripts/Logo_f4_Calque_1.js', enc.encode('// frame action modifiée'));
files.set('scripts/scene_f6_Calque_1.js', enc.encode('// scène modifiée'));
const newPng = new Uint8Array([137, 80, 78, 71, 9, 9, 9]);
files.set(files.get('projet.json') && tree.assets[a1.id], newPng); // binaire remplacé

// --- relecture (ce que fait loadProjectFromDirectory après readDirRecursive) ---
const raw = JSON.parse(dec.decode(files.get('projet.json')));
const nAssets = resolveAssetsFromFiles(raw, files);
const scriptFiles = [...files.entries()]
  .filter(([p]) => p.startsWith('scripts/') && p.endsWith('.js'))
  .map(([p, d]) => ({ name: p.slice(8), code: dec.decode(d) }));
const nScripts = applyScriptFiles(raw, scriptFiles);

ok(nAssets === 1, '1 asset résolu depuis le dossier');
ok(raw.assets[a1.id].dataUrl === 'data:image/png;base64,' + Buffer.from(newPng).toString('base64'), 'dataUrl restauré = binaire (modifié) du dossier');
ok(!('src' in raw.assets[a1.id]), 'src retiré après résolution');
ok(nScripts === 4, '4 scripts .js réinjectés (nommé + classe + 2 frame actions), n=' + nScripts);
ok(raw.scripts[0].code.includes('modifié dans VS Code'), 'script nommé : le .js écrase le code inline');
ok(raw.symbols[sym.id].script === 'this.x = 99; // modifié', 'script de symbole : _class.js prioritaire');
ok(raw.symbols[sym.id].layers[0].keyframes.find(k => k.index === 3).script === '// frame action modifiée', 'kf script du symbole réinjecté');
ok(raw.layers[0].keyframes.find(k => k.index === 5).script === '// scène modifiée', 'kf script scène racine réinjecté');

// --- non-modifié : un .js absent du dossier laisse le code inline ---
const files2 = new Map(tree.files.map((f) => [f.path, f.data]));
files2.delete('scripts/Principal.js');
const raw2 = JSON.parse(dec.decode(files2.get('projet.json')));
applyScriptFiles(raw2, [...files2.entries()].filter(([p]) => p.startsWith('scripts/')).map(([p, d]) => ({ name: p.slice(8), code: dec.decode(d) })));
ok(raw2.scripts[0].code === 'Scene.play();', 'sans .js dans le dossier, le code inline du JSON reste (fallback)');

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
