// Harnais export "projet vers dossier" (src/export/projectExport.js).
// Teste buildProjectTree (pur) : arborescence projet.json + assets/ + scripts/,
// dataUrl -> binaire décodé + src relatif + dataUrl retiré, metas scriptFile
// retirées, tjsFormat posé, collisions de noms, extensions MIME ; et le ZIP.
// Usage : node _wrk_mistral_mem/repro_projectexport.mjs   (depuis la racine du projet)
import { buildProjectTree, supportsDirectoryExport, exportProjectToZip } from '../src/export/projectExport.js';
import { createDocument, createLayer, createKeyframe, createSymbol, createScript, createAsset, addAsset } from '../src/core/model.js';

let passed = 0, failed = 0;
const ok = (c, name) => { if (c) { passed++; console.log('  OK  ' + name); } else { failed++; console.log('  FAIL ' + name); } };
const dec = new TextDecoder();

// --- doc de test ---
const doc = createDocument({ name: 'Mon Projet!' });
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 255]); // faux PNG
const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9]);
const pngUrl = 'data:image/png;base64,' + Buffer.from(pngBytes).toString('base64');
const wavUrl = 'data:audio/wav;base64,' + Buffer.from(wavBytes).toString('base64');

const a1 = addAsset(doc, createAsset({ name: 'image 1', type: 'image/png', dataUrl: pngUrl, width: 10, height: 10 }));
const a2 = addAsset(doc, createAsset({ name: 'image 1', type: 'image/png', dataUrl: pngUrl })); // même nom -> collision
const a3 = addAsset(doc, { id: 'assetAudio1', name: 'bip', type: 'audio/wav', kind: 'audio', dataUrl: wavUrl });
doc.assets[a3.id] = a3;

doc.scripts = [
  createScript('Script principal', 'Scene.play();'),
  createScript('mon script spécial!', 'console.log(1);'),
];

// symbole avec script de classe + meta scriptFile (à retirer) + kf script interne
const sym = createSymbol('Logo animé');
sym.script = 'this.x = 0; // constructeur';
sym.scriptFile = { fileName: 'Logo.js', mode: 'linked' }; // meta workflow : JAMAIS exportée
const skf = createKeyframe(3, []);
skf.script = 'Scene.stop(); // frame action du symbole';
sym.layers[0].keyframes.push(skf);
doc.symbols[sym.id] = sym;

// kf script sur la scène racine
const kf = createKeyframe(5, []);
kf.script = 'Scene.gotoAndPlay("intro");';
doc.layers[0].keyframes.push(kf);

console.log('== buildProjectTree ==');
const tree = buildProjectTree(doc);
const byPath = new Map(tree.files.map((f) => [f.path, f]));
const paths = [...byPath.keys()].sort();
console.log('  fichiers:', paths.join(', '));

ok(byPath.has('projet.json'), 'projet.json présent');
const json = JSON.parse(dec.decode(byPath.get('projet.json').data));
ok(json.tjsFormat === 'folder-project' && json.tjsVersion === 1, 'marqueur tjsFormat/tjsVersion posé');
ok(json.assets[a1.id].src === 'assets/image_1.png' && !('dataUrl' in json.assets[a1.id]), 'asset image: src relatif, dataUrl retiré');
ok(json.assets[a2.id].src !== json.assets[a1.id].src && byPath.has(json.assets[a2.id].src), 'collision de noms gérée (2 assets "image 1" -> chemins distincts)');
ok(json.assets[a3.id].src === 'assets/bip.wav', 'asset audio -> .wav (ext depuis le type MIME)');
ok(!('scriptFile' in json.symbols[sym.id]), 'meta scriptFile du symbole retirée du JSON');
ok(!('scriptFile' in json.layers[0].keyframes.find((k) => k.index === 5)), 'pas de scriptFile sur les kf scène (si meta posée)');

// binaires décodés correctement
const pngFile = byPath.get(json.assets[a1.id].src);
ok(pngFile && [...pngFile.data].join(',') === [...pngBytes].join(','), 'binaire PNG = octets originaux du dataUrl');
const wavFile = byPath.get(json.assets[a3.id].src);
ok(wavFile && [...wavFile.data].join(',') === [...wavBytes].join(','), 'binaire WAV = octets originaux');

// scripts éclatés
ok([...byPath.keys()].some((p) => p.startsWith('scripts/') && p.endsWith('.js') && dec.decode(byPath.get(p).data) === 'Scene.play();'), 'script nommé exporté en .js avec code exact');
ok([...byPath.keys()].some((p) => p.includes('mon_script_sp_cial') && dec.decode(byPath.get(p).data) === 'console.log(1);'), 'nom de script sanitizé');
ok([...byPath.keys()].some((p) => p.includes('Logo_anim') && p.includes('_class') && dec.decode(byPath.get(p).data).includes('constructeur')), 'script de symbole -> scripts/<sym>_class.js');
ok([...byPath.keys()].some((p) => p.includes('Logo_anim') && p.includes('_f4_') && dec.decode(byPath.get(p).data).includes('Scene.stop')), 'kf script du symbole -> scripts/<sym>_f4_<calque>.js');
ok([...byPath.keys()].some((p) => p.includes('scene_f6_') && dec.decode(byPath.get(p).data).includes('gotoAndPlay')), 'kf script scène racine -> scripts/scene_f6_*.js');
ok(!JSON.stringify(json).includes('linked'), 'aucune trace de la meta "linked" dans le JSON');

console.log('== ZIP (fallback) ==');
ok(supportsDirectoryExport() === false, 'supportsDirectoryExport false sous Node');
globalThis.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.URL.revokeObjectURL = () => {};
const zipBlob = exportProjectToZip(doc);
ok(zipBlob && zipBlob.type === 'application/zip' && zipBlob.size > 100, 'ZIP produit (type application/zip, size=' + (zipBlob && zipBlob.size) + ')');
const zipBuf = new Uint8Array(await zipBlob.arrayBuffer());
ok(zipBuf[0] === 0x50 && zipBuf[1] === 0x4b, 'en-tête PK (ZIP valide)');

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
