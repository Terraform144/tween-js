// Test archives indexees par id : deux scenes du MEME NOM coexistent,
// chaque Ctrl+S met a jour SA propre entree (pas de fusion par nom).
import { getAllProjects, saveProject, loadProject } from '../src/util/projects.js';
import { createDocument } from '../src/core/model.js';

const store = { _m: {} };
globalThis.localStorage = {
  getItem(k) { return store._m[k] !== undefined ? store._m[k] : null; },
  setItem(k, v) { store._m[k] = String(v); },
  removeItem(k) { delete store._m[k]; },
};

let fails = 0;
const check = (label, cond) => { console.log((cond ? 'OK    ' : 'ECHEC ') + label); if (!cond) fails++; };

const docA = createDocument({ name: 'Scene X' });
const docB = createDocument({ name: 'Scene X' }); // MEME NOM

// 1. Sauvegarde de A puis B : deux entrees distinctes attendues
const a1 = saveProject(docA);
const b1 = saveProject(docB);
check('A et B creent 2 entrees (plus de fusion par nom)', getAllProjects().length === 2);
check('ids d archive distincts', a1.id !== b1.id);
check('docA memorise son id d archive', docA._archiveId === a1.id);
check('docB memorise son id d archive', docB._archiveId === b1.id);

// 2. Re-sauvegarde de A : met a jour SON entree, n ecrase pas B
saveProject(docA);
const projects2 = getAllProjects();
check('re-sauvegarde de A : toujours 2 entrees', projects2.length === 2);
check('les 2 entrees portent encore le meme nom', projects2.filter(p => p.name === 'Scene X').length === 2);

// 3. Chargement : deux docs distincts rechargeables
const loadedA = loadProject(a1.id);
const loadedB = loadProject(b1.id);
check('loadProject(A) et loadProject(B) distincts', !!loadedA && !!loadedB && a1.id !== b1.id);
check('doc charge porte son _archiveId (mise a jour en place ensuite)', loadedA._archiveId === a1.id);

// 4. Legacy : entree ancienne sans _archiveId dans le JSON stocke
store._m['tweenjs:projects'] = JSON.stringify([{ id: 'legacy1', name: 'Vieux', data: JSON.stringify({ name: 'Vieux', layers: [] }), timestamp: 1 }]);
const legacyDoc = loadProject('legacy1');
legacyDoc._archiveId = 'legacy1'; // fait par MenuBar au clic sur l entree
saveProject(legacyDoc);
const afterLegacy = getAllProjects();
check('legacy : sauvegarde met a jour l entree existante (pas de doublon)', afterLegacy.length === 1 && afterLegacy[0].id === 'legacy1');

console.log(fails ? '\nECHECS: ' + fails : '\nTOUT OK');
process.exit(fails ? 1 : 0);
