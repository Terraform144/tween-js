// IIB - Jeu principal
// Utilise les movieclips du système TweenJS

import { MovieClip, createMovieClip } from './tween-runtime.js';
import { gameData, createInstance, getMovieClipData } from './iib-data.js';

// ============================================================================
// CONFIGURATION DU JEU
// ============================================================================

const CONFIG = {
  // Taille du canvas (0 = s'adapter au conteneur)
  canvasWidth: 0,
  canvasHeight: 0,
  
  // Échelle de rendu
  scaleMode: 'fit', // 'fit', 'fill', 'none'
  
  // Couleur de fond
  backgroundColor: '#000000',
  
  // Framerate cible
  targetFPS: 60,
  
  // Debug
  debug: true,
};

// ============================================================================
// ÉTAT DU JEU
// ============================================================================

const GameState = {
  LOADING: 'loading',
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameOver',
};

// ============================================================================
// CLASSE PRINCIPALE DU JEU
// ============================================================================

class IIBGame {
  constructor(container) {
    this.container = container;
    this.canvas = null;
    this.ctx = null;
    this.state = GameState.LOADING;
    
    // Timing
    this.lastTime = 0;
    this.deltaTime = 0;
    this.fpsCounter = 0;
    this.fpsTime = 0;
    this.currentFPS = 0;
    
    // Scène
    this.stage = null; // MovieClip racine
    this.camera = { x: 0, y: 0, scale: 1 };
    
    // Objets de jeu
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.uiElements = [];
    
    // Input
    this.keys = {};
    this.touches = {};
    this.mouse = { x: 0, y: 0, down: false };
    
    // Score
    this.score = 0;
    this.lives = 3;
    
    // Initialisation
    this.init();
  }
  
  init() {
    this.createCanvas();
    this.setupInput();
    this.loadGame();
  }
  
  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    
    if (CONFIG.canvasWidth > 0 && CONFIG.canvasHeight > 0) {
      this.canvas.width = CONFIG.canvasWidth;
      this.canvas.height = CONFIG.canvasHeight;
    } else {
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    this.container.appendChild(this.canvas);
  }
  
  resizeCanvas() {
    if (CONFIG.canvasWidth > 0 && CONFIG.canvasHeight > 0) return;
    
    const rect = this.container.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;
    
    if (width === 0) width = window.innerWidth;
    if (height === 0) height = window.innerHeight;
    
    // Calculer le scale
    const stageW = gameData.stage.width;
    const stageH = gameData.stage.height;
    
    let scale = 1;
    if (CONFIG.scaleMode === 'fit') {
      scale = Math.min(width / stageW, height / stageH);
    } else if (CONFIG.scaleMode === 'fill') {
      scale = Math.max(width / stageW, height / stageH);
    }
    
    // Centrer
    this.canvas.width = width;
    this.canvas.height = height;
    
    this.camera.scale = scale;
    this.camera.x = (width - stageW * scale) / 2;
    this.camera.y = (height - stageH * scale) / 2;
  }
  
