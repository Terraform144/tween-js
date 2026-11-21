// Panneau palette de couleurs custom — remplace le nuancier natif
// <input type="color">, dont le champ hex « personnalisé » s'affiche en vertical
// caractère par caractère sur mobile (panneau système étroit). Ici : swatches
// organisés (classiques / clair-obscur / pantone), champ hex éditable en
// horizontal en dessous du panneau, et un accès explicite au nuancier système
// quand même (bouton « Nuancier système… »).
import { ICONS } from './icons.js';
import { TRANSPARENT } from '../core/model.js';

export const COLOR_GROUPS = [
  {
    name: 'Classiques',
    colors: [
      { n: 'Noir', c: '#000000' }, { n: 'Gris foncé', c: '#404040' }, { n: 'Gris', c: '#808080' }, { n: 'Gris clair', c: '#c0c0c0' }, { n: 'Blanc', c: '#ffffff' },
      { n: 'Rouge', c: '#ff0000' }, { n: 'Orange', c: '#ff8c00' }, { n: 'Jaune', c: '#ffd700' }, { n: 'Vert', c: '#008000' }, { n: 'Vert clair', c: '#32cd32' },
      { n: 'Bleu', c: '#0000ff' }, { n: 'Bleu roi', c: '#4169e1' }, { n: 'Violet', c: '#8a2be2' }, { n: 'Rose', c: '#ff69b4' }, { n: 'Marron', c: '#8b4513' },
    ],
  },
  {
    name: 'Clair-obscur (gris soulagés)',
    colors: [
      { n: 'Ivoire', c: '#f5f0e1' }, { n: 'Coquille', c: '#e9e2d9' }, { n: 'Gris perle', c: '#e8e6e3' }, { n: 'Beige', c: '#e6dcc8' }, { n: 'Poudre', c: '#dccfc0' }, { n: 'Grège', c: '#c9bfae' },
      { n: 'Gris chaud', c: '#d6cfc7' }, { n: 'Taupe', c: '#b8a99a' }, { n: 'Brun clair', c: '#a89a8c' }, { n: 'Ardoise clair', c: '#9aa5ad' }, { n: 'Gris bleuté', c: '#aeb8bf' }, { n: 'Gris froid', c: '#cfd4d8' },
    ],
  },
  {
    name: 'Pantone',
    colors: [
      { n: 'Living Coral', c: '#ff6f61' }, { n: 'Greenery', c: '#88b04b' }, { n: 'Ultra Violet', c: '#5f4b8b' }, { n: 'Radiant Orchid', c: '#b565a7' }, { n: 'Marsala', c: '#955251' }, { n: 'Serenity', c: '#91a8d0' },
      { n: 'Rose Quartz', c: '#f7cac9' }, { n: 'Classic Blue', c: '#0f4c81' }, { n: 'Emerald', c: '#009b77' }, { n: 'Ultimate Gray', c: '#939597' }, { n: 'Illuminating', c: '#f5df4d' }, { n: 'Very Peri', c: '#6667ab' },
    ],
  },
];

// Normalise une saisie hex : #abc -> #aabbcc, accepte sans '#'. Retourne null si invalide.
export function normalizeHex(v) {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map((ch) => ch + ch).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toLowerCase();
}

let openState = null; // { panel, anchorBtn, onDocClick, onKey }

export function closeColorPanel() {
  if (!openState) return;
  const { panel, onDocClick, onKey } = openState;
  document.removeEventListener('pointerdown', onDocClick, true);
  window.removeEventListener('keydown', onKey, true);
  panel.remove();
  openState = null;
}

