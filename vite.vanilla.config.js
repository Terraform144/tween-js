import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  server: {
    port: 5174,
    open: false,
  },
  build: {
    target: 'es2020',
    // Produire un bundle IIFE au lieu de modules ES
    lib: {
      entry: fileURLToPath(new URL('./src/main.js', import.meta.url)),
      name: 'TweenJS',
      formats: ['iife'], // IIFE = Immediately Invoked Function Expression
      fileName: (format) => `tweenjs-bundle.${format}.js`
    },
    rollupOptions: {
      // Inclure toutes les dépendances dans le bundle
      external: ['konva'],
      output: {
        // Remplacer les références à Konva par le global Konva
        globals: {
          'konva': 'Konva'
        },
        // Générer un bundle unique
        inlineDynamicImports: true
      }
    },
    // Activer le minify pour la production
    minify: true,
    // Ne pas générer de manifest
    manifest: false,
    // Copier les assets statiques
    assetsDir: 'assets',
    // Ne pas utiliser les modules ES
    modulePreload: false,
  },
  // Plugins pour gérer les imports spéciaux
  plugins: [
    {
      name: 'handle-raw-imports',
      transform(src, id) {
        if (id.includes('?raw')) {
          return `export default ${JSON.stringify(src)}`;
        }
      }
    }
  ]
});