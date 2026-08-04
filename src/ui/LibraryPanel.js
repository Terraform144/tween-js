import {
  createSymbol, createInstance, getContextLayers, getActiveKeyframe,
  symbolUsesSymbol, cloneElement, nextId, getSymbolContentBounds,
} from '../core/model.js';
import { notify } from '../state.js';
import { downloadSymbolAsGameObject } from '../export/exportSymbol.js';
import { createPanel } from './Panel.js';
import { ICONS } from './icons.js';

export function mountLibraryPanel(container, state, { addInstanceAt }) {
  const newSymbolBtn = document.createElement('button');
  newSymbolBtn.textContent = '+ Nouveau symbole (Ctrl+F8)';
  newSymbolBtn.addEventListener('click', createNewSymbol);
  const convertBtn = document.createElement('button');
  convertBtn.textContent = 'Convertir en symbole (F8)';
  convertBtn.addEventListener('click', convertSelectionToSymbol);

  const { body: list } = createPanel(container, {
    key: 'libraryCollapsed',
    label: 'Bibliothèque',
    actions: [newSymbolBtn, convertBtn],
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F8' && e.ctrlKey) { e.preventDefault(); createNewSymbol(); }
    else if (e.key === 'F8') { e.preventDefault(); convertSelectionToSymbol(); }
  });

  // Crée un symbole vide et bascule immédiatement en édition isolée dessus
  // (scène vierge dédiée), façon "Nouveau symbole" (Ctrl+F8) des éditeurs
  // d'animation professionnels. Le bandeau en haut de la scène permet de
  // revenir à la scène principale.
  function createNewSymbol() {
    const asMovieClip = confirm('Créer un clip animé (MovieClip) avec sa propre timeline ?\nAnnuler = symbole Graphic (synchronisé sur la scène).');
    const name = prompt('Nom du symbole :', 'Symbole ' + (Object.keys(state.doc.symbols).length + 1));
    if (!name) return;
    const symbol = createSymbol(name, asMovieClip ? 'movieclip' : 'graphic');
    state.doc.symbols[symbol.id] = symbol;
    enterSymbolEditing(symbol);
  }

  function enterSymbolEditing(symbol) {
    state.editPath = [symbol.id];
    state.selectedLayerId = symbol.layers[0].id;
    state.selectedElementIds = [];
    state.currentFrame = 0;
    notify(state);
  }

  function convertSelectionToSymbol() {
    if (!state.selectedElementIds.length) return;
    const layers = getContextLayers(state.doc, state.editPath);
    const layer = layers.find((l) => l.id === state.selectedLayerId);
    if (!layer) return;

    // On lit le contenu sélectionné depuis l'image clé qui le possède
    // RÉELLEMENT (jamais une nouvelle) : la tête de lecture peut être sur
    // une image tenue ou en plein milieu d'un tween sans que ça doive créer
    // d'image clé — ça scinderait le tween en deux pour rien.
    const originKf = getActiveKeyframe(layer, state.currentFrame);
    const selected = originKf.elements.filter((e) => state.selectedElementIds.includes(e.id));
    if (!selected.length) return;

    const asMovieClip = confirm('Créer un clip animé (MovieClip) avec sa propre timeline ?\nAnnuler = symbole Graphic (synchronisé sur la scène).');
    const symbol = createSymbol(prompt('Nom du symbole :', 'Symbole ' + (Object.keys(state.doc.symbols).length + 1)) || 'Symbole', asMovieClip ? 'movieclip' : 'graphic');
    symbol.layers[0].keyframes[0].elements = selected.map((el) => cloneElement(el, false));
    state.doc.symbols[symbol.id] = symbol;

    // Un même id d'instance par forme convertie, réutilisé dans TOUTES les
    // images clés du calque où cette forme apparaît (une image clé F6
    // suivante clone le même id) : c'est ce qui permet à un tween déjà en
    // place de continuer à interpoler correctement après la conversion.
    const idMap = new Map(selected.map((el) => [el.id, nextId('inst')]));
    for (const kf of layer.keyframes) {
      const matches = kf.elements.filter((e) => idMap.has(e.id));
      if (!matches.length) continue;
      const remaining = kf.elements.filter((e) => !idMap.has(e.id));
      for (const el of matches) {
        remaining.push(createInstance(symbol.id, {
          id: idMap.get(el.id),
          x: el.x, y: el.y, rotation: el.rotation, scaleX: el.scaleX, scaleY: el.scaleY, opacity: el.opacity,
        }));
      }
      kf.elements = remaining;
    }

    state.selectedElementIds = [...idMap.values()];
    notify(state);
  }

  function renderList() {
    list.innerHTML = '';
    const symbols = Object.values(state.doc.symbols);
    if (!symbols.length) {
      const empty = document.createElement('div');
      empty.className = 'lib-empty';
      empty.textContent = 'Aucun symbole. Clique "+ Nouveau symbole" pour partir d\'une scène vierge, ou sélectionne des objets sur la scène puis "Convertir en symbole".';
      list.appendChild(empty);
      return;
    }
    for (const symbol of symbols) {
      const item = document.createElement('div');
      item.className = 'lib-item';
      if (state.editPath[state.editPath.length - 1] === symbol.id) item.classList.add('selected');

      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.innerHTML = ICONS[symbol.type === 'movieclip' ? 'movieclip' : 'graphic'];

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = symbol.name;

      const addBtn = iconBtn('plus', 'Ajouter une instance au centre de la scène');
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hostId = state.editPath[state.editPath.length - 1];
        if (hostId && (hostId === symbol.id || symbolUsesSymbol(state.doc, symbol.id, hostId))) {
          alert('Impossible : cela créerait une boucle infinie de symboles imbriqués.');
          return;
        }
        // Centre le CONTENU du symbole (et non son origine (0,0)) sur la
        // feuille : si le contenu est dessiné loin de son origine, il
        // apparaîtrait hors feuille (voir getSymbolContentBounds).
        const b = getSymbolContentBounds(state.doc, symbol.id);
        const cx = state.doc.width / 2;
        const cy = state.doc.height / 2;
        const p = (b.width > 0 || b.height > 0)
          ? { x: cx - (b.x + b.width / 2), y: cy - (b.y + b.height / 2) }
          : { x: cx, y: cy };
        addInstanceAt(symbol.id, p);
      });

      const renameBtn = iconBtn('pencil', 'Renommer');
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = prompt('Nom du symbole :', symbol.name);
        if (next) { symbol.name = next; notify(state); }
      });

      const exportBtn = iconBtn('export', "Exporter comme objet de jeu JS (classe MovieClip réutilisable)");
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadSymbolAsGameObject(state.doc, symbol.id);
      });

      const delBtn = iconBtn('trash', 'Supprimer le symbole');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Supprimer le symbole "${symbol.name}" ?`)) {
          delete state.doc.symbols[symbol.id];
          notify(state);
        }
      });

      item.addEventListener('dblclick', () => enterSymbolEditing(symbol));

      item.append(icon, name, addBtn, renameBtn, exportBtn, delBtn);
      list.appendChild(item);
    }
  }

  function update() {
    renderList();
  }

  update();
  return { update };
}

function iconBtn(iconName, title) {
  const b = document.createElement('button');
  b.innerHTML = ICONS[iconName];
  b.title = title;
  return b;
}
