import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// mentions-legales.html n'est lié nulle part depuis index.html via <script>/<link>
// (juste un <a href> côté runtime) : Rollup ne le découvre donc jamais tout seul
// et l'omettait du build de prod (page 404 en prod alors qu'elle marchait en dev,
// où Vite sert tous les fichiers du disque sans passer par Rollup).
export default defineConfig({
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        mentionsLegales: fileURLToPath(new URL('./src/mentions-legales.html', import.meta.url)),
      },
    },
  },
});
