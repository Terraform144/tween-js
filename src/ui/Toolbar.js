import { notify } from '../state.js';
import { ICONS } from './icons.js';

const TOOLS = [
  { id: 'select', icon: 'select', title: 'Sélection (V)' },
  { id: 'subselect', icon: 'subselect', title: 'Sous-sélection — éditer les points d\'une courbe (A)' },
  { id: 'rect', icon: 'rect', title: 'Rectangle (R)' },
  { id: 'ellipse', icon: 'ellipse', title: 'Ellipse (O)' },
  { id: 'line', icon: 'line', title: 'Ligne (L)' },
  { id: 'pen', icon: 'pen', title: 'Plume — courbes de Bézier, clic = point anguleux, clic-glissé = point lisse (P)' },
  { id: 'brush', icon: 'pencil', title: 'Pinceau — dessiner des traits libres (B)' },
  { id: 'text', icon: 'text', title: 'Texte (T)' },
];

const SHORTCUTS = { v: 'select', a: 'subselect', r: 'rect', o: 'ellipse', l: 'line', b: 'brush', p: 'pen', t: 'text' };

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

  const fillInput = document.createElement('input');
  fillInput.type = 'color';
  fillInput.value = state.fillColor;
  // 'change' (et non 'input') : comme pour le panneau propriétés, 'input' est
  // émis en continu pendant le choix dans le nuancier natif et re-déclencherait
  // un rendu global à chaque événement (la couleur n'est lue qu'à la création
  // d'une forme, pas en direct — rien ne justifie le rendu continu).
  fillInput.addEventListener('change', () => { state.fillColor = fillInput.value; notify(state); });

  const strokeInput = document.createElement('input');
  strokeInput.type = 'color';
  strokeInput.value = state.strokeColor;
  strokeInput.addEventListener('change', () => { state.strokeColor = strokeInput.value; notify(state); });

  colorRow.append(fillInput, strokeInput);
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
    if (fillInput.value !== state.fillColor) fillInput.value = state.fillColor;
    if (strokeInput.value !== state.strokeColor) strokeInput.value = state.strokeColor;
    // Désactiver le bouton delete s'il n'y a pas de sélection
    deleteBtn.disabled = state.selectedElementIds.length === 0;
  }

  update();
  return { update };
}
