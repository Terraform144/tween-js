// Sources d'autocomplétion CodeMirror du panneau Scripts (voir ScriptsPanel.js).
// Module PUR (seul model.js est importé) : testable sous Node via un faux
// contexte CodeMirror ({ matchBefore, state.sliceDoc }).
//
// On fournit les sources via javascriptLanguage.data.of({ autocomplete: [...] }) :
// autocompletion() combine la source du langage JS ET les nôtres.
import { getNamedElements } from '../core/model.js';

// API événements façon EaselJS, posée sur Scene et sur chaque élément nommé
// (attachEventApi dans runtime/sceneRuntime.js).
export const EVENT_API = [
  'on', 'off', 'addEventListener', 'removeEventListener',
  'removeAllEventListeners', 'hasEventListener', 'dispatchEvent',
];

// --- API Scene racine (éditeur, scripts nommés : runtime/sceneRuntime.js) ---
export const SCENE_ROOT_COMPLETIONS = [
  // propriétés
  'width', 'height', 'frameRate', 'backgroundColor', 'name', 'frameCount',
  'playing', 'currentFrame',
  // lecture
  'play', 'stop', 'gotoAndPlay', 'gotoAndStop',
  // création
  'addShape', 'addInstance',
  // boucle de jeu / entrées / clic
  'onEnterFrame', 'onKeyDown', 'onKeyUp', 'onClick',
  'keys',
  // divers
  'random', 'log', 'playSound',
  ...EVENT_API,
];

// --- API Scene scopée à un MovieClip (scripts d'image / de symbole édités
// dans un symbole : buildClipScene dans sceneRuntime.js + tweenRuntime.js).
// Pas d'API événements sur ce scope (pas d'attachEventApi). ---
export const SCENE_CLIP_COMPLETIONS = [
  'width', 'height', 'frameRate', 'frameCount', 'playing', 'currentFrame',
  'play', 'stop', 'gotoAndPlay', 'gotoAndStop',
  'onEnterFrame',
  'random', 'log', 'playSound',
];

// Propriétés manipulables depuis un script sur un élément nommé.
export const INSTANCE_PROPS = [
  'x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity',
  'width', 'height', 'fill', 'stroke', 'strokeWidth', 'name', 'text', 'fontSize',
  ...EVENT_API,
];

// --- createjs (libs UMD embarquées public/libs/createjs, passées aux scripts
// via SCRIPT_LIBS) : globales utiles, extraites des vraies libs. ---
export const CREATEJS_GLOBALS = [
  'Stage', 'Container', 'Shape', 'Text', 'Bitmap', 'Sprite', 'DisplayObject',
  'EventDispatcher', 'Event', 'MouseEvent', 'Point', 'Rectangle', 'Matrix2D',
  'Graphics', 'Shadow', 'Filter', 'ColorFilter', 'BlurFilter', 'Tween', 'Ease', 'Timeline',
  'Ticker', 'Sound', 'LoadQueue', 'SpriteSheet', 'ButtonHelper', 'Touch',
];

// Sous-API statiques (clés réelles des libs embarquées).
export const CREATEJS_SUB = {
  Tween: ['get', 'removeTweens', 'removeAllTweens', 'hasActiveTweens', 'tick'],
  Ease: [
    'linear', 'none', 'quadIn', 'quadOut', 'quadInOut', 'cubicIn', 'cubicOut', 'cubicInOut',
    'quartIn', 'quartOut', 'quartInOut', 'quintIn', 'quintOut', 'quintInOut',
    'sineIn', 'sineOut', 'sineInOut',
    'circIn', 'circOut', 'circInOut', 'backIn', 'backOut', 'backInOut',
    'bounceIn', 'bounceOut', 'bounceInOut', 'elasticIn', 'elasticOut', 'elasticInOut',
    'get', 'getPowIn', 'getPowOut', 'getPowInOut', 'getBackIn', 'getBackOut', 'getBackInOut',
    'getElasticIn', 'getElasticOut', 'getElasticInOut',
  ],
  Ticker: [
    'addEventListener', 'removeEventListener', 'removeAllEventListeners', 'hasEventListener',
    'on', 'off', 'dispatchEvent', 'init', 'reset', 'getTime', 'getEventTime', 'getFPS',
    'getMeasuredFPS', 'getMeasuredTickTime', 'getTicks', 'setFPS', 'setInterval', 'getInterval',
    'framerate', 'paused', 'timingMode', 'maxDelta', 'RAF', 'RAF_SYNCHED', 'TIMEOUT', 'willTrigger',
  ],
  Sound: [
    'play', 'registerSound', 'registerSounds', 'registerPlugins', 'initializeDefaultPlugins',
    'createInstance', 'stop', 'setVolume', 'getVolume', 'setMute', 'getMute', 'isReady',
    'addEventListener', 'removeEventListener', 'removeAllEventListeners', 'on', 'off',
    'dispatchEvent', 'hasEventListener', 'getCapabilities', 'activePlugin',
    'PLAY_SUCCEEDED', 'PLAY_FINISHED', 'PLAY_FAILED', 'PLAY_INTERRUPTED',
  ],
};

