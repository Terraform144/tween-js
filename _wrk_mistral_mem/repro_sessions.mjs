// Harnais : sessions multi-projets — historiques separés par fenetre,
// champs façade (image courante, sélection) préservés par projet.
// Reproduit l'orchestration de main.js (createSession/setCurrentSession)
// avec les vrais modules state.js et history.js.
import { createEditorState, notify } from '../src/state.js';
import { createHistory } from '../src/history.js';
import { createDocument, createShape } from '../src/core/model.js';

const state = createEditorState(createDocument({ name: 'A' }));
const PER = ['doc', 'editPath', 'currentFrame', 'selectedLayerId', 'selectedElementIds', 'selectedKeyframe', 'focusFrameScript', 'playing'];
let sessions = [];
let current = null;

function createSession(doc) {
  const history = createHistory(state);
  history.detach();
  return { history, minimized: false, saved: { doc, editPath: [], currentFrame: 0, selectedLayerId: doc.layers[0].id, selectedElementIds: [], selectedKeyframe: null, focusFrameScript: null, playing: false } };
}
function setCurrent(s) {
  if (s === current) return;
  if (current) { for (const f of PER) current.saved[f] = state[f]; current.history.detach(); }
  current = s;
  Object.assign(state, s.saved);
  state.playing = false;
  s.history.attach();
}
function open(doc) { const s = createSession(doc); sessions.push(s); setCurrent(s); }
function mutate(label) { state.doc.layers[0].keyframes[0].elements.push(createShape('rect', { width: 10 })); state.doc.layers[0].keyframes[0].elements[0].name = label; notify(state); }

let fails = 0;
const check = (label, cond) => { console.log((cond ? 'OK    ' : 'ECHEC ') + label); if (!cond) fails++; };

// Session initiale A (façade déjà dessus)
const sA = createSession(state.doc); sessions.push(sA); current = sA; sA.history.attach();

mutate('rect A1');
check('A : canUndo apres modification', sA.history.canUndo());

state.currentFrame = 5; // position de lecture de A
state.selectedElementIds = ['x1'];

// Ouvrir B dans une nouvelle fenetre
const sB = createSession(createDocument({ name: 'B' })); sessions.push(sB); setCurrent(sB);
check('B : pile undo vide a l ouverture', !sB.history.canUndo());
check('A : pile undo conservee pendant B actif', sA.history.canUndo());

mutate('rect B1');
check('B : canUndo apres sa modification', sB.history.canUndo());
check('A : la modif de B ne fuit pas dans la pile de A (2 niveaux max attendus)', sA.history.canUndo());

// Revenir a A : la façade doit retrouver ses champs (image 5, selection x1)
setCurrent(sA);
check('A : currentFrame restaure (5)', state.currentFrame === 5);
check('A : selection restauree', state.selectedElementIds[0] === 'x1');
check('A : doc de A reveille', state.doc.name === 'A');

// Undo dans A : doit retirer le rect A1 (retour a l etat vierge)
sA.history.undo();
check('A : undo retire la modification pre-switch', state.doc.layers[0].keyframes[0].elements.length === 0);

// B intact apres le undo de A
setCurrent(sB);
check('B : doc intact apres undo cote A', state.doc.layers[0].keyframes[0].elements.length === 1 && state.doc.layers[0].keyframes[0].elements[0].name === 'rect B1');
sB.history.undo();
check('B : undo retire sa propre modification', state.doc.layers[0].keyframes[0].elements.length === 0);

// Pause auto : jouer A, basculer sur B → A est mis en pause
setCurrent(sA);
state.playing = true;
setCurrent(sB);
setCurrent(sA);
check('A : lecture mise en pause automatiquement au detach', state.playing === false);


// ---- Meme scene ouverte DEUX fois (flux Archives : meme contenu, memes ids) ----
{
  const docA = createDocument({ name: 'Scene X' });
  docA.layers[0].keyframes[0].elements.push(createShape('rect', { width: 30, height: 30 }));
  const docB = JSON.parse(JSON.stringify(docA)); // loadProject() reparsait le meme JSON
  const s1 = createSession(docA); sessions.push(s1); setCurrent(s1);
  const s2 = createSession(docB); sessions.push(s2); setCurrent(s2);
  check('meme scene : 2e fenetre ouverte (sessions=4 : 2 scenarios precedents + 2 copies)', sessions.length === 4);
  check('meme scene : facade pointe sur la copie (objet distinct)', state.doc !== docA && state.doc.name === 'Scene X');
  mutate('rect copie');
  check('meme scene : mutation isolee (original intact)', docA.layers[0].keyframes[0].elements.length === 1);
  setCurrent(s1);
  check('meme scene : retour fenetre 1, contenu distinct', state.doc.layers[0].keyframes[0].elements.length === 1 && state.doc.layers[0].keyframes[0].elements[0].name !== 'rect copie');
  setCurrent(s2);
  s2.history.undo();
  check('meme scene : undo de la copie retire SA modif', state.doc.layers[0].keyframes[0].elements.every(e => e.name !== 'rect copie'));
  setCurrent(s1);
  check('meme scene : fenetre 1 intacte apres undo cote copie', state.doc.layers[0].keyframes[0].elements.length === 1);
}

console.log(fails ? '\nECHECS: ' + fails : '\nTOUT OK');
process.exit(fails ? 1 : 0);
