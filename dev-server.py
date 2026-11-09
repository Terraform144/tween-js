#!/usr/bin/env python3
"""
Serveur de développement pour Animate_JS_PRJ avec support des modules ES.
Utilise le bundle pré-construit ou les sources avec CORS headers.

API « archives en ligne » (dossier ./Archives à la racine), protégée par la
clé ?adm=4321 dans la query string :
  GET    /api/archives?adm=4321            -> liste JSON [{name, size, mtime}]
  GET    /api/archives/<fichier>?adm=4321   -> contenu JSON du fichier
  POST   /api/archives?adm=4321             -> body {"name": str, "data": str}
                                               écrit Archives/<nom>-<ts>.json
  DELETE /api/archives/<fichier>?adm=4321   -> supprime le fichier
Sans clé valide : 403 JSON. Port : variable d'env PORT (défaut 8080).
"""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs
import json
import os
import re
import sys
import time

ROOT = '/run/media/zulup/TOSHIBA EXT/_SRC/__Debrouillard/Animate_JS_PRJ'
ARCHIVES_DIR = os.path.join(ROOT, 'Archives')
ADM_KEY = '4321'
MAX_BODY = 200 * 1024 * 1024  # 200 Mo (docs avec bitmaps en dataUrl)

os.makedirs(ARCHIVES_DIR, exist_ok=True)


def safe_archive_name(name):
    """Nom de fichier sûr : basename, .json obligatoire, pas de traversée."""
    base = os.path.basename(name or '')
    if base != name or '..' in name or not base.endswith('.json'):
        return None
    real = os.path.realpath(os.path.join(ARCHIVES_DIR, base))
    if not real.startswith(os.path.realpath(ARCHIVES_DIR) + os.sep):
        return None
    return base