export function openColorPanel(anchorBtn, input, opts = {}) {
  closeColorPanel();
  const allowTransparent = !!opts.allowTransparent;
  const onPick = opts.onPick || ((c) => {
    if (c !== TRANSPARENT) input.value = c;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const panel = document.createElement('div');
  panel.className = 'color-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Palette de couleurs');

  const current = (input.value || '').toLowerCase();

  for (const g of COLOR_GROUPS) {
    const lab = document.createElement('div');
    lab.className = 'cp-group-label';
    lab.textContent = g.name;
    panel.appendChild(lab);
    const grid = document.createElement('div');
    grid.className = 'cp-grid';
    for (const col of g.colors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cp-swatch';
      b.style.background = col.c;
      b.title = `${col.n} — ${col.c}`;
      b.dataset.color = col.c;
      if (col.c === current) b.classList.add('current');
      b.addEventListener('click', () => { pick(col.c); });
      grid.appendChild(b);
    }
    panel.appendChild(grid);
  }

  // Ligne du bas : hex éditable + nuancier système + (∅ transparent)
  const row = document.createElement('div');
  row.className = 'cp-actions';
  const hex = document.createElement('input');
  hex.type = 'text';
  hex.className = 'cp-hex';
  hex.value = current || '#000000';
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.title = 'Code hex (#rrggbb)';
  hex.setAttribute('aria-label', 'Code hexadécimal');
  const applyHex = () => {
    const c = normalizeHex(hex.value);
    if (c) pick(c);
    else hex.classList.add('invalid');
  };
  hex.addEventListener('change', applyHex);
  hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } e.stopPropagation(); });
  row.appendChild(hex);

  const sysBtn = document.createElement('button');
  sysBtn.type = 'button';
  sysBtn.className = 'cp-sys-btn';
  sysBtn.textContent = 'Nuancier système…';
  sysBtn.title = 'Ouvrir le sélecteur de couleur natif du navigateur';
  sysBtn.addEventListener('click', () => {
    try {
      // L'input est readOnly (pour bloquer le panneau natif au clic) : on lève
      // temporairement le readOnly, le temps du showPicker.
      input.readOnly = false;
      if (input.showPicker) input.showPicker();
    } catch (_) { /* certains contextes bloquent showPicker */ }
    finally { input.readOnly = true; }
  });
  row.appendChild(sysBtn);

  if (allowTransparent) {
    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'icon-btn no-color-btn';
    noBtn.innerHTML = ICONS.noColor;
    noBtn.title = 'Transparent';
    if (opts.isTransparent) noBtn.classList.add('active');
    noBtn.addEventListener('click', () => pick(TRANSPARENT));
    row.appendChild(noBtn);
  }
  panel.appendChild(row);

  function pick(c) {
    if (c !== TRANSPARENT) input.value = c;
    closeColorPanel();
    onPick(c);
  }

  document.body.appendChild(panel);

  // Positionnement : près du bouton, ramené dans le viewport ; centré sur petit écran
  const r = anchorBtn.getBoundingClientRect();
  panel.style.visibility = 'hidden';
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  let left, top;
  if (window.innerWidth < 640) {
    left = Math.max(8, (window.innerWidth - pw) / 2);
    top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - ph - 8));
  } else {
    left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8));
    top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  }
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.visibility = '';

  const onDocClick = (e) => {
    if (panel.contains(e.target) || anchorBtn.contains(e.target)) return;
    closeColorPanel();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeColorPanel(); } };
  // Léger différé pour ne pas fermer le panneau sur le clic qui l'a ouvert
  setTimeout(() => {
    document.addEventListener('pointerdown', onDocClick, true);
    window.addEventListener('keydown', onKey, true);
  }, 0);

  openState = { panel, anchorBtn, onDocClick, onKey };
  return panel;
}

// Insère un petit bouton « palette » juste après l'input color donné, dans le
// conteneur `host`. Le clic ouvre le panneau ; la sélection propage la couleur
// via opts.onPick (ou via input.value + événements input/change par défaut).
export function attachColorPalette(host, input, opts = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn palette-btn';
  btn.innerHTML = ICONS.palette;
  btn.title = 'Palette de couleurs (classiques, clair-obscur, pantone) + code hex horizontal en dessous';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openState && openState.anchorBtn === btn) { closeColorPanel(); return; }
    openColorPanel(btn, input, opts);
  });
  // Le clic sur la case couleur ouvre NOTRE panneau (champ hex « personnalisé »
  // en horizontal, en dessous) au lieu du panneau système natif dont le champ
  // hex s'affiche en vertical caractère par caractère sur mobile.
  input.readOnly = true;
  input.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (openState && openState.anchorBtn === btn) { closeColorPanel(); return; }
    openColorPanel(btn, input, opts);
  });
  host.insertBefore(btn, input.nextSibling);
  return btn;
}
