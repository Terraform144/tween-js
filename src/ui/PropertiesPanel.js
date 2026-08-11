import { getContextLayers, getActiveKeyframe, getKeyframeAt, insertKeyframe, getChildBones, getSkeletonBones, getSkeletonsFromKeyframe, getAsset } from '../core/model.js';
import { notify } from '../state.js';
import { createPanel } from './Panel.js';

export function mountPropertiesPanel(container, state) {
  const { body } = createPanel(container, { key: 'propertiesCollapsed', label: 'Propriétés' });

  function layers() { return getContextLayers(state.doc, state.editPath); }
  function selectedLayer() { return layers().find((l) => l.id === state.selectedLayerId); }

  function mutateSelectedElement(fn) {
    const layer = selectedLayer();
    if (!layer) return;
    const kf = insertKeyframe(layer, state.currentFrame);
    const el = kf.elements.find((e) => e.id === state.selectedElementIds[0]);
    if (!el) return;
    fn(el);
    notify(state);
  }

  function numberRow(label, value, onChange, opts = {}) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    if (opts.step) input.step = opts.step;
    input.value = Math.round(value * 100) / 100;
    input.addEventListener('change', () => onChange(parseFloat(input.value) || 0));
    row.append(l, input);
    body.appendChild(row);
    return input;
  }

  function colorRow(label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = value || '#000000';
    // 'change' (et non 'input') : le nuancier natif émet 'input' en continu
    // pendant que l'on choisit la couleur — un re-rendu à chaque événement
    // détruirait l'élément et refermerait le nuancier avant confirmation.
    input.addEventListener('change', () => onChange(input.value));
    row.append(l, input);
    body.appendChild(row);
  }

  function textRow(label, value, onChange, opts = {}) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    if (opts.title) input.title = opts.title;
    input.addEventListener('change', () => onChange(input.value));
    row.append(l, input);
    body.appendChild(row);
  }

  // Boîte de texte multiligne (paragraphe) : Entrée insère un retour à la
  // ligne, ce qu'un <input> ne permet pas. 'change' (au blur) comme les
  // autres champs texte, pas 'input' — sinon chaque frappe déclencherait un
  // notify()/re-render qui détruit et recrée ce <textarea>, perdant le focus
  // et la position du curseur en pleine saisie.
  function textAreaRow(label, value, onChange, opts = {}) {
    const row = document.createElement('div');
    row.className = 'prop-row prop-row-textarea';
    const l = document.createElement('label');
    l.textContent = label;
    const textarea = document.createElement('textarea');
    textarea.value = value || '';
    textarea.rows = opts.rows || 5;
    if (opts.title) textarea.title = opts.title;
    textarea.addEventListener('change', () => onChange(textarea.value));
    row.append(l, textarea);
    body.appendChild(row);
    return textarea;
  }

  function enumRow(label, value, choices, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    const select = document.createElement('select');
    for (const [v, text] of choices) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = text;
      if (v === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => onChange(select.value));
    row.append(l, select);
    body.appendChild(row);
    return select;
  }

  function selectRow(label, value, options, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    const select = document.createElement('select');
    
    // Ajouter une option vide pour aucun parent
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '(aucun)';
    select.appendChild(emptyOpt);
    
    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.value === value) option.selected = true;
      select.appendChild(option);
    }
    
    select.addEventListener('change', () => onChange(select.value === '' ? null : select.value));
    row.append(l, select);
    body.appendChild(row);
    return select;
  }

  function renderTweenSection() {
    const layer = selectedLayer();
    if (!layer) return;
    const kf = getKeyframeAt(layer, state.currentFrame);
    if (!kf || !kf.tween) return;
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = 'Interpolation';
    const select = document.createElement('select');
    for (const [value, text] of [['linear', 'Linéaire'], ['easeIn', 'Accél.'], ['easeOut', 'Décél.'], ['easeInOut', 'Accél./Décél.']]) {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = text;
      if (kf.tween.easing === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => { kf.tween.easing = select.value; notify(state); });
    row.append(l, select);
    body.appendChild(row);

    const hint = document.createElement('div');
    hint.className = 'prop-empty';
    hint.style.marginTop = '-4px';
    hint.textContent = "Astuce : une courbe (plume) avec le même nombre de points sur les deux images clés sera morphée point à point ; sinon elle bouge en bloc.";
    body.appendChild(hint);
  }

  function renderDocSection() {
    const group = document.createElement('div');
    group.className = 'prop-group';
    body.appendChild(group);
    const info = document.createElement('div');
    info.className = 'prop-empty';
    info.textContent = state.editPath.length
      ? `Édition du symbole. Sélectionne un objet sur la scène.`
      : 'Aucune sélection. Sélectionne un objet sur la scène.';
    group.appendChild(info);
  }

  function render() {
    body.innerHTML = '';
    renderTweenSection();

    if (state.selectedElementIds.length !== 1) {
      renderDocSection();
      return;
    }

    const layer = selectedLayer();
    if (!layer) { renderDocSection(); return; }
    const active = getActiveKeyframe(layer, state.currentFrame);
    const el = active && active.elements.find((e) => e.id === state.selectedElementIds[0]);
    if (!el) { renderDocSection(); return; }

    textRow('Nom d\'instance', el.name || '', (v) => mutateSelectedElement((e) => (e.name = v)), {
      title: 'Nom utilisé dans les scripts (ex : nom.x += 1). Pas d\'espaces ni de caractères spéciaux.',
    });
    numberRow('X', el.x, (v) => mutateSelectedElement((e) => (e.x = v)));
    numberRow('Y', el.y, (v) => mutateSelectedElement((e) => (e.y = v)));
    if ((el.kind === 'shape' && el.shapeType !== 'line' && el.shapeType !== 'path' && el.shapeType !== 'text') || el.kind === 'bitmap') {
      numberRow('Largeur', el.width, (v) => mutateSelectedElement((e) => (e.width = Math.max(1, v))));
      numberRow('Hauteur', el.height, (v) => mutateSelectedElement((e) => (e.height = Math.max(1, v))));
    }
    if (el.kind === 'shape' && el.shapeType === 'text') {
      // La hauteur d'un texte se déduit du contenu (comme le texte
      // paragraphe d'Animate CC) : seule la largeur de la boîte se règle.
      numberRow('Largeur (boîte)', el.width, (v) => mutateSelectedElement((e) => (e.width = Math.max(20, v))));
    }
    numberRow('Rotation', el.rotation, (v) => mutateSelectedElement((e) => (e.rotation = v)));
    numberRow('Échelle X', el.scaleX, (v) => mutateSelectedElement((e) => (e.scaleX = v)), { step: 0.1 });
    numberRow('Échelle Y', el.scaleY, (v) => mutateSelectedElement((e) => (e.scaleY = v)), { step: 0.1 });
    numberRow('Opacité', el.opacity, (v) => mutateSelectedElement((e) => (e.opacity = Math.max(0, Math.min(1, v)))), { step: 0.1 });

    if (el.kind === 'shape') {
      colorRow('Remplissage', el.fill, (v) => mutateSelectedElement((e) => (e.fill = v)));
      colorRow('Contour', el.stroke, (v) => mutateSelectedElement((e) => (e.stroke = v)));
      numberRow('Ép. contour', el.strokeWidth, (v) => mutateSelectedElement((e) => (e.strokeWidth = Math.max(0, v))));
      if (el.shapeType === 'text') {
        textAreaRow('Texte', el.text, (v) => mutateSelectedElement((e) => (e.text = v)), {
          title: 'Entrée pour aller à la ligne. Le texte se répartit automatiquement dans la largeur de la boîte (comme un paragraphe).',
        });
        numberRow('Taille police', el.fontSize, (v) => mutateSelectedElement((e) => (e.fontSize = Math.max(1, v))));
        numberRow('Interligne', el.lineHeight != null ? el.lineHeight : 1.2, (v) => mutateSelectedElement((e) => (e.lineHeight = Math.max(0.5, v))), { step: 0.1 });
        enumRow('Alignement', el.align || 'center', [
          ['left', 'Gauche'],
          ['center', 'Centre'],
          ['right', 'Droite'],
        ], (v) => mutateSelectedElement((e) => (e.align = v)));
      }
      
      // Sélecteur de squelette pour le skinning
      const layer = selectedLayer();
      const kf = getActiveKeyframe(layer, state.currentFrame);
      if (kf) {
        const skeletons = getSkeletonsFromKeyframe(kf);
        if (skeletons.length > 0) {
          const skeletonOptions = skeletons.map((skel) => ({ value: skel.id, text: skel.name }));
          selectRow('Squelette', el.skeletonId, skeletonOptions, (skeletonId) => {
            mutateSelectedElement((e) => (e.skeletonId = skeletonId));
            // Effacer le boneId ancien si on utilise skeletonId
            if (skeletonId) {
              mutateSelectedElement((e) => (e.boneId = null));
            }
          });
        }
      }
    } else if (el.kind === 'instance') {
      const symbol = state.doc.symbols[el.symbolId];
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.innerHTML = `<label>Symbole</label><div>${symbol ? symbol.name : '(manquant)'}</div>`;
      body.appendChild(row);
    } else if (el.kind === 'bitmap') {
      const asset = getAsset(state.doc, el.assetId);
      const row = document.createElement('div');
      row.className = 'prop-row';
      const l = document.createElement('label');
      l.textContent = 'Image';
      const name = document.createElement('div');
      name.className = 'prop-value';
      name.textContent = asset ? asset.name : '(asset manquant)';
      name.title = asset ? `${asset.width}×${asset.height} — ${asset.type || ''}` : '';
      row.append(l, name);
      body.appendChild(row);
    } else if (el.kind === 'bone') {
      numberRow('Longueur', el.length, (v) => mutateSelectedElement((e) => (e.length = Math.max(1, v))));
      colorRow('Couleur', el.color, (v) => mutateSelectedElement((e) => (e.color = v)));
      numberRow('Ép. trait', el.strokeWidth, (v) => mutateSelectedElement((e) => (e.strokeWidth = Math.max(1, v))));
      numberRow('Rayon influence', el.influenceRadius, (v) => mutateSelectedElement((e) => (e.influenceRadius = Math.max(1, v))));
      
      // Afficher le squelette auquel ce bone appartient (lecture seule)
      if (el.skeletonId) {
        const row = document.createElement('div');
        row.className = 'prop-row';
        row.innerHTML = `<label>Squelette</label><div>${el.skeletonId}</div>`;
        body.appendChild(row);
      }
      
      // Sélecteur de parent
      const layer = selectedLayer();
      const kf = getActiveKeyframe(layer, state.currentFrame);
      if (kf) {
        const allBones = kf.elements.filter((e) => e.kind === 'bone' && e.id !== el.id);
        const boneOptions = allBones.map((bone) => ({ value: bone.id, text: bone.id }));
        selectRow('Parent', el.parentBoneId, boneOptions, (parentId) => {
          mutateSelectedElement((e) => (e.parentBoneId = parentId));
        });
      }
    }

    const delRow = document.createElement('div');
    delRow.className = 'prop-row';
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Supprimer l\'objet';
    delBtn.addEventListener('click', () => {
      const kf = insertKeyframe(layer, state.currentFrame);
      kf.elements = kf.elements.filter((e) => e.id !== el.id);
      state.selectedElementIds = [];
      notify(state);
    });
    delRow.appendChild(delBtn);
    body.appendChild(delRow);
  }

  render();
  return { update: render };
}
