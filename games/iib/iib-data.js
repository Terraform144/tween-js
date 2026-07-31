// IIB - Données du jeu converties depuis IIB.swf
// Structure compatible avec le runtime MovieClip de TweenJS

// Ce fichier contient les données extraites du SWF.
// Pour convertir votre SWF, vous devez extraire manuellement ou via un outil :
// 1. La taille de la scène (width, height)
// 2. Le frame rate
// 3. Tous les symboles (MovieClip/Graphic) avec leurs layers et keyframes
// 4. Les instances placées sur la scène principale

// ============================================================================
// DONNÉES PRINCIPALES DU JEU
// ============================================================================

export const gameData = {
  // Configuration de la scène racine
  stage: {
    width: 800,
    height: 600,
    frameRate: 24,
    backgroundColor: '#000000',
    frameCount: 100,
    frameLabels: {},
  },

  // Symboles (MovieClips et Graphics) extraits du SWF
  symbols: {
    // Exemple: symbole du joueur
    'player_mc': {
      type: 'movieclip',
      name: 'player_mc',
      frameCount: 10,
      frameLabels: { 0: 'idle', 5: 'run' },
      layers: [
        {
          id: 'layer1',
          name: 'Player Graphics',
          visible: true,
          locked: false,
          keyframes: [
            // Frame 0 - idle
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'player_body',
                  shapeType: 'rect',
                  x: 0, y: 0,
                  width: 40, height: 60,
                  fill: '#FF0000',
                  stroke: '#000000',
                  strokeWidth: 2,
                  rotation: 0,
                  scaleX: 1,
                  scaleY: 1,
                  opacity: 1,
                },
                {
                  kind: 'shape',
                  id: 'player_head',
                  shapeType: 'ellipse',
                  x: 0, y: -30,
                  width: 30, height: 30,
                  fill: '#FFAA00',
                  rotation: 0,
                  scaleX: 1,
                  scaleY: 1,
                  opacity: 1,
                },
              ],
              tween: null,
            },
            // Frame 5 - run (animation)
            {
              index: 5,
              elements: [
                {
                  kind: 'shape',
                  id: 'player_body',
                  shapeType: 'rect',
                  x: 5, y: 0,
                  width: 40, height: 60,
                  fill: '#FF0000',
                  stroke: '#000000',
                  strokeWidth: 2,
                },
                {
                  kind: 'shape',
                  id: 'player_head',
                  shapeType: 'ellipse',
                  x: 5, y: -25,
                  width: 30, height: 30,
                  fill: '#FFAA00',
                },
              ],
              tween: { easing: 'linear' },
            },
          ],
        },
      ],
    },

    // Exemple: symbole ennemi
    'enemy_mc': {
      type: 'movieclip',
      name: 'enemy_mc',
      frameCount: 8,
      frameLabels: { 0: 'move', 4: 'attack' },
      layers: [
        {
          id: 'layer1',
          name: 'Enemy',
          visible: true,
          locked: false,
          keyframes: [
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'enemy_body',
                  shapeType: 'rect',
                  x: 0, y: 0,
                  width: 50, height: 50,
                  fill: '#00FF00',
                  stroke: '#000000',
                  strokeWidth: 2,
                },
              ],
              tween: null,
            },
          ],
        },
      ],
    },

    // Exemple: symbole de projectiles
    'bullet_mc': {
      type: 'movieclip',
      name: 'bullet_mc',
      frameCount: 1,
      frameLabels: {},
      layers: [
        {
          id: 'layer1',
          name: 'Bullet',
          visible: true,
          locked: false,
          keyframes: [
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'bullet',
                  shapeType: 'ellipse',
                  x: 0, y: 0,
                  width: 10, height: 10,
                  fill: '#FFFF00',
                },
              ],
              tween: null,
            },
          ],
        },
      ],
    },

    // Exemple: symbole graphique (synchronisé avec la timeline parent)
    'background': {
      type: 'graphic',
      name: 'background',
      frameCount: 1,
      frameLabels: {},
      layers: [
        {
          id: 'layer1',
          name: 'BG',
          visible: true,
          locked: false,
          keyframes: [
            {
              index: 0,
              elements: [
                {
                  kind: 'shape',
                  id: 'bg_rect',
                  shapeType: 'rect',
                  x: 0, y: 0,
                  width: 800, height: 600,
                  fill: '#111111',
                },
              ],
              tween: null,
            },
          ],
        },
      ],
    },
  },

  // Scène principale avec les instances placées
  mainTimeline: {
    layers: [
      {
        id: 'bg_layer',
        name: 'Background',
        visible: true,
        locked: false,
        keyframes: [
          {
            index: 0,
            elements: [
              {
                kind: 'instance',
                id: 'bg_instance',
                symbolId: 'background',
                x: 400, y: 300,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
              },
            ],
            tween: null,
          },
        ],
      },
      {
        id: 'game_layer',
        name: 'Game Objects',
        visible: true,
        locked: false,
        keyframes: [
          {
            index: 0,
            elements: [
              {
                kind: 'instance',
                id: 'player_instance',
                symbolId: 'player_mc',
                x: 400, y: 500,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                opacity: 1,
              },
            ],
            tween: null,
          },
        ],
      },
    ],
  },
};

// ============================================================================
// FONCTIONS D'EXPORT POUR CRÉER DES INSTANCES
// ============================================================================

// Crée une instance de symbole avec des propriétés initiales
export function createInstance(symbolId, props = {}) {
  const symbol = gameData.symbols[symbolId];
  if (!symbol) {
    console.warn(`Symbole introuvable: ${symbolId}`);
    return null;
  }
  
  return {
    kind: 'instance',
    id: `inst_${symbolId}_${Math.random().toString(36).substr(2, 9)}`,
    symbolId,
    x: props.x || 0,
    y: props.y || 0,
    rotation: props.rotation || 0,
    scaleX: props.scaleX != null ? props.scaleX : 1,
    scaleY: props.scaleY != null ? props.scaleY : 1,
    opacity: props.opacity != null ? props.opacity : 1,
  };
}

// Exporte les données dans un format compatible avec le runtime MovieClip
export function getMovieClipData(symbolId) {
  const symbol = gameData.symbols[symbolId];
  if (!symbol) return null;
  
  return {
    frameRate: gameData.stage.frameRate,
    frameCount: symbol.frameCount,
    layers: symbol.layers,
    frameLabels: symbol.frameLabels,
    symbols: gameData.symbols, // Tous les symboles pour les références imbriquées
    width: gameData.stage.width,
    height: gameData.stage.height,
  };
}