  setupInput() {
    // Clavier
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.keys[e.key] = true;
      
      // Empêcher le défilement avec les flèches
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keys[e.key] = false;
    });
    
    // Souris
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) / this.camera.scale - this.camera.x / this.camera.scale;
      this.mouse.y = (e.clientY - rect.top) / this.camera.scale - this.camera.y / this.camera.scale;
    });
    
    this.canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      if (e.button === 2) e.preventDefault(); // Empêcher le menu contextuel
    });
    
    this.canvas.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
    
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Tactile
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        this.touches[t.identifier] = {
          x: t.clientX,
          y: t.clientY,
          startX: t.clientX,
          startY: t.clientY,
        };
      }
    });
    
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (this.touches[t.identifier]) {
          this.touches[t.identifier].x = t.clientX;
          this.touches[t.identifier].y = t.clientY;
        }
      }
    });
    
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        delete this.touches[t.identifier];
      }
    });
  }
  
  loadGame() {
    // Créer la scène principale
    const stageData = {
      frameRate: gameData.stage.frameRate,
      frameCount: gameData.stage.frameCount,
      layers: gameData.mainTimeline.layers,
      frameLabels: gameData.stage.frameLabels || {},
      symbols: gameData.symbols,
      width: gameData.stage.width,
      height: gameData.stage.height,
    };
    
    this.stage = createMovieClip(stageData);
    this.stage.loop = false;
    this.stage.isPlaying = false;
    
    // Extraire le joueur de la scène principale
    // (Dans une vraie conversion, on créerait les instances dynamiquement)
    this.createPlayer();
    this.createEnemies();
    
    // Passer à l'état de jeu
    this.state = GameState.PLAYING;
    this.stage.gotoAndPlay(0);
    
    // Démarrer la boucle de jeu
    this.lastTime = performance.now();
    this.gameLoop();
    
    // Mettre à jour l'UI
    this.updateUI();
    
    console.log('Jeu chargé!');
    document.getElementById('debug').textContent = 'Jeu prêt';
  }
  
  createPlayer() {
    // Créer le joueur à partir des données
    const playerData = getMovieClipData('player_mc');
    if (playerData) {
      this.player = createMovieClip(playerData, {
        x: 400,
        y: 500,
        loop: false,
      });
      this.player.gotoAndStop('idle');
      
      // Ajouter des écouteurs d'événements
      this.player.addEventListener('loop', () => {
        // Quand l'animation boucle
      });
    } else {
      // Créer un joueur par défaut si le symbole n'existe pas
      this.player = {
        x: 400,
        y: 500,
        width: 40,
        height: 60,
        update: () => {},
        draw: (ctx) => {
          ctx.save();
          ctx.translate(this.player.x, this.player.y);
          ctx.fillStyle = '#FF0000';
          ctx.fillRect(-20, -30, 40, 60);
          ctx.fillStyle = '#FFAA00';
          ctx.beginPath();
          ctx.arc(0, -40, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      };
    }
  }
  
  createEnemies() {
    // Créer des ennemis pour le demo
    for (let i = 0; i < 5; i++) {
      const enemyData = getMovieClipData('enemy_mc');
      const enemy = enemyData ? createMovieClip(enemyData, {
        x: 100 + i * 150,
        y: 100 + Math.random() * 200,
        loop: true,
      }) : null;
      
      if (enemy) {
        enemy.gotoAndPlay('move');
        enemy.speed = 0.5 + Math.random() * 0.5;
        enemy.direction = Math.random() * Math.PI * 2;
        this.enemies.push(enemy);
      }
    }
  }
  
  createBullet(x, y) {
    const bulletData = getMovieClipData('bullet_mc');
    const bullet = bulletData ? createMovieClip(bulletData, {
      x: x,
      y: y,
      loop: true,
    }) : null;
    
    if (bullet) {
      bullet.speed = 8;
      bullet.direction = 0;
      bullet.lifetime = 60; // frames
      this.bullets.push(bullet);
    }
  }
  
  updateGame(dt) {
    // Mettre à jour en fonction de l'état
    switch (this.state) {
      case GameState.PLAYING:
        this.updatePlaying(dt);
        break;
      case GameState.MENU:
        this.updateMenu(dt);
        break;
    }
  }
  
  updatePlaying(dt) {
    // Mettre à jour le joueur
    if (this.player) {
      const playerSpeed = 3;
      
      if (this.keys['ArrowLeft'] || this.keys['KeyA']) {
        this.player.x -= playerSpeed;
        if (this.player.gotoAndPlay) this.player.gotoAndPlay('run');
      } else if (this.keys['ArrowRight'] || this.keys['KeyD']) {
        this.player.x += playerSpeed;
        if (this.player.gotoAndPlay) this.player.gotoAndPlay('run');
      } else {
        if (this.player.gotoAndStop) this.player.gotoAndStop('idle');
      }
      
      // Limites de l'écran
      const halfW = this.player.width ? this.player.width / 2 : 20;
      this.player.x = Math.max(halfW, Math.min(gameData.stage.width - halfW, this.player.x));
    }
    
    // Mettre à jour les ennemis
    for (const enemy of this.enemies) {
      enemy.x += Math.cos(enemy.direction) * enemy.speed;
      enemy.y += Math.sin(enemy.direction) * enemy.speed;
      
      // Rebondir sur les bords
      if (enemy.x < 0 || enemy.x > gameData.stage.width) {
        enemy.direction = Math.PI - enemy.direction;
      }
      if (enemy.y < 0 || enemy.y > gameData.stage.height) {
        enemy.direction = -enemy.direction;
      }
      
      if (enemy.update) enemy.update(dt);
    }
    
    // Mettre à jour les balles
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.x += Math.cos(bullet.direction) * bullet.speed;
      bullet.y += Math.sin(bullet.direction) * bullet.speed;
      bullet.lifetime--;
      
      // Supprimer les balles hors écran ou expirées
      if (bullet.lifetime <= 0 || 
          bullet.x < 0 || bullet.x > gameData.stage.width ||
          bullet.y < 0 || bullet.y > gameData.stage.height) {
        this.bullets.splice(i, 1);
      }
    }
    
    // Détection des collisions
    this.checkCollisions();
    
    // Tir
    if (this.keys['Space'] && this.mouse.down) {
      this.createBullet(this.player.x, this.player.y - 30);
    }
  }
  
  updateMenu(dt) {
    // Animation du menu
  }
  
  checkCollisions() {
    if (!this.player) return;
    
    const playerBounds = this.getBounds(this.player);
    
    // Collisions joueur-ennemi
    for (const enemy of this.enemies) {
      const enemyBounds = this.getBounds(enemy);
      
      if (this.checkRectCollision(playerBounds, enemyBounds)) {
        this.lives--;
        if (this.lives <= 0) {
          this.state = GameState.GAME_OVER;
          this.updateUI();
        }
      }
    }
    
    // Collisions balle-ennemi
    for (let b = this.bullets.length - 1; b >= 0; b--) {
      const bullet = this.bullets[b];
      const bulletBounds = this.getBounds(bullet);
      
      for (let e = this.enemies.length - 1; e >= 0; e--) {
        const enemy = this.enemies[e];
        const enemyBounds = this.getBounds(enemy);
        
        if (this.checkRectCollision(bulletBounds, enemyBounds)) {
          this.bullets.splice(b, 1);
          this.enemies.splice(e, 1);
          this.score += 100;
          this.updateUI();
          break;
        }
      }
    }
  }
  
  getBounds(obj) {
    if (obj.getBounds) {
      return obj.getBounds();
    }
    
    // Calcul par défaut
    const halfW = (obj.width || 40) / 2;
    const halfH = (obj.height || 40) / 2;
    
    return {
      x: obj.x - halfW,
      y: obj.y - halfH,
      width: halfW * 2,
      height: halfH * 2,
    };
  }
  
  checkRectCollision(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
  
  drawGame() {
    // Effacer le canvas
    this.ctx.fillStyle = CONFIG.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Sauvegarder la transformation actuelle
    this.ctx.save();
    
    // Appliquer la caméra
    this.ctx.translate(this.camera.x, this.camera.y);
    this.ctx.scale(this.camera.scale, this.camera.scale);
    
    // Dessiner la scène principale
    if (this.stage) {
      this.stage.draw(this.ctx);
    }
    
    // Dessiner le joueur (si ce n'est pas déjà dans la scène)
    // Note: Dans une vraie conversion, le joueur serait une instance dans la scène
    if (this.player && !this.stage.data.layers.some(l => 
        l.keyframes[0].elements.some(e => e.symbolId === 'player_mc'))) {
      this.player.draw(this.ctx);
    }
    
    // Dessiner les ennemis
    for (const enemy of this.enemies) {
      enemy.draw(this.ctx);
    }
    
    // Dessiner les balles
    for (const bullet of this.bullets) {
      bullet.draw(this.ctx);
    }
    
    // Restaurer la transformation
    this.ctx.restore();
    
    // Dessiner l'UI (hors caméra)
    this.drawUI();
  }
  
  drawUI() {
    const ui = document.getElementById('ui');
    if (!ui) return;
    
    // Dessiner directement dans le canvas pour plus de contrôle
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Réinitialiser la matrice
    
    // Barre de vie
    this.ctx.fillStyle = '#FF0000';
    for (let i = 0; i < this.lives; i++) {
      this.ctx.fillRect(20 + i * 25, 20, 20, 20);
    }
    
    // Score
    this.ctx.font = '16px Arial';
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillText(`Score: ${this.score}`, 20, 60);
    
    // État du jeu
    if (this.state === GameState.PAUSED) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = '32px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('PAUSE', this.canvas.width / 2, this.canvas.height / 2);
    } else if (this.state === GameState.GAME_OVER) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#FF0000';
      this.ctx.font = '48px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 40);
      this.ctx.font = '24px Arial';
      this.ctx.fillText(`Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.font = '18px Arial';
      this.ctx.fillText('Appuyez sur R pour recommencer', this.canvas.width / 2, this.canvas.height / 2 + 40);
    }
    
    this.ctx.restore();
  }
  
  updateUI() {
    const ui = document.getElementById('ui');
    if (!ui) return;
    
    document.getElementById('fps').textContent = this.currentFPS;
    
    let debugText = '';
    switch (this.state) {
      case GameState.LOADING:
        debugText = 'Chargement...';
        break;
      case GameState.MENU:
        debugText = 'Menu';
        break;
      case GameState.PLAYING:
        debugText = `Jeu | Vie: ${this.lives} | Score: ${this.score}`;
        break;
      case GameState.PAUSED:
        debugText = 'En pause';
        break;
      case GameState.GAME_OVER:
        debugText = `Game Over | Score: ${this.score}`;
        break;
    }
    
    document.getElementById('debug').textContent = debugText;
  }
  
  gameLoop(currentTime = 0) {
    // Calculer le delta time
    this.deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    // Limiter le delta time pour éviter les sauts
    if (this.deltaTime > 100) this.deltaTime = 100;
    
    // Mettre à jour le jeu
    this.updateGame(this.deltaTime);
    
    // Dessiner le jeu
    this.drawGame();
    
    // Compter les FPS
    this.fpsCounter++;
    this.fpsTime += this.deltaTime;
    if (this.fpsTime >= 1000) {
      this.currentFPS = this.fpsCounter;
      this.fpsCounter = 0;
      this.fpsTime = 0;
      this.updateUI();
    }
    
    // Continuer la boucle
    if (this.state !== GameState.GAME_OVER) {
      requestAnimationFrame((t) => this.gameLoop(t));
    }
  }
}

// ============================================================================
// DÉMARRAGE DU JEU
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  if (!container) {
    console.error('Conteneur de jeu introuvable!');
    return;
  }
  
  // Initialiser le jeu
  window.game = new IIBGame(container);
});

// Exporter pour les modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { IIBGame, GameState, CONFIG };
}
