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
