// Serveur statique minimal pour Animate_JS_PureVanilla (test PWA E2E).
// resolve() obligatoire pour la garde de chemin sous Windows (join seul
// produit des backslashes — leçon de session 13).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve('F:/_SRC/__Debrouillard/Animate_JS_PRJ/Animate_JS_PureVanilla');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = resolve(join(ROOT, decodeURIComponent(url.pathname)));
    if (p !== ROOT && !p.startsWith(ROOT + '\\') && !p.startsWith(ROOT + '/')) {
      res.writeHead(403); return res.end();
    }
    let data = await readFile(p).catch(() => null);
    if (!data && !extname(p)) {
      p = join(p === ROOT ? ROOT : p, 'index.html');
      data = await readFile(p).catch(() => null);
    }
    if (!data) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(500); res.end();
  }
}).listen(4175, () => console.log('READY'));
