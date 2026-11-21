// Génère LIVRE_POC.test.json — petit livre-dont-vous-être-le-héros sur les
// actions de la preuve de concept TweenJS (scrollbars, piste caméra,
// Scene.camera, APK, pomodoros), illustré par endroits (formes vectorielles).
// Structure : 7 frames labellisées p1..p7, boutons = formes nommées, navigation
// par Scene.onClick('nom', ...) + Scene.gotoAndPlay(label). Page p4 zoome via
// Scene.camera.set (dogfooding de la feature livrée).
// Run: node _wrk_mistral_mem/gen_livre_poc.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDocument, createLayer, createShape, createPathPoint, insertKeyframe, setFrameLabel } from '../src/core/model.js';

const OUT = fileURLToPath(new URL('./LIVRE_POC.test.json', import.meta.url));

const W = 480, H = 640;
const INK = '#073642', ACCENT = '#cb4b16', PAPER = '#fdf6e3', GREY = '#93a1a1';

const doc = createDocument({ name: 'Livre dont tu es le héros — la PoC', width: W, height: H, frameRate: 12 });
doc.frameCount = 7;
doc.backgroundColor = PAPER;
const layer = doc.layers[0];
layer.name = 'pages';

// --- helpers ---
// Le texte est centré sur sa boîte (offsetX/Y = w/2, h/2) : on donne le coin
// haut-gauche et on calcule le centre.
function textEl(topLeftX, topLeftY, str, { fontSize = 16, fill = INK, width = 400, align = 'left', fontFamily = 'Georgia' } = {}) {
  const lines = str.split('\n').length;
  const h = lines * fontSize * 1.25;
  return createShape('text', {
    text: str, fontSize, fontFamily, fill, width, align, lineHeight: 1.25,
    x: topLeftX + width / 2, y: topLeftY + h / 2,
    stroke: undefined, strokeWidth: 0, fill2: undefined,
  });
}
function rectEl(cx, cy, w, h, { fill = ACCENT, stroke = INK, strokeWidth = 2 } = {}) {
  return createShape('rect', { x: cx, y: cy, width: w, height: h, fill, stroke, strokeWidth });
}
function ellipseEl(cx, cy, rx, ry, { fill = 'transparent', stroke = INK, strokeWidth = 2 } = {}) {
  return createShape('ellipse', { x: cx, y: cy, width: rx * 2, height: ry * 2, fill, stroke, strokeWidth });
}
function lineEl(x, y, pts, { stroke = INK, strokeWidth = 2 } = {}) {
  return createShape('line', { x, y, points: pts.map(([px, py]) => createPathPoint(px, py)), stroke, strokeWidth, fill: undefined });
}
// Bouton cliquable : rectangle nommé + étiquette centrée dessus.
function buttonEl(name, cx, cy, w, h, label) {
  return [
    Object.assign(rectEl(cx, cy, w, h, { fill: ACCENT, stroke: INK, strokeWidth: 2 }), { name }),
    textEl(cx - w / 2 + 12, cy - 11, label, { fontSize: 15, fill: PAPER, width: w - 24, align: 'left' }),
  ];
}
function titleEl(str) { return textEl(40, 34, str, { fontSize: 27, width: 400, align: 'left' }); }
function bodyEl(str) { return textEl(40, 100, str, { fontSize: 16, width: 400, align: 'left' }); }

// --- illustrations ---
function illusDebordement() { // p1 : la feuille dépasse de la zone
  return [
    rectEl(210, 300, 300, 190, { fill: '#e9dfc2', stroke: GREY, strokeWidth: 1 }),          // zone de travail
    rectEl(300, 350, 320, 210, { fill: '#ffffff', stroke: INK, strokeWidth: 1.5 }),          // la feuille (dépasse à droite/bas)
    rectEl(452, 350, 8, 210, { fill: ACCENT, stroke: 'none', strokeWidth: 0 }),              // scrollbar verticale
    rectEl(300, 552, 320, 8, { fill: ACCENT, stroke: 'none', strokeWidth: 0 }),              // scrollbar horizontale
  ];
}
function illusScrollbars() { // p2 : petite feuille avec ses 2 scrollbars
  return [
    rectEl(240, 310, 200, 140, { fill: '#ffffff', stroke: INK, strokeWidth: 1.5 }),
    rectEl(334, 310, 7, 140, { fill: ACCENT, stroke: 'none', strokeWidth: 0 }),
    rectEl(240, 374, 200, 7, { fill: ACCENT, stroke: 'none', strokeWidth: 0 }),
  ];
}
function illusCamera() { // p3 : cadre caméra + poignées d'angle + poignée de rotation
  const els = [rectEl(240, 300, 240, 160, { fill: 'transparent', stroke: ACCENT, strokeWidth: 1.5 })];
  for (const [cx, cy] of [[120, 220], [360, 220], [360, 380], [120, 380]]) {
    els.push(ellipseEl(cx, cy, 5, 5, { fill: '#ffffff', stroke: ACCENT, strokeWidth: 1.5 }));
  }
  els.push(lineEl(240, 220, [[0, 0], [0, -22]], { stroke: ACCENT, strokeWidth: 1.5 }));
  els.push(ellipseEl(240, 192, 6, 6, { fill: '#ffffff', stroke: ACCENT, strokeWidth: 1.5 }));
  return els;
}
function illusPixelsPerdus() { // p5 : petits carrés gris éparpillés
  return [[90, 240], [150, 300], [210, 260], [280, 330], [340, 280], [390, 350], [120, 380], [320, 410]]
    .map(([x, y]) => rectEl(x, y, 12, 12, { fill: GREY, stroke: 'none', strokeWidth: 0 }));
}
function illusHorloge() { // p6 : horloge (pomodoro)
  return [
    ellipseEl(240, 310, 52, 52, { fill: '#ffffff', stroke: INK, strokeWidth: 2 }),
    lineEl(240, 310, [[0, 0], [0, -32]], { stroke: ACCENT, strokeWidth: 3 }),
    lineEl(240, 310, [[0, 0], [22, 12]], { stroke: INK, strokeWidth: 2 }),
  ];
}
function illusHeros() { // p7 : petit héros
  return [
    ellipseEl(240, 262, 18, 18, { fill: '#f0a94f', stroke: INK, strokeWidth: 2 }),            // tête
    rectEl(240, 322, 26, 56, { fill: ACCENT, stroke: INK, strokeWidth: 2 }),                  // corps
    lineEl(240, 300, [[-30, -10], [30, -10]], { stroke: INK, strokeWidth: 3 }),                // bras levés
    lineEl(240, 350, [[-12, 0], [-12, 26], [12, 0], [12, 26]].slice(0, 2), { stroke: INK, strokeWidth: 3 }),
    lineEl(240, 350, [[12, 0], [12, 26]], { stroke: INK, strokeWidth: 3 }),
  ];
}

