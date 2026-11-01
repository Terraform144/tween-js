// Harnais thème sombre : cohérence des variables CSS entre :root (light) et
// [data-theme="dark"] — toute var utilisée doit être définie dans les deux.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../src/style.css'), 'utf8');
const vanilla = readFileSync(join(here, '../Animate_JS_PureVanilla/style.css'), 'utf8');
let passed = 0, failed = 0;
const ok = (c, n) => { if (c) { passed++; console.log('  OK  ' + n); } else { failed++; console.log('  FAIL ' + n); } };

const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)[1];
const darkBlock = css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)[1];
const rootVars = new Set([...rootBlock.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const darkVars = new Set([...darkBlock.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const used = new Set([...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
ok(darkBlock.length > 0, 'bloc [data-theme="dark"] présent');
ok([...rootVars].every((v) => darkVars.has(v)), 'dark définit toutes les vars de :root (' + [...rootVars].join(', ') + ')');
ok([...used].every((v) => rootVars.has(v)), 'toutes les var() utilisées sont définies dans :root');
ok(/--bg-0:\s*#002b36/.test(darkBlock) && /--text:\s*#839496/.test(darkBlock), 'palette Solarized dark (bg-0 #002b36, text #839496)');
ok(css.includes('#stage-container') && /#stage-container\s*\{[^}]*background:\s*#ffffff/s.test(css), 'la feuille de scène reste blanche (hors thème)');
ok(vanilla === css, 'style.css vanilla synchronisé');
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
