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

  function textRow(label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.addEventListener('change', () => onChange(input.value));
    row.append(l, input);
    body.appendChild(row);
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

  function isGrad(p) {
    return !!(p && typeof p === 'object' && (p.type === 'linear' || p.type === 'radial') && Array.isArray(p.stops));
  }

  // Éditeur de "peinture" : couleur unie ou dégradé (linéaire/radial) avec
  // arrêts de couleur. Toute modification remonte via onChange(paint), qu'il
  // faut brancher sur mutateSelectedElement() (undo + notify inclus). Utilisé
  // pour le remplissage ET le contour des formes.
  // allowRadial=false pour le contour : Konva ne sait rendre que le dégradé
  // linéaire de contour (strokeLinearGradientColorStops), le radial n'existe pas.
  function renderPaintEditor(label, value, onChange, allowRadial = true) {
    const grad = isGrad(value);
    const type = grad ? value.type : 'solid';
    const options = [['solid', 'Couleur unie'], ['linear', 'Dégradé linéaire']];
    if (allowRadial) options.push(['radial', 'Dégradé radial']);
    // Un dégradé radial "hérité" alors que l'éditeur l'interdit : on l'affiche
    // en linéaire pour ne pas perdre les arrêts, la bascule est explicite.
    const effectiveType = (!allowRadial && type === 'radial') ? 'linear' : type;

    const typeRow = document.createElement('div');
    typeRow.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    const select = document.createElement('select');
    for (const [v, t] of options) {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = t;
      if (effectiveType === v) opt.selected = true;
      select.appendChild(opt);
    }
    typeRow.append(l, select);
    body.appendChild(typeRow);

    // En mode "couleur unie", on fabrique deux arrêts identiques pour que la
    // bascule vers un dégradé démarre avec une transition propre.
    const stops = (grad ? value.stops : [
      { offset: 0, color: value || '#000000' },
      { offset: 1, color: value || '#000000' },
    ]).map((s) => ({ ...s }));

    let angleInput = null;
    const currentAngle = () => (angleInput ? parseFloat(angleInput.value) || 0 : 90);

    function buildPaint() {
      if (select.value === 'solid') return stops[stops.length - 1].color;
      const paint = { type: select.value, stops: stops.map((s) => ({ ...s })) };
      if (select.value === 'linear') paint.angle = currentAngle();
      return paint;
    }

    function emit() { onChange(buildPaint()); }

    if (effectiveType === 'linear') {
      const angleRow = document.createElement('div');
      angleRow.className = 'prop-row';
      const al = document.createElement('label'); al.textContent = 'Angle';
      angleInput = document.createElement('input');
      angleInput.type = 'number';
      angleInput.value = Math.round((grad ? value.angle : 90) || 0);
      angleInput.title = '0 = gauche → droite, 90 = haut → bas';
      angleInput.addEventListener('change', emit);
      angleRow.append(al, angleInput);
      body.appendChild(angleRow);
    }

    const stopsBox = document.createElement('div');
    stopsBox.className = 'grad-stops';

    function renderStops() {
      stopsBox.innerHTML = '';
      stops.forEach((stop, i) => {
        const srow = document.createElement('div');
        srow.className = 'prop-row grad-stop';
        const off = document.createElement('input');
        off.type = 'number'; off.min = 0; off.max = 100; off.step = 1;
        off.value = Math.round(stop.offset * 100);
        off.title = 'Position (0–100 %)';
        off.addEventListener('change', () => {
          stop.offset = Math.max(0, Math.min(1, (parseFloat(off.value) || 0) / 100));
          renderStops(); emit();
        });
        const color = document.createElement('input');
        color.type = 'color';
        color.value = stop.color;
        color.addEventListener('change', () => { stop.color = color.value; emit(); });
        const del = document.createElement('button');
        del.textContent = '–';
        del.title = 'Supprimer cet arrêt';
        del.addEventListener('click', () => {
          if (stops.length > 1) { stops.splice(i, 1); renderStops(); emit(); }
        });
        srow.append(off, color, del);
        stopsBox.appendChild(srow);
      });
      const add = document.createElement('button');
      add.textContent = '+ Arrêt';
      add.addEventListener('click', () => {
        if (stops.length >= 8) return;
        stops.push({ offset: 1, color: '#cb4b16' });
        renderStops(); emit();
      });
      stopsBox.appendChild(add);
    }
    renderStops();
    body.appendChild(stopsBox);

    select.addEventListener('change', emit);
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

    numberRow('X', el.x, (v) => mutateSelectedElement((e) => (e.x = v)));
    numberRow('Y', el.y, (v) => mutateSelectedElement((e) => (e.y = v)));
    if ((el.kind === 'shape' && el.shapeType !== 'line' && el.shapeType !== 'path') || el.kind === 'bitmap') {
      numberRow('Largeur', el.width, (v) => mutateSelectedElement((e) => (e.width = Math.max(1, v))));
      numberRow('Hauteur', el.height, (v) => mutateSelectedElement((e) => (e.height = Math.max(1, v))));
    }
    numberRow('Rotation', el.rotation, (v) => mutateSelectedElement((e) => (e.rotation = v)));
    numberRow('Échelle X', el.scaleX, (v) => mutateSelectedElement((e) => (e.scaleX = v)), { step: 0.1 });
    numberRow('Échelle Y', el.scaleY, (v) => mutateSelectedElement((e) => (e.scaleY = v)), { step: 0.1 });
    numberRow('Opacité', el.opacity, (v) => mutateSelectedElement((e) => (e.opacity = Math.max(0, Math.min(1, v)))), { step: 0.1 });

    if (el.kind === 'shape') {
      renderPaintEditor('Remplissage', el.fill, (paint) => mutateSelectedElement((e) => (e.fill = paint)));
      renderPaintEditor('Contour', el.stroke, (paint) => mutateSelectedElement((e) => (e.stroke = paint)), false);
      numberRow('Ép. contour', el.strokeWidth, (v) => mutateSelectedElement((e) => (e.strokeWidth = Math.max(0, v))));
      if (el.shapeType === 'text') {
        textRow('Texte', el.text, (v) => mutateSelectedElement((e) => (e.text = v)));
        numberRow('Taille police', el.fontSize, (v) => mutateSelectedElement((e) => (e.fontSize = Math.max(1, v))));
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
      textRow('Nom instance', el.name, (v) => mutateSelectedElement((e) => (e.name = v)));
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
