/**
 * Configuration Vite pour le jeu IIB
 * 
 * Pour démarrer le serveur de développement:
 *   cd games/iib
 *   npm run dev
 * 
 * Pour build:
 *   npm run build
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    host: true,
  },
  resolve: {
    alias: {
      // Si vous voulez partager du code avec l'éditeur principal
      // '@tweenjs/core': resolve(__dirname, '../../src'),
    },
  },
});
