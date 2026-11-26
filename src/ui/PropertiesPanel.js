import { getContextLayers, getActiveKeyframe, getKeyframeAt, insertKeyframe, getChildBones, getSkeletonBones, getSkeletonsFromKeyframe, getAsset, TRANSPARENT } from '../core/model.js';
import { defaultGradient, sanitizeGradient } from '../core/gradient.js';
import { sanitizeHints, nextHintId } from '../core/shapeHints.js';
import { ICONS } from './icons.js';
import { setElementPivotField, resetElementPivot } from '../core/pivot.js';
import { simplifyShape } from '../util/simplify.js';
import { notify } from '../state.js';
import { createPanel } from './Panel.js';
import { attachColorPalette } from './colorPalette.js';

// Lie un <label> à son champ via un id/name unique : sans cette association
// (attribut for), DevTools signale « form field without id or name » et
// « label not associated with a form field », et l'accessibilité
// (focus au clic sur le libellé, lecteurs d'écran) ne fonctionne pas.
let fieldSeq = 0;
function linkLabelToField(l, field) {
  const id = 'prop-field-' + (++fieldSeq);
  field.id = id;
  field.name = id;
  l.htmlFor = id;
}

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
    linkLabelToField(l, input);
    row.append(l, input);
    body.appendChild(row);
    return input;
  }

  // Champ pivot : vide (placeholder "auto") tant qu'aucun pivot explicite
  // n'est posé — l'élément garde alors son centre de rotation par défaut.
  function pivotNumberRow(label, value, hasP, onChange, title) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('label');
    l.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.placeholder = 'auto';
    if (title) input.title = title;
    if (hasP) input.value = Math.round(value * 100) / 100;
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (Number.isNaN(v)) return; // champ vidé : aucun changement
      onChange(v);
    });
    linkLabelToField(l, input);
    row.append(l, input);
    body.appendChild(row);
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
    // Bouton « transparent » : pose la couleur CSS 'transparent' (l'input color
    // ne peut pas la représenter) — utile pour un remplissage ou un contour
    // absent (forme en fil de fer).
    const noColorBtn = document.createElement('button');
    noColorBtn.type = 'button';
    noColorBtn.className = 'icon-btn no-color-btn';
    noColorBtn.innerHTML = ICONS.noColor;
    noColorBtn.title = 'Transparent';
    noColorBtn.classList.toggle('active', value === TRANSPARENT);
    noColorBtn.addEventListener('click', () => onChange(TRANSPARENT));
    linkLabelToField(l, input);
    row.append(l, input, noColorBtn);
    // Bouton palette (swatches classiques/clair-obscur/pantone + hex en
    // horizontal en dessous) à côté du swatch : le clic sur la case ouvre le
    // panneau custom, jamais le nuancier natif mobile (hex en vertical).
    attachColorPalette(row, input, {
      allowTransparent: true,
      isTransparent: value === TRANSPARENT,
      onPick: (c) => onChange(c),
    });
    body.appendChild(row);
  }

  // ------------------------------------------------ section dégradé (propriétés uniquement,
  // comme demandé : PAS de sélecteur dans la barre d'outils gauche)
  function fracRow(label, value, onChange) {
    return numberRow(label, value, (v) => onChange(Math.max(0, Math.min(1, v))), { step: 0.05 });
  }

  function gradientSection(el) {
    if (el.kind !== 'shape') return;
    const hasFill = el.shapeType === 'rect' || el.shapeType === 'ellipse' || el.shapeType === 'text'
      || ((el.shapeType === 'path' || el.shapeType === 'line') && el.closed);
    if (!hasFill) return;
    const g = el.fillGradient || null;

    const typeRow = document.createElement('div');
    typeRow.className = 'prop-row';
    const tl = document.createElement('label');
    tl.textContent = 'Dégradé';
    const sel = document.createElement('select');
    sel.innerHTML = '<option value="none">Aucun (couleur unie)</option><option value="linear">Linéaire</option><option value="radial">Radial</option>';
    sel.value = g ? g.type : 'none';
    sel.title = 'Remplissage en dégradé (prime sur la couleur de remplissage). Coordonnées en fraction de la boîte de l\'objet (0..1).';
    sel.addEventListener('change', () => {
      mutateSelectedElement((e) => {
        if (sel.value === 'none') e.fillGradient = null;
        else e.fillGradient = sanitizeGradient({ ...(e.fillGradient || defaultGradient(e)), type: sel.value });
      });
    });
    linkLabelToField(tl, sel);
    typeRow.append(tl, sel);
    body.appendChild(typeRow);
    if (!g) return;

    if (g.type === 'linear') {
      fracRow('Début X', g.x1, (v) => mutateSelectedElement((e) => { e.fillGradient.x1 = v; }));
      fracRow('Début Y', g.y1, (v) => mutateSelectedElement((e) => { e.fillGradient.y1 = v; }));
      fracRow('Fin X', g.x2, (v) => mutateSelectedElement((e) => { e.fillGradient.x2 = v; }));
      fracRow('Fin Y', g.y2, (v) => mutateSelectedElement((e) => { e.fillGradient.y2 = v; }));
    } else {
      fracRow('Centre X', g.cx, (v) => mutateSelectedElement((e) => { e.fillGradient.cx = v; }));
      fracRow('Centre Y', g.cy, (v) => mutateSelectedElement((e) => { e.fillGradient.cy = v; }));
      fracRow('Rayon', g.r, (v) => mutateSelectedElement((e) => { e.fillGradient.r = Math.max(0.01, v); }));
    }

    // stops de couleur (offset 0..1 + couleur, ∅ = transparent)
    (g.stops || []).forEach((s, i) => {
      const r = document.createElement('div');
      r.className = 'prop-row';
      const lab = document.createElement('label');
      lab.textContent = `Stop ${i + 1}`;
      const off = document.createElement('input');
      off.type = 'number'; off.min = '0'; off.max = '1'; off.step = '0.05';
      off.value = s.offset;
      off.style.width = '52px';
      off.title = 'Position du stop dans le dégradé (0 = début, 1 = fin)';
      off.addEventListener('change', () => mutateSelectedElement((e) => {
        e.fillGradient.stops[i].offset = Math.max(0, Math.min(1, parseFloat(off.value) || 0));
      }));
      const col = document.createElement('input');
      col.type = 'color';
      col.value = s.color === TRANSPARENT ? '#000000' : (s.color || '#000000');
      col.addEventListener('change', () => mutateSelectedElement((e) => { e.fillGradient.stops[i].color = col.value; }));
      const noCol = document.createElement('button');
      noCol.type = 'button';
      noCol.className = 'icon-btn no-color-btn';
      noCol.innerHTML = ICONS.noColor;
      noCol.title = 'Transparent';
      noCol.classList.toggle('active', s.color === TRANSPARENT);
      noCol.addEventListener('click', () => mutateSelectedElement((e) => { e.fillGradient.stops[i].color = TRANSPARENT; }));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.innerHTML = ICONS.close;
      del.title = 'Supprimer ce stop (minimum 2)';
      del.disabled = (g.stops || []).length <= 2;
      del.addEventListener('click', () => mutateSelectedElement((e) => { e.fillGradient.stops.splice(i, 1); }));
      linkLabelToField(lab, off);
      r.append(lab, off, col, noCol, del);
      attachColorPalette(r, col, {
        allowTransparent: true,
        isTransparent: s.color === TRANSPARENT,
        onPick: (c) => mutateSelectedElement((e) => { e.fillGradient.stops[i].color = c; }),
      });
      body.appendChild(r);
    });

    const addRow = document.createElement('div');
    addRow.className = 'prop-row';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Ajouter un stop';
    addBtn.title = 'Ajouter une étape de couleur dans le dégradé';
    addBtn.addEventListener('click', () => mutateSelectedElement((e) => {
      const stops = e.fillGradient.stops;
      const last = stops[stops.length - 1];
      stops.push({ offset: 1, color: last ? last.color : '#ffffff' });
    }));
    addRow.appendChild(addBtn);
    body.appendChild(addRow);
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
    linkLabelToField(l, input);
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
    linkLabelToField(l, textarea);
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
    linkLabelToField(l, select);
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
    linkLabelToField(l, select);
    row.append(l, select);
    body.appendChild(row);
    return select;
  }

  // Shape hints (morphing guidé) : paires de points même id sur la keyframe de
  // départ et celle d'arrivée — voir core/shapeHints.js. Uniquement pour les
  // formes avec points (path/line).
  function hintsSection(el) {
    if (el.kind !== 'shape') return;
    if (!Array.isArray(el.points) || !el.points.length) return;
    const n = el.points.length;
    const hints = sanitizeHints(el.shapeHints, n);

    const titleRow = document.createElement('div');
    titleRow.className = 'prop-row prop-section-title';
    titleRow.textContent = 'Shape hints (morphing)';
    titleRow.title = 'Paires de points (même id) entre l\'image de départ et celle d\'arrivée : elles alignent le morphing au lieu de l\'appariement par index. Ajoutez le même id sur les deux keyframes.';
    body.appendChild(titleRow);

    hints.forEach((h, i) => {
      const r = document.createElement('div');
      r.className = 'prop-row';
      const lab = document.createElement('label');
      lab.textContent = `Hint ${i + 1}`;
      const idIn = document.createElement('input');
      idIn.type = 'text'; idIn.value = h.id; idIn.style.width = '56px';
      idIn.title = 'Identifiant du hint — le même id sur la forme de départ et d\'arrivée forme la paire';
      idIn.addEventListener('change', () => mutateSelectedElement((e) => {
        const hs = sanitizeHints(e.shapeHints, n);
        if (hs[i]) hs[i].id = idIn.value.trim() || h.id;
        e.shapeHints = hs;
      }));
      const idxIn = document.createElement('input');
      idxIn.type = 'number'; idxIn.min = '0'; idxIn.max = String(n - 1); idxIn.step = '1';
      idxIn.value = h.pointIndex; idxIn.style.width = '52px';
      idxIn.title = `Index du point de la courbe (0..${n - 1})`;
      idxIn.addEventListener('change', () => mutateSelectedElement((e) => {
        const hs = sanitizeHints(e.shapeHints, n);
        if (hs[i]) hs[i].pointIndex = Math.max(0, Math.min(n - 1, parseInt(idxIn.value, 10) || 0));
        e.shapeHints = hs;
      }));
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'icon-btn'; del.innerHTML = ICONS.close;
      del.title = 'Supprimer ce hint';
      del.addEventListener('click', () => mutateSelectedElement((e) => {
        e.shapeHints = sanitizeHints(e.shapeHints, n).filter((_, j) => j !== i);
      }));
      linkLabelToField(lab, idIn);
      r.append(lab, idIn, idxIn, del);
      body.appendChild(r);
    });

    const addRow = document.createElement('div');
    addRow.className = 'prop-row';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Ajouter un hint';
    addBtn.title = 'Pose un shape hint sur cette image clé (même id à poser sur l\'autre keyframe pour guider le morphing)';
    addBtn.addEventListener('click', () => mutateSelectedElement((e) => {
      const hs = sanitizeHints(e.shapeHints, n);
      hs.push({ id: nextHintId(hs), pointIndex: 0 });
      e.shapeHints = hs;
    }));
    addRow.appendChild(addBtn);
    body.appendChild(addRow);
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
    linkLabelToField(l, select);
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

  function renderBrushToolSection() {
    const group = document.createElement('div');
    group.className = 'prop-group';
    body.appendChild(group);
    
    const title = document.createElement('div');
    title.className = 'prop-group-title';
    title.textContent = 'Pinceau';
    group.appendChild(title);

    numberRow('Taille', state.brushSize, (v) => { state.brushSize = Math.max(1, Math.min(80, v)); notify(state); }, { step: 1, min: 1, max: 80 });
    
    enumRow('Motif', state.brushPattern, [
      ['round', 'Rond'],
      ['flat', 'Plat'],
      ['calligraphy', 'Calligraphie'],
      ['taper', 'Effilé'],
      ['pencil', 'Crayon'],
      ['marker', 'Marqueur'],
      ['airbrush', 'Aérographe'],
      ['drybrush', 'Pinceau sec'],
      ['chalk', 'Craie']
    ], (v) => { state.brushPattern = v; notify(state); });

    // Sensibilité à la pression du stylet (PointerEvent.pressure, tablettes)
    const prow = document.createElement('div');
    prow.className = 'prop-row';
    const pl = document.createElement('label');
    pl.textContent = 'Pression (stylet)';
    const pchk = document.createElement('input');
    pchk.type = 'checkbox';
    pchk.checked = !!state.brushPressure;
    pchk.addEventListener('change', () => { state.brushPressure = pchk.checked; notify(state); });
    linkLabelToField(pl, pchk);
    prow.append(pl, pchk);
    body.appendChild(prow);
    if (state.brushPressure) {
      numberRow('Sensibilité', state.brushPressureSens, (v) => { state.brushPressureSens = Math.max(0, Math.min(100, v)); notify(state); }, { step: 5, min: 0, max: 100 });
    }

    // Texture bitmap : mosaïque d'un asset image en remplissage du trait
    {
      const trow = document.createElement('div');
      trow.className = 'prop-row';
      const tl = document.createElement('label');
      tl.textContent = 'Texture';
      const sel = document.createElement('select');
      const noneOpt = document.createElement('option');
      noneOpt.value = ''; noneOpt.textContent = 'Aucune (couleur unie)';
      sel.appendChild(noneOpt);
      const assets = state.doc.assets || {};
      let nbImages = 0;
      for (const [id, a] of Object.entries(assets)) {
        if (a.kind && a.kind !== 'image') continue;
        nbImages++;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = a.name || ('Image ' + id.slice(-4));
        sel.appendChild(opt);
      }
      if (nbImages === 0) {
        const hint = document.createElement('option');
        hint.value = '';
        hint.textContent = '— importer une image d\'abord (Fichier > Importer image…) —';
        hint.disabled = true;
        hint.selected = true;
        sel.appendChild(hint);
      }
      sel.value = state.brushTextureAssetId || '';
      sel.title = 'Remplit les prochains traits de pinceau avec cette image en mosaïque (au lieu de la couleur unie). Importez d\'abord une image (menu Fichier > Importer image…).';
      sel.addEventListener('change', () => {
        state.brushTextureAssetId = sel.value || null;
        notify(state);
      });
      linkLabelToField(tl, sel);
      trow.append(tl, sel);
      body.appendChild(trow);
    }

    // Éclaboussures (spatter) autour du tracé
    const srow = document.createElement('div');
    srow.className = 'prop-row';
    const sl = document.createElement('label');
    sl.textContent = 'Éclaboussures';
    const schk = document.createElement('input');
    schk.type = 'checkbox';
    schk.checked = !!state.brushSpatter;
    schk.addEventListener('change', () => { state.brushSpatter = schk.checked; notify(state); });
    linkLabelToField(sl, schk);
    srow.append(sl, schk);
    body.appendChild(srow);
    if (state.brushSpatter) {
      numberRow('Intensité', state.brushSpatterIntensity != null ? state.brushSpatterIntensity : 40, (v) => { state.brushSpatterIntensity = Math.max(0, Math.min(100, v)); notify(state); }, { step: 5, min: 0, max: 100 });
    }
  }

  function render() {
    body.innerHTML = '';
    renderTweenSection();

    // Section pour les propriétés de l'outil (pas lié à un élément sélectionné)
    if (state.currentTool === 'brush') {
      renderBrushToolSection();
      return;
    }

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
    if (el.kind !== 'bone') {
      // Pivot de transformation (registration point à la Animate CC) : la
      // rotation se fait autour de ce point. Vide = centre/origine auto.
      const pivTitle = 'Point de rotation de l\'objet. Vide = centre automatique (origine du symbole pour une instance). (0,0) = coin haut-gauche de l\'objet ; pour une instance : coordonnées dans le symbole. Déplaçable aussi directement sur la scène avec l\'outil sélection.';
      const pivHas = el.pivotX != null && el.pivotY != null;
      pivotNumberRow('Pivot X', el.pivotX, pivHas, (v) => mutateSelectedElement((e) => setElementPivotField(e, v, null)), pivTitle);
      pivotNumberRow('Pivot Y', el.pivotY, pivHas, (v) => mutateSelectedElement((e) => setElementPivotField(e, null, v)), pivTitle);
      if (pivHas) {
        const row = document.createElement('div');
        row.className = 'prop-row';
        const btn = document.createElement('button');
        btn.textContent = 'Recentrer le pivot';
        btn.title = 'Retire le pivot explicite (retour au centre/origine automatique), sans bouger l\'objet.';
        btn.addEventListener('click', () => mutateSelectedElement((e) => resetElementPivot(e)));
        row.appendChild(btn);
        body.appendChild(row);
      }
    }
    numberRow('Échelle X', el.scaleX, (v) => mutateSelectedElement((e) => (e.scaleX = v)), { step: 0.1 });
    numberRow('Échelle Y', el.scaleY, (v) => mutateSelectedElement((e) => (e.scaleY = v)), { step: 0.1 });
    numberRow('Opacité', el.opacity, (v) => mutateSelectedElement((e) => (e.opacity = Math.max(0, Math.min(1, v)))), { step: 0.1 });

    if (el.kind === 'shape') {
      colorRow('Remplissage', el.fill, (v) => mutateSelectedElement((e) => (e.fill = v)));
      gradientSection(el); // dégradé de remplissage (propriétés uniquement)
      hintsSection(el); // shape hints de morphing (formes à points uniquement)
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
      
      // Bouton de simplification pour les formes avec des points (ligne, tracé)
      if ((el.shapeType === 'line' || el.shapeType === 'path') && el.points && el.points.length >= 2) {
        const simplifyRow = document.createElement('div');
        simplifyRow.className = 'prop-row';
        const btn = document.createElement('button');
        btn.textContent = 'Simplifier la forme';
        btn.title = 'Réduit le nombre de points tout en conservant la forme globale. Idéal pour optimiser les tracés complexes.';
        btn.addEventListener('click', () => {
          const simplified = simplifyShape(el, 1.0, el.closed, 0);
          if (simplified.points.length < el.points.length) {
            mutateSelectedElement((e) => {
              e.points = simplified.points;
            });
          } else {
            alert('Aucune simplification possible avec la tolérance actuelle. Essayez avec une tolérance plus élevée.');
          }
        });
        simplifyRow.appendChild(btn);
        body.appendChild(simplifyRow);
        
        // Champ de tolérance pour la simplification
        const tolRow = document.createElement('div');
        tolRow.className = 'prop-row';
        const tolLabel = document.createElement('label');
        tolLabel.textContent = 'Tolérance';
        const tolInput = document.createElement('input');
        tolInput.type = 'number';
        tolInput.step = '0.1';
        tolInput.min = '0.1';
        tolInput.value = '1.0';
        tolInput.title = 'Tolérance de simplification (plus élevée = moins de points conservés)';
        const tolBtn = document.createElement('button');
        tolBtn.textContent = 'Simplifier avec';
        tolBtn.title = 'Applique la simplification avec la tolérance spécifiée';
        tolBtn.addEventListener('click', () => {
          const tolerance = parseFloat(tolInput.value) || 1.0;
          const simplified = simplifyShape(el, tolerance, el.closed, 0);
          if (simplified.points.length < el.points.length) {
            mutateSelectedElement((e) => {
              e.points = simplified.points;
            });
          } else {
            alert(`Aucune simplification possible avec une tolérance de ${tolerance}. Essayez une valeur plus élevée.`);
          }
        });
        linkLabelToField(tolLabel, tolInput);
        tolRow.append(tolLabel, tolInput, tolBtn);
        body.appendChild(tolRow);
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
      if (layer.locked) return;
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
