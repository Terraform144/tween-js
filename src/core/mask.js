// Masque de calque (layer mask, façon Animate CC) — logique pure, testable.
// Un calque avec layer.mask = true ROGNE les calques layer.masked = true situés
// juste en dessous de lui (chaîne consécutive), jusqu'au prochain calque
// normal (ni mask ni masked). layers[0] = calque du fond (dessiné en premier).

// Pour chaque index de calque, retourne l'index du calque masque qui le rogne,
// ou -1 s'il n'est pas masqué.
export function computeMaskOwner(layers) {
  const owner = new Array(layers.length).fill(-1);
  let openMask = -1;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.mask) openMask = i;
    else if (l.masked && openMask >= 0) owner[i] = openMask;
    else openMask = -1; // un calque normal ferme le bloc de masque
  }
  return owner;
}

export function hasMasks(layers) {
  return layers.some((l) => l.mask || l.masked);
}

// Chaîne d'imbrication des masques (v2) : pour chaque index de calque,
// retourne la liste des indices des calques masques qui le rognent, du plus
// EXTERNE au plus INTERNE ([] = pas masqué). Un calque peut être à la fois
// mask et masked : il rogne les masked en dessous ET est lui-même rogné par
// le masque au-dessus (imbrication). Un calque normal ferme tous les blocs
// ouverts au-dessus de lui. layers[0] = calque du fond.
export function computeMaskChain(layers) {
  const chains = layers.map(() => []);
  let stack = []; // pile des masques ouverts, du plus externe au plus interne
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.mask) {
      // le masque lui-même peut être rogné par les masques encore ouverts
      if (l.masked) chains[i] = stack.slice();
      stack.push(i);
    } else if (l.masked) {
      chains[i] = stack.slice();
    } else {
      stack = []; // calque normal : ferme tous les blocs ouverts au-dessus
    }
  }
  return chains;
}

// Compatibilité : computeMaskOwner dérive de la chaîne (masque le plus interne).
export function computeMaskOwnerV2(layers) {
  const chains = computeMaskChain(layers);
  return chains.map((c) => (c.length ? c[c.length - 1] : -1));
}
