// Harnais masque de calque — computeMaskOwner (core/mask.js, logique pure).
// Run: node _wrk_mistral_mem/repro_mask.mjs
import { computeMaskOwner, hasMasks } from '../src/core/mask.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const L = (mask, masked) => ({ mask: !!mask, masked: !!masked });

ok(JSON.stringify(computeMaskOwner([L()])) === '[-1]', 'calque seul: pas masqué');
ok(JSON.stringify(computeMaskOwner([L(false, true), L(true)])) === '[1,-1]', 'masked sous un mask -> owner = index du mask');
ok(JSON.stringify(computeMaskOwner([L(), L(false, true), L(true)])) === '[-1,2,-1]', 'normal, masked, mask -> seul le masked est rogné');
ok(JSON.stringify(computeMaskOwner([L(false, true), L(), L(true)])) === '[-1,-1,-1]', "calque normal entre les deux -> chaîne coupée, rien n'est masqué");
ok(JSON.stringify(computeMaskOwner([L(false, true), L(false, true), L(true)])) === '[2,2,-1]', 'deux masked consécutifs -> même masque');
ok(JSON.stringify(computeMaskOwner([L(true), L(false, true)])) === '[-1,-1]', "mask au FOND (index 0) ne masque rien (rien en dessous)");
ok(JSON.stringify(computeMaskOwner([L(false, true), L(true), L(false, true), L(true)])) === '[1,-1,3,-1]', 'deux blocs indépendants');
ok(hasMasks([L()]) === false && hasMasks([L(false, true)]) === true && hasMasks([L(true)]) === true, 'hasMasks');
ok(computeMaskOwner([]).length === 0, 'liste vide OK');

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
