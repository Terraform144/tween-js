import { notify } from '../state.js';
import { ICONS } from './icons.js';
import { isGradientPaint } from '../core/model.js';

const TOOLS = [
  { id: 'select', icon: 'select', title: 'Sélection (V)' },
  { id: 'subselect', icon: 'subselect', title: 'Sous-sélection — éditer les points d\'une courbe (A)' },
  { id: 'rect', icon: 'rect', title: 'Rectangle (R)' },
  { id: 'ellipse', icon: 'ellipse', title: 'Ellipse (O)' },
  { id: 'line', icon: 'line', title: 'Ligne (L)' },
  { id: 'pen', icon: 'pen', title: 'Plume — courbes de Bézier, clic = point anguleux, clic-glissé = point lisse (P)' },
  { id: 'text', icon: 'text', title: 'Texte (T)' },
];

const SHORTCUTS = { v: 'select', a: 'subselect', r: 'rect', o: 'ellipse', l: 'line', b: 'bone', c: 'boneChain', p: 'pen', t: 'text' };

export function mountToolbar(container, state, { onDelete } = {}) {
  container.innerHTML = '';

  const buttons = {};
  for (const tool of TOOLS) {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.title = tool.title;
    btn.innerHTML = ICONS[tool.icon];
    btn.addEventListener('click', () => {
      state.currentTool = tool.id;
      notify(state);
    });
    container.appendChild(btn);
    buttons[tool.id] = btn;
  }

  // Bouton Delete (poubelle)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'tool-btn';
  deleteBtn.title = 'Supprimer (Suppr)';
  deleteBtn.innerHTML = ICONS.trash;
  deleteBtn.addEventListener('click', () => {
    if (onDelete) onDelete();
  });
  container.appendChild(deleteBtn);
  buttons.delete = deleteBtn;

  const colorRow = document.createElement('div');
  colorRow.className = 'tool-color-row';
  colorRow.title = 'Couleur de remplissage / contour';

  // Type de remplissage : couleur unie ou dégradé. En mode dégradé,
  // state.fillColor devient un objet { type, angle?, stops } et le nuancier
  // ci-dessous édite la couleur du dernier arrêt. Les formes créées ensuite
  // reprennent ce fill tel quel (voir Stage.js #applyKonvaPaint).
  const fillTypeSelect = document.createElement('select');
  fillTypeSelect.className = 'tool-fill-type';
  fillTypeSelect.title = 'Type de remplissage pour les nouvelles formes';
  fillTypeSelect.innerHTML = '<option value="solid">Unie</option><option value="linear">Dégradé linéaire</option><option value="radial">Dégradé radial</option>';

  let solidFill = state.fillColor;
  const currentFillColor = () => isGradientPaint(state.fillColor)
    ? state.fillColor.stops[state.fillColor.stops.length - 1].color
    : state.fillColor;

  fillTypeSelect.addEventListener('change', () => {
    const mode = fillTypeSelect.value;
    if (mode === 'solid') {
      state.fillColor = solidFill;
    } else {
      const stops = [{ offset: 0, color: '#ffffff' }, { offset: 1, color: currentFillColor() }];
      state.fillColor = mode === 'linear'
        ? { type: 'linear', angle: 90, stops }
        : { type: 'radial', stops };
    }
    notify(state);
  });

  const fillInput = document.createElement('input');
  fillInput.type = 'color';
  fillInput.value = state.fillColor;
  // 'change' (et non 'input') : comme pour le panneau propriétés, 'input' est
  // émis en continu pendant le choix dans le nuancier natif et re-déclencherait
  // un rendu global à chaque événement (la couleur n'est lue qu'à la création
  // d'une forme, pas en direct — rien ne justifie le rendu continu).
  fillInput.addEventListener('change', () => {
    if (isGradientPaint(state.fillColor)) {
      state.fillColor.stops[state.fillColor.stops.length - 1].color = fillInput.value;
    } else {
      state.fillColor = fillInput.value;
      solidFill = fillInput.value;
    }
    notify(state);
  });

  const strokeInput = document.createElement('input');
  strokeInput.type = 'color';
  strokeInput.value = state.strokeColor;
  strokeInput.addEventListener('change', () => { state.strokeColor = strokeInput.value; notify(state); });

  colorRow.append(fillTypeSelect, fillInput, strokeInput);
  container.appendChild(colorRow);

  window.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const tool = SHORTCUTS[e.key.toLowerCase()];
    if (tool) { state.currentTool = tool; notify(state); }
  });

  function update() {
    for (const tool of TOOLS) {
      buttons[tool.id].classList.toggle('active', state.currentTool === tool.id);
    }
    const fillColor = currentFillColor();
    if (fillInput.value !== fillColor) fillInput.value = fillColor;
    fillTypeSelect.value = isGradientPaint(state.fillColor) ? state.fillColor.type : 'solid';
    if (strokeInput.value !== state.strokeColor) strokeInput.value = state.strokeColor;
    // Désactiver le bouton delete s'il n'y a pas de sélection
    deleteBtn.disabled = state.selectedElementIds.length === 0;
  }

  update();
  return { update };
}
