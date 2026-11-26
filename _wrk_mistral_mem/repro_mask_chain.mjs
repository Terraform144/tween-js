// Harnais computeMaskChain (imbrication des masques) + non-régression computeMaskOwner.
import { computeMaskOwner, computeMaskChain, computeMaskOwnerV2, hasMasks } from '../src/core/mask.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const L = (mask, masked) => ({ mask: !!mask, masked: !!masked });

// --- Cas simple (non-régression computeMaskOwner) ---
{
  // layers[0] = fond ; le masque est AU-DESSUS des masked (indices plus grands)
  const layers = [L(0,0), L(0,1), L(0,1), L(1,0), L(0,0)]; // fond, masked, masked, mask, normal
  const owner = computeMaskOwner(layers);
  ok(owner[0] === -1 && owner[1] === 3 && owner[2] === 3 && owner[3] === -1 && owner[4] === -1,
    'computeMaskOwner simple inchangé: ' + JSON.stringify(owner));
  const chains = computeMaskChain(layers);
  ok(JSON.stringify(chains[1]) === '[3]' && JSON.stringify(chains[2]) === '[3]' && chains[0].length === 0,
    'chaîne simple: masked=[3]');
}

// --- Imbrication : mask + masked (le masque interne est lui-même rogné) ---
{
  // du fond vers le HAUT : normal, masked_b, MASK_B(mask+masked), masked_a, MASK_A
  // (le masque est au-dessus : index plus grand rogne ceux d'en-dessous)
  const layers = [L(0,0), L(0,1), L(1,1), L(0,1), L(1,0)];
  const chains = computeMaskChain(layers);
  ok(JSON.stringify(chains[2]) === '[4]', 'MASK_B (mask+masked, idx2) rogné par A(idx4): ' + JSON.stringify(chains[2]));
  ok(JSON.stringify(chains[1]) === '[4,2]', 'masked_b rogné par A puis B (externe->interne): ' + JSON.stringify(chains[1]));
  ok(JSON.stringify(chains[3]) === '[4]', 'masked_a rogné par A seul: ' + JSON.stringify(chains[3]));
  const ownerV2 = computeMaskOwnerV2(layers);
  ok(ownerV2[1] === 2 && ownerV2[3] === 4, 'ownerV2 = masque le plus interne: ' + JSON.stringify(ownerV2));
}

// --- Un calque normal ferme tous les blocs ---
{
  // fond: masked, NORMAL, masked, mask  -> seul le masked sous le mask est rogné
  const layers = [L(0,1), L(0,0), L(0,1), L(1,0)];
  const chains = computeMaskChain(layers);
  ok(chains[2].length === 1 && chains[0].length === 0,
    'calque normal ferme le bloc: ' + JSON.stringify(chains));
}

// --- Pas de masque ---
{
  const layers = [L(0,0), L(0,0)];
  ok(!hasMasks(layers) && computeMaskChain(layers).every(c => c.length === 0), 'sans masque: chaînes vides');
}

// --- Triple imbrication ---
{
  // fond vers haut: mc, MC(mask+masked), mb, MB(mask+masked), ma, MA, normal
  const layers = [L(0,1), L(1,1), L(0,1), L(1,1), L(0,1), L(1,0), L(0,0)];
  const chains = computeMaskChain(layers);
  ok(JSON.stringify(chains[0]) === '[5,3,1]', 'triple imbrication externe->interne: ' + JSON.stringify(chains[0]));
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