// Méthodes d'instance d'un LoadQueue (AbstractLoader.prototype des vraies libs),
// proposées après `new createjs.LoadQueue().`
export const LOADQUEUE_INSTANCE = [
  'loadFile', 'loadManifest', 'load', 'getResult', 'getItem', 'getItems',
  'setPaused', 'setMaxConnections', 'installPlugin', 'registerLoader', 'remove', 'removeAll', 'reset', 'close',
];

// Méthodes d'instance d'un tween (AbstractTween.prototype des vraies libs) :
// proposées après `createjs.Tween.get(...).`
export const TWEEN_INSTANCE = ['to', 'wait', 'call', 'set', 'play', 'pause', 'label', 'clone'];

function optionsOf(labels, type) {
  return labels.map((label) => ({ label, type }));
}

// `Scene.` / `Game.` : liste racine, ou liste clip si on édite un script
// d'image / de symbole dans un symbole (inSymbolContext() fourni par le panneau).
function sceneCompletionSource(state, inSymbolContext) {
  return (context) => {
    const word = context.matchBefore(/[\w$]*/);
    if (!word) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 20), word.from);
    if (!/(?:Scene|Game)\.$/.test(before)) return null;
    const labels = inSymbolContext() ? SCENE_CLIP_COMPLETIONS : SCENE_ROOT_COMPLETIONS;
    return { from: word.from, options: optionsOf(labels, 'property') };
  };
}

// `createjs.` -> globales ; `createjs.Tween.` (etc.) -> sous-API statique ;
// `createjs.Tween.get(...).` -> méthodes d'instance du tween.
function createjsCompletionSources() {
  const globalSource = (context) => {
    const word = context.matchBefore(/[\w$]*/);
    if (!word) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 30), word.from);
    if (!/createjs\.$/.test(before)) return null;
    return { from: word.from, options: optionsOf(CREATEJS_GLOBALS, 'class') };
  };
  const subSource = (context) => {
    const word = context.matchBefore(/[\w$]*/);
    if (!word) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 30), word.from);
    const m = /createjs\.(Tween|Ease|Ticker|Sound)\.$/.exec(before);
    if (!m) return null;
    return { from: word.from, options: optionsOf(CREATEJS_SUB[m[1]], 'property') };
  };
  const loadQueueInstanceSource = (context) => {
    const word = context.matchBefore(/[\w$]*/);
    if (!word) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 120), word.from);
    if (!/new\s+createjs\.LoadQueue\s*\([^)]*\)\.$/.test(before)) return null;
    return { from: word.from, options: optionsOf(LOADQUEUE_INSTANCE, 'method') };
  };
  const tweenInstanceSource = (context) => {
    const word = context.matchBefore(/[\w$]*/);
    if (!word) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 120), word.from);
    if (!/createjs\.Tween\.get\s*\([^)]*\)\.$/.test(before)) return null;
    return { from: word.from, options: optionsOf(TWEEN_INSTANCE, 'method') };
  };
  return [globalSource, subSource, tweenInstanceSource, loadQueueInstanceSource];
}

// Noms d'instance du document courant comme variables directement utilisables
// (`nom.x += 1`). On ignore les positions après un point / crochet pour ne pas
// parasiter Scene.* ou obj.prop.
function instanceNameCompletionSource(state) {
  return (context) => {
    const word = context.matchBefore(/[\w$]*/);
    if (!word) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 1), word.from);
    if (before === '.' || before === '[') return null;
    const options = Object.keys(getNamedElements(state.doc, state.editPath, state.currentFrame))
      .map((label) => ({ label, type: 'variable' }));
    if (!options.length) return null;
    return { from: word.from, options };
  };
}

// Propriétés d'un élément nommé après « nom. » (y compris l'API événements).
function instancePropsCompletionSource(state) {
  return (context) => {
    const word = context.matchBefore(/[\w$]*/);
    if (!word) return null;
    const before = context.state.sliceDoc(Math.max(0, word.from - 40), word.from);
    const m = /([A-Za-z_$][\w$]*)\.$/.exec(before);
    if (!m) return null;
    if (!(m[1] in getNamedElements(state.doc, state.editPath, state.currentFrame))) return null;
    return { from: word.from, options: optionsOf(INSTANCE_PROPS, 'property') };
  };
}

// Fabrique le tableau de sources à passer à javascriptLanguage.data.of().
// `inSymbolContext` : fonction booléenne fournie par le panneau (true quand la
// cible éditée est un script d'image ou de symbole dans un MovieClip).
export function makeCompletionSources(state, inSymbolContext = () => false) {
  return [
    sceneCompletionSource(state, inSymbolContext),
    ...createjsCompletionSources(),
    instanceNameCompletionSource(state),
    instancePropsCompletionSource(state),
  ];
}
