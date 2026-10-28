// Export de la séquence d'images en PNG (un PNG par frame, dans un ZIP).
// Réutilise le runtime MovieClip des exports HTML (tweenRuntime.js) pour un
// rendu Canvas 2D fidèle à la lecture : formes, morphing, symboles imbriqués
// (les MovieClips internes avancent d'une frame par image, comme pendant la
// lecture), bitmaps et caméra de scène interpolée.
//
// Le ZIP vient de util/zip.js (format "stored" sans compression — les PNG
// le sont déjà), donc aucune dépendance (JSZip & co) n'est nécessaire.

import { buildFullDocData } from './exportHTML.js';
import { createMovieClip, resolveCameraAtFrame, applyCameraToContext, preloadImages } from './tweenRuntime.js';
import { downloadBlobFile } from '../util/download.js';
import { makeZip } from '../util/zip.js';

function canvasToPNGBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("L'encodage PNG a échoué (toBlob)"));
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
    }, 'image/png');
  });
}

function safeName(name) {
  return (name || 'document').replace(/[^a-z0-9_\-]+/gi, '_');
}

// Rend TOUTES les frames du document (0 → frameCount-1) en PNG, à la taille
// du document, et télécharge l'ensemble dans un unique ZIP. La caméra de
// scène interpolée est appliquée (comme dans l'export HTML) ; les scripts ne
// sont PAS exécutés (l'export capture l'animation "pure" du document).
export async function downloadPNGSequence(doc) {
  const data = buildFullDocData(doc);
  await preloadImages(data); // les bitmaps sont décodés avant le 1er rendu

  const frameCount = Math.max(1, data.frameCount | 0);
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d');

  const clip = createMovieClip(data, {});
  const frameDuration = 1000 / (data.frameRate || 24);
  const files = [];

  for (let f = 0; f < frameCount; f++) {
    clip.gotoAndStop(f);

    ctx.fillStyle = data.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    applyCameraToContext(ctx, resolveCameraAtFrame(data.camera, f, data.width, data.height), data.width, data.height);
    clip.draw(ctx);
    ctx.restore();

    const bytes = await canvasToPNGBytes(canvas);
    files.push({ name: `frame_${String(f + 1).padStart(4, '0')}.png`, data: bytes });

    // Avance les MovieClips imbriqués d'une frame, exactement comme la
    // boucle de lecture (update après le rendu). Le clip racine, en stop,
    // ne bouge pas : c'est gotoAndStop(f) qui le synchronise.
    if (f < frameCount - 1) clip.update(frameDuration);
  }

  downloadBlobFile(makeZip(files), safeName(doc.name) + '_png.zip');
}