class CORSRequestHandler(SimpleHTTPRequestHandler):
    """Handler avec en-têtes CORS + API /api/archives (clé adm requise)."""

    # --- utilitaires API -------------------------------------------------

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()  # CORS injecté dans end_headers()
        self.wfile.write(body)

    def _adm_ok(self):
        qs = parse_qs(urlsplit(self.path).query)
        return qs.get('adm', [None])[0] == ADM_KEY

    def _archives_path(self):
        """Partie après /api/archives ('' pour la liste, sinon le fichier)."""
        path = urlsplit(self.path).path
        prefix = '/api/archives'
        if path == prefix or path == prefix + '/':
            return ''
        if path.startswith(prefix + '/'):
            return path[len(prefix) + 1:]
        return None

    # --- GET : API archives puis fichiers statiques -----------------------

    def do_GET(self):
        if self._archives_path() is not None:
            if not self._adm_ok():
                self._send_json(403, {'error': 'clé adm invalide'})
                return
            rest = self._archives_path()
            if rest == '':
                # Liste des sauvegardes, plus récent d'abord
                try:
                    items = []
                    for fn in os.listdir(ARCHIVES_DIR):
                        if not fn.endswith('.json'):
                            continue
                        st = os.stat(os.path.join(ARCHIVES_DIR, fn))
                        items.append({'name': fn, 'size': st.st_size, 'mtime': int(st.st_mtime * 1000)})
                    items.sort(key=lambda x: x['mtime'], reverse=True)
                    self._send_json(200, items)
                except OSError as e:
                    self._send_json(500, {'error': str(e)})
                return
            # Lecture d'un fichier d'archive
            base = safe_archive_name(rest)
            if not base:
                self._send_json(400, {'error': 'nom de fichier invalide'})
                return
            full = os.path.join(ARCHIVES_DIR, base)
            if not os.path.isfile(full):
                self._send_json(404, {'error': 'archive introuvable'})
                return
            try:
                with open(full, 'rb') as f:
                    data = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except OSError as e:
                self._send_json(500, {'error': str(e)})
            return

        # Fichier statique (comportement d'origine ; CORS/MIME via
        # end_headers() / guess_type() — send_header AVANT send_response
        # produirait une réponse HTTP invalide).
        super().do_GET()

    def end_headers(self):
        # CORS sur toutes les réponses (statique + API)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def guess_type(self, path):
        # Forcer les types MIME utiles pour les modules ES
        if path.endswith('.js') or path.endswith('.mjs'):
            return 'application/javascript'
        if path.endswith('.css'):
            return 'text/css'
        if path.endswith('.html'):
            return 'text/html; charset=utf-8'
        if path.endswith('.json'):
            return 'application/json'
        return super().guess_type(path)

    # --- POST : sauvegarde en ligne ---------------------------------------

    def do_POST(self):
        if self._archives_path() != '':
            self._send_json(404, {'error': 'route inconnue'})
            return
        if not self._adm_ok():
            self._send_json(403, {'error': 'clé adm invalide'})
            return
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._send_json(413, {'error': 'body absent ou trop volumineux (> 200 Mo)'})
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode('utf-8'))
            name = str(payload.get('name') or 'document')
            data = payload.get('data')
            if not isinstance(data, str):
                raise ValueError('champ "data" (string JSON) requis')
        except (ValueError, UnicodeDecodeError) as e:
            self._send_json(400, {'error': 'JSON invalide : %s' % e})
            return

        safe = re.sub(r'[^a-z0-9_\-]+', '_', name.lower()).strip('_') or 'document'
        stamp = time.strftime('%Y%m%d-%H%M%S')
        base = '%s-%s.json' % (safe, stamp)
        # Collision (deux sauvegardes la même seconde) : suffixe -2, -3…
        n = 2
        while os.path.exists(os.path.join(ARCHIVES_DIR, base)):
            base = '%s-%s-%d.json' % (safe, stamp, n)
            n += 1
        try:
            with open(os.path.join(ARCHIVES_DIR, base), 'w', encoding='utf-8') as f:
                f.write(data)
            self._send_json(200, {'ok': True, 'file': base})
        except OSError as e:
            self._send_json(500, {'error': str(e)})

    # --- DELETE : supprime une sauvegarde en ligne -------------------------

    def do_DELETE(self):
        rest = self._archives_path()
        if rest is None or rest == '':
            self._send_json(404, {'error': 'route inconnue'})
            return
        if not self._adm_ok():
            self._send_json(403, {'error': 'clé adm invalide'})
            return
        base = safe_archive_name(rest)
        if not base:
            self._send_json(400, {'error': 'nom de fichier invalide'})
            return
        full = os.path.join(ARCHIVES_DIR, base)
        if not os.path.isfile(full):
            self._send_json(404, {'error': 'archive introuvable'})
            return
        try:
            os.remove(full)
            self._send_json(200, {'ok': True})
        except OSError as e:
            self._send_json(500, {'error': str(e)})

    # --- OPTIONS : preflight CORS ------------------------------------------

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()  # CORS injecté dans end_headers()

    def log_message(self, format, *args):
        """Réduire les logs pour éviter le spam."""
        sys.stderr.write("%s - - [%s] %s\n" % (
            self.address_string(),
            self.log_date_time_string(),
            format % args))


if __name__ == '__main__':
    os.chdir(ROOT)

    port = int(os.environ.get('PORT', '8080'))
    server_address = ('0.0.0.0', port)
    httpd = ThreadingHTTPServer(server_address, CORSRequestHandler)

    print("=" * 60)
    print("Serveur de développement TweenJS démarré")
    print("=" * 60)
    print(f"URL: http://localhost:{port}/")
    print(f"Dossier: {os.getcwd()}")
    print(f"Archives en ligne: {ARCHIVES_DIR} (clé ?adm={ADM_KEY}, API /api/archives)")
    print("\nPour tester les patterns du brush:")
    print(f"1. Ouvrir http://localhost:{port}/ dans un navigateur")
    print("2. Sélectionner l'outil Pinceau (B)")
    print("3. Dans le panneau Propriétés, choisir:")
    print("   - Taille (1-80px)")
    print("   - Motif (Rond, Plat, Calligraphie, Effilé)")
    print("4. Dessiner sur la scène")
    print("\nAppuyez sur Ctrl+C pour arrêter le serveur")
    print("=" * 60)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")
        httpd.server_close()
