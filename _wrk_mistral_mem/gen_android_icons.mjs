// Régénère les icônes de lancement Android (mipmap-*) depuis
// public/icons/app-icon.svg. Nécessite `sharp` (npm i sharp).
//   node gen_android_icons.mjs
// Le calque adaptatif (ic_launcher_foreground) est l'art seul, sans fond ;
// le fond de l'icône adaptative est @color/ic_launcher_background (#073642).
import fs from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const RES = `${ROOT}/android/app/src/main/res`;
const SVG = `${ROOT}/public/icons/app-icon.svg`;

const artOnly = (svg) =>
  svg.replace(/<rect[^>]*fill="url\(#bgGrad\)"\/>/, '')
     .replace(/<linearGradient[\s\S]*?<\/linearGradient>/, '');

(async () => {
  const src = fs.readFileSync(SVG, 'utf8');
  const launcher = Buffer.from(src);
  const foreground = Buffer.from(artOnly(src));

  const render = async (buf, base, sizes) => {
    const hi = await sharp(buf).resize(432, 432).png().toBuffer();
    for (const [dir, size] of sizes) {
      await sharp(hi).resize(size, size).png()
        .toFile(`${RES}/mipmap-${dir}/${base}.png`);
      console.log(`mipmap-${dir}/${base}.png ${size}x${size}`);
    }
  };

  const legacy = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
  await render(launcher, 'ic_launcher', legacy);
  await render(launcher, 'ic_launcher_round', legacy);
  await render(foreground, 'ic_launcher_foreground',
    [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]]);
})();
