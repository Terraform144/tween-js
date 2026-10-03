// Reconstruit le gabarit du Script 1 dans src/core/model.js (ligne createScript).
// Les séquences d'échappement sont construites par programme (fromCharCode)
// pour éviter toute ambiguïté de backslash.
import { readFileSync, writeFileSync } from 'node:fs';

const BS = String.fromCharCode(92);
const NL = BS + 'n';   // \n littéral dans le gabarit
const APOS = BS + "'"; // \' littéral dans le gabarit

const lines = [
  '// Code exécuté avec Scene (alias Game)',
  '// Exemple :',
  'Scene.log("Bonjour", Scene.width, "x", Scene.height);',
  'Scene.play();',
  "// Les objets nommés (Nom d'instance dans les propriétés) sont accessibles",
  '// directement, comme des movieclips : nom.x += 1; // bouge de 1 px',
  'Scene.onEnterFrame(() => {',
  '  // ... boucle de jeu, appelée à chaque image pendant la lecture',
  '});',
  'Scene.onClick("nom", (x, y) => {',
  "  // clic sur l'instance nommée (pendant la lecture seulement)",
  '});',
  '// CreateJS complet (copie locale ./libs/createjs) :',
  '// createjs.Tween.get(nom).to({ x: 300 }, 1000);',
  '// createjs.Sound, createjs.LoadQueue, createjs.Ticker...',
  '// Événements EaselJS sur les instances nommées : nom.on("click", fn)',
];
const template = lines.join(NL).replace(/'/g, APOS);

const path = 'src/core/model.js';
const src = readFileSync(path, 'utf8');
const marker = "scripts: [createScript('Script 1', '";
const start = src.indexOf(marker);
if (start < 0) { console.error('MARKER NOT FOUND'); process.exit(1); }
const argStart = start + marker.length;
const end = src.indexOf("')],", argStart);
if (end < 0) { console.error('END NOT FOUND'); process.exit(1); }
const out = src.slice(0, argStart) + template + src.slice(end);
writeFileSync(path, out);
console.log('TEMPLATE REWRITTEN, ' + template.length + ' chars');