// --- pages : [label, titre, corps, illustrations, choix [{name, label, cible}], scriptFrame] ---
const PAGES = [
  ['p1', 'Le commencement', 'La scène déborde de la zone de travail.\nQue fais-tu, héros de la PoC ?', illusDebordement(),
    [{ name: 'p1a', label: '→ Ajouter les scrollbars H/V', cible: 'p2' }, { name: 'p1b', label: '→ Zoomer à fond quand même', cible: 'p5' }],
    'Scene.camera.set({ zoom: 1, x: 240, y: 320 });'],
  ['p2', 'Les scrollbars', 'Scrollbars natives : toute la feuille reste atteignable.\nEt la caméra, dans tout ça ?', illusScrollbars(),
    [{ name: 'p2a', label: '→ La caméra dans la timeline', cible: 'p3' }, { name: 'p2b', label: '→ Une pause pomodoro', cible: 'p6' }],
    'Scene.camera.set({ zoom: 1, x: 240, y: 320 });'],
  ['p3', 'La piste caméra', 'La piste caméra veille en haut de la timeline, toujours visible.\nTu choisis :', illusCamera(),
    [{ name: 'p3a', label: '→ Exposer Scene.camera aux scripts', cible: 'p4' }, { name: 'p3b', label: '→ Laisser la caméra au clavier', cible: 'p5' }],
    'Scene.camera.set({ zoom: 1, x: 240, y: 320 });'],
  ['p4', 'Scene.camera', 'Les scripts pilotent la caméra : le monde zoome.\nDernière ligne droite :', [],
    [{ name: 'p4a', label: '→ Commit + push + APK', cible: 'p7' }, { name: 'p4b', label: '→ Pusher sans tester', cible: 'p5' }],
    'Scene.camera.set({ zoom: 1.25, x: 240, y: 320 });'],
  ['p5', 'Perdu dans les pixels', 'Fin ratée : la feuille coupée, la caméra muette.\nLe héros retourne au début.', illusPixelsPerdus(),
    [{ name: 'p5a', label: '→ Recommencer', cible: 'p1' }],
    'Scene.camera.set({ zoom: 1, x: 240, y: 320 });'],
  ['p6', 'Pomodoro', '25 minutes de focus bien placés.\nEt maintenant ?', illusHorloge(),
    [{ name: 'p6a', label: '→ Attaquer le jeu IIB', cible: 'p7' }, { name: 'p6b', label: '→ S\'arrêter là', cible: 'p7' }],
    'Scene.camera.set({ zoom: 1, x: 240, y: 320 });'],
  ['p7', 'Bravo !', 'Héros de la preuve de concept :\nscrollbars, piste caméra, Scene.camera, APK non niché.\nLivre terminé — bravo !', illusHeros(),
    [{ name: 'p7a', label: '→ Rejouer', cible: 'p1' }],
    'Scene.camera.set({ zoom: 1, x: 240, y: 320 });'],
];

PAGES.forEach(([label, titre, corps, illus, choix, frameScript], i) => {
  setFrameLabel(doc, [], i, label);
  const kf = insertKeyframe(layer, i);
  kf.script = frameScript;
  const els = [titleEl(titre), bodyEl(corps), ...illus];
  choix.forEach((c, k) => {
    els.push(...buttonEl(c.name, 240, 500 + k * 58, 330, 42, c.label));
  });
  kf.elements = els;
});

// --- script racine : navigation ---
// La tête de lecture boucle en permanence (% frameCount) : on l'« épingle » sur
// la page courante via onEnterFrame (les clics ne sont traités qu'en lecture).
const idxOf = {};
PAGES.forEach((p, i) => { idxOf[p[0]] = i; });
const nav = PAGES.flatMap(([, , , , choix]) =>
  choix.map((c) => `Scene.onClick(${JSON.stringify(c.name)}, () => aller(${JSON.stringify(c.cible)}, ${idxOf[c.cible]}));`)
).join('\n');
doc.scripts[0].code = [
  '// Livre dont tu es le héros — navigation par clics sur les boutons nommés',
  'var __page = 0;',
  'Scene.play();',
  'Scene.onEnterFrame(() => { if (Scene.currentFrame !== __page) Scene.currentFrame = __page; document.title = "PAGE" + (__page + 1); });',
  'function aller(label, idx) { __page = idx; Scene.gotoAndPlay(label); }',
  nav,
].join('\n');

writeFileSync(OUT, JSON.stringify(doc));
const names = {};
for (const kf of layer.keyframes) for (const e of kf.elements) if (e.name) names[e.name] = e.id;
console.log('LIVRE_POC.test.json écrit :', OUT);
console.log('boutons:', JSON.stringify(names));
