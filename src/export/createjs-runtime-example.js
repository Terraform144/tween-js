/**
 * createjs-runtime-example.js
 * 
 * Exemple d'utilisation du runtime TweenJS avec une API proche de CreateJS
 * 
 * Ce fichier montre comment utiliser les MovieClips exportés depuis TweenJS
 * dans un projet de jeu vidéo, avec une API similaire à CreateJS/EaselJS.
 * 
 * ============================================
 * UTILISATION DE BASE
 * ============================================
 * 
 * 1. Importez le runtime et votre MovieClip exporté :
 *    
 *    import { MovieClip, createMovieClip } from './tweenRuntime.js';
 *    import { PlayerClip } from './Player.js';  // Votre symbole exporté
 * 
 * 2. Créez une scène de jeu :
 * 
 *    const stage = document.createElement('canvas');
 *    document.body.appendChild(stage);
 *    const ctx = stage.getContext('2d');
 *    
 *    // Créez votre MovieClip à partir des données exportées
 *    const player = createMovieClip(PLAYER_DATA, {
 *      x: 100,
 *      y: 200,
 *      scaleX: 1,
 *      scaleY: 1
 *    });
 * 
 * 3. Dans votre boucle de jeu :
 * 
 *    function gameLoop(timestamp) {
 *      const dt = timestamp - lastTime;
 *      lastTime = timestamp;
 *      
 *      // Mettez à jour tous vos MovieClips
 *      player.update(dt);
 *      
 *      // Effacez le canvas
 *      ctx.clearRect(0, 0, stage.width, stage.height);
 *      
 *      // Dessinez tous vos MovieClips
 *      player.draw(ctx);
 *      
 *      requestAnimationFrame(gameLoop);
 *    }
 *    requestAnimationFrame(gameLoop);
 * 
 * ============================================
 * API DES MOVIECLIPS
 * ============================================
 * 
 * Propriétés :
 *   movieClip.x           - Position X
 *   movieClip.y           - Position Y
 *   movieClip.rotation    - Rotation en degrés
 *   movieClip.scaleX      - Échelle horizontale
 *   movieClip.scaleY      - Échelle verticale
 *   movieClip.opacity     - Opacité (0-1)
 *   movieClip.visible     - Visibilité (boolean)
 *   movieClip.currentFrame - Frame actuelle (lecture seule)
 *   movieClip.frameCount  - Nombre total de frames (lecture seule)
 *   movieClip.isPlaying   - Est-ce que l'animation joue ?
 *   movieClip.loop        - Boucle l'animation ?
 * 
 * Méthodes :
 *   movieClip.play()           - Lance la lecture
 *   movieClip.stop()           - Arrête la lecture
 *   movieClip.gotoAndPlay(frameOrLabel) - Va à la frame/label et joue
 *   movieClip.gotoAndStop(frameOrLabel) - Va à la frame/label et s'arrête
 *   
 * Événements :
 *   movieClip.addEventListener('loop', callback)    - Déclenché quand l'animation boucle
 *   movieClip.addEventListener('complete', callback) - Déclenché quand l'animation se termine
 * 
 * ============================================
 * EXEMPLE COMPLET
 * ============================================
 * 
 * // Import des données exportées depuis TweenJS
 * import PLAYER_DATA from './Player.json';
 * 
 * // Import du runtime
 * import { MovieClip, createMovieClip } from './tweenRuntime.js';
 * 
 * // Configuration de la scène
 * const canvas = document.createElement('canvas');
 * canvas.width = 800;
 * canvas.height = 600;
 * document.body.appendChild(canvas);
 * const ctx = canvas.getContext('2d');
 * 
 * // Création du personnage
 * const player = createMovieClip(PLAYER_DATA, {
 *   x: 400,
 *   y: 300,
 *   loop: true,
 *   isPlaying: true
 * });
 * 
 * // Écouter les événements
 * player.addEventListener('loop', () => {
 *   console.log('Animation bouclée !');
 * });
 * 
 * // Boucle de jeu
 * let lastTime = performance.now();
 * function gameLoop(timestamp) {
 *   const dt = timestamp - lastTime;
 *   lastTime = timestamp;
 *   
 *   // Mise à jour
 *   player.update(dt);
 *   
 *   // Rendu
 *   ctx.clearRect(0, 0, canvas.width, canvas.height);
 *   player.draw(ctx);
 *   
 *   // Continuer la boucle
 *   requestAnimationFrame(gameLoop);
 * }
 * 
 * // Démarrer le jeu
 * requestAnimationFrame(gameLoop);
 * 
 * // Contrôles
 * document.addEventListener('keydown', (e) => {
 *   if (e.key === 'ArrowRight') {
 *     player.x += 10;
 *   }
 *   if (e.key === 'ArrowLeft') {
 *     player.x -= 10;
 *   }
 *   if (e.key === ' ') {
 *     // Sauter
 *     player.gotoAndPlay('jump');
 *   }
 * });
 * 
 * ============================================
 * EXPORT DEPUIS TWEENJS
 * ============================================
 * 
 * 1. Dans TweenJS, créez votre animation
 * 2. Exportez votre symbole comme MovieClip :
 *    - Cliquez sur "Exporter" dans le panneau Bibliothèque
 *    - Sélectionnez "Exporter comme objet de jeu JS"
 *    - Cela génère un fichier .js avec la classe MovieClip
 * 
 * 3. Dans votre jeu, importez et utilisez :
 *    
 *    import { MySymbol } from './MySymbol.js';
 *    const instance = new MySymbol({ x: 100, y: 100 });
 *    // ... dans la boucle de jeu ...
 *    instance.update(dt);
 *    instance.draw(ctx);
 * 
 * ============================================
 * DIFFÉRENCES AVEC CREATEJS/EASELJS
 * ============================================
 * 
 * Similitudes :
 *   - movieClip.play(), stop(), gotoAndPlay(), gotoAndStop()
 *   - Propriétés x, y, rotation, scaleX, scaleY, opacity, visible
 *   - Événements 'loop' et 'complete'
 * 
 * Différences :
 *   - Pas besoin de Stage ou de Container
 *   - Le dessin se fait manuellement avec movieClip.draw(ctx)
 *   - La mise à jour se fait manuellement avec movieClip.update(dt)
 *   - Pas de Timeline global, chaque MovieClip a sa propre timeline
 *   - Les symboles imbriqués (MovieClip dans MovieClip) sont gérés automatiquement
 * 
 * ============================================
 * ASTUCES
 * ============================================
 * 
 * // Accéder à la frame actuelle
 * console.log(player.currentFrame);
 * 
 * // Changer la vitesse de lecture (via frameRate dans les données)
 * // Note: La propriété frameRate est dans player.data.frameRate
 * 
 * // Arrêter à une frame spécifique
 * player.gotoAndStop(5);
 * 
 * // Rejouer depuis le début
 * player.gotoAndPlay(0);
 * 
 * // Aller à un label
 * player.gotoAndPlay('attack');
 * 
 * // Désactiver la boucle
 * player.loop = false;
 * 
 * // Réactiver la boucle
 * player.loop = true;
 * 
 */

// Exporter pour utilisation dans d'autres modules
// (ce fichier est juste un exemple, pas nécessaire de l'importer)
export const CreateJSRuntimeExample = true;
