// Insère la session 13 dans NOTES_SYNTHESE.md avant la session 12.
import { readFileSync, writeFileSync } from 'node:fs';

const path = '_wrk_mistral_mem/NOTES_SYNTHESE.md';
let src = readFileSync(path, 'utf8');
const marker = '### Session 12 - 02/10/2026';
if (!src.includes(marker)) { console.error('MARKER NOT FOUND'); process.exit(1); }
if (src.includes('### Session 13')) { console.log('DEJA PRESENT'); process.exit(0); }

const entry = [
  '### Session 13 - 02/10/2026 (nuit)',
  '- Demande utilisateur : (1) que TOUTES les fonctions CreateJS soient utilisables dans les scripts, via la vraie librairie importee d\'un ./libs local ; (2) a prevoir pour plus tard (NON implemente) : pouvoir charger n\'importe quelle librairie dans les scripts.',
  '- Libs : npm pack (curl direct bloque, proxy npm OK) -> easeljs 1.0.2, tweenjs 1.0.2, soundjs 1.0.1, preloadjs 1.0.1 (max dispo sur npm). Builds UMD minifies copieses dans public/libs/createjs/ (avec LICENSE-*.txt, MIT) + Animate_JS_PureVanilla/libs/createjs/. <script> UMD dans index.html (main, /libs/...) et Animate_JS_PureVanilla/index.html (libs/... relatif). Verifie : aucun </script ni <!-- dans les .min.js.',
  '- sceneRuntime.js : constante SCRIPT_LIBS = [\'createjs\'] (mecanisme extensible pour la demande 2 : ajouter une lib = la charger + ajouter son nom global ici ; RESERVED la masque auto comme nom d\'instance). execCode/runClipFrameScripts passent la globale en parametre supplementaire du new Function (globalThis.createjs, undefined-safe).',
  '- API evenements compatible EaselJS (createjs.EventDispatcher) sur les elements nommes ET Scene : on/addEventListener, off/removeEventListener, removeAllEventListeners, hasEventListener, dispatchEvent ; handlers en WeakMap hors des objets + methodes NON enumerables -> serialisation JSON du doc strictement intacte. Pipeline pointer complet sur le conteneur du stage, actif UNIQUEMENT pendant la lecture : mousedown/mouseup/click (down+up sur le meme element, semantique EaselJS), dblclick, pressmove/pressup, mouseover/mouseout, rollover/rollout, tick (via onFrame) ; evenements scene-level stagemousedown/stagemousemove/stagemouseup/stageclick. Hit-test : ellipse precise (disque), lignes/chemins (boite des points), instances (hull du symbole sur toutes ses images, recursif), le reste boite englobante ; rotation/echelle de l\'element inversees.',
  '- Scene.onClick() (session precedente, conserve) : Scene.onClick((x,y)=>...) pour tout clic scene (y compris dans le vide) et Scene.onClick(\'nom\', (x,y)=>...) pour l\'instance nommee.',
  '- main.js : createjs.Ticker.paused = !state.playing (les tweens CreateJS s\'arretent avec l\'editeur) ; rendu du stage a chaque rAF pendant la lecture (tweens fluides 60 fps independants du frameRate doc).',
  '- exportHTML.js : buildStandaloneHTML devient async ; si un script utilisateur (scripts nommes + scripts d\'image racine et symboles) contient /\\bcreatejs\\b/, les 4 libs sont fetchees depuis libs/createjs/ et inlinees en <script> avant le module (~280 Ko, seulement si utilisees ; fetchKO -> warning et createjs undefined dans l\'export). new Function des scripts exportes : parametre createjs typeof-guard. tweenRuntime.js (_runChildFrameScript) : meme parametre.',
  '- Gabarit du Script 1 (model.js) remis a neuf + exemples Scene.onClick et createjs.Tween. ATTENTION outil d\'edition : l\'outil edit passe le texte VERBATIM (backslashes non decodes) alors que write_file decode normalement -> toujours verifier les backslashes au tr/grep apres une edition qui en contient ; fix_template.mjs (construit les echappements par programme) a servi a reparer le gabarit casse par un double-echappement.',
  '- Harnais _wrk_mistral_mem/repro_createjs.mjs : 21 controles OK — vraies libs chargees en sandbox node:vm (stubs window.performance/document), tween reel sur element nomme (setPosition 50% -> x 100->300), tous les evenements pointer, hit ellipse/instance-hull, Scene.onClick (cible/vide/hors-lecture), pas d\'empilement aux re-runs, off() par cb et par wrapper, serialisation intacte.',
  '- Bundle vanilla regenere et copie (Animate_JS_PureVanilla/tweenjs-bundle.js, 634 Ko, node --check OK). ScriptsPanel : completions Scene + onClick/log. README : puce Scripts + CreateJS.',
  '- Reste a faire : validation visuelle dans l\'editeur (servir http://127.0.0.1:5173 ou la version vanilla) ; pas de push production (regle). Ouvert : les evenements pointer nommes ne sont PAS encore branches dans le HTML exporte (le runtime exporte recoit createjs mais n\'a pas de pipeline pointer) ; demande 2 (librairies arbitraires) : mecanisme SCRIPT_LIBS pret a etendre.',
  '',
].join('\r\n');

src = src.replace(marker, entry + marker);
writeFileSync(path, src);
console.log('SESSION 13 AJOUTEE');
