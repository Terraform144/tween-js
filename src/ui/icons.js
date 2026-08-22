// Jeu d'icônes au trait partagé par toute l'interface : même grammaire pour
// toutes (contour "currentColor", épaisseur 1.7, extrémités arrondies) —
// currentColor fait qu'elles suivent automatiquement la couleur du texte du
// bouton qui les contient (état normal / survol / actif) sans code JS
// supplémentaire, juste via le CSS existant (.active, :hover, etc.).
const STROKE = 1.7;

function svg(inner) {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export const ICONS = {
  select: svg('<path d="M6 3.5 6 18.5 9.7 15.3 12.3 20.7 14.7 19.5 12.1 14.2 17.5 13.8 Z" fill="currentColor" fill-opacity="0.14"/>'),
  subselect: svg('<path d="M5 17C7 9,13 15,18 6" stroke-dasharray="0.1 4"/><circle cx="5" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="1.6"/><circle cx="12.4" cy="10.4" r="1.2"/>'),
  rect: svg('<rect x="4.5" y="6.5" width="15" height="11" rx="1"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="8.5" ry="6"/>'),
  line: svg('<line x1="5.5" y1="18.5" x2="18.5" y2="5.5"/><circle cx="5.5" cy="18.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="5.5" r="1.3" fill="currentColor" stroke="none"/>'),
  pen: svg('<path d="M13 3 19 9 9 21 4.5 19.5 6 15 Z"/><circle cx="19" cy="9" r="1.2" fill="currentColor" stroke="none"/>'),
  text: svg('<path d="M6 6.5H18M12 6.5V19M9 19H15"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  trash: svg('<rect x="6" y="7" width="12" height="13" rx="1.5"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M10 11v6M14 11v6"/>'),
  tween: svg('<path d="M3 12h6M9 12 6.5 9.5M9 12 6.5 14.5"/><path d="M21 12h-6M15 12l2.5-2.5M15 12l2.5 2.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  check: svg('<path d="M5 12.5 10 17.5 19 7"/>'),
  play: svg('<path d="M8 5l11 7-11 7Z" fill="currentColor" stroke="none"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>'),
  chevronDown: svg('<path d="M6 9l6 6 6-6"/>'),
  chevronRight: svg('<path d="M9 6l6 6-6 6"/>'),
  chevronLeft: svg('<path d="M15 6l-6 6 6 6"/>'),
  tag: svg('<path d="M11 3H6a2 2 0 0 0-2 2v5l10.5 10.5a1 1 0 0 0 1.4 0l5.1-5.1a1 1 0 0 0 0-1.4L11 3Z"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>'),
  eye: svg('<path d="M2.5 12S6.5 5.5 12 5.5 21.5 12 21.5 12 17.5 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.6c.45-.07.9-.1 1.4-.1 5.5 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.6M6.4 6.7A16.9 16.9 0 0 0 2.5 12S6.5 18.5 12 18.5c1.3 0 2.5-.25 3.6-.7"/><path d="M9.4 9.9a2.6 2.6 0 0 0 3.6 3.6"/>'),
  lockClosed: svg('<rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  lockOpen: svg('<rect x="5.5" y="10.5" width="13" height="9" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-2.2"/>'),
  pencil: svg('<path d="M4 20l.9-4L15.4 5.5a1.4 1.4 0 0 1 2 0l1.1 1.1a1.4 1.4 0 0 1 0 2L8 19l-4 1Z"/><path d="M13.8 7.1l3.1 3.1"/>'),
  export: svg('<path d="M12 4v11"/><path d="M8 8.4 12 4l4 4.4"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>'),
  undo: svg('<path d="M7 8H16a5 5 0 0 1 0 10h-3"/><path d="M7 8l4-4M7 8l4 4"/>'),
  redo: svg('<path d="M17 8H8a5 5 0 0 0 0 10h3"/><path d="M17 8l-4-4M17 8l-4 4"/>'),
  movieclip: svg('<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M9.5 9l6 3.5-6 3.5Z" fill="currentColor" stroke="none"/>'),
  graphic: svg('<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 16 8.5 10 12.5 14l2.3-2.3 5.2 5.2"/><circle cx="9" cy="8.5" r="1.2" fill="currentColor" stroke="none"/>'),
  newDoc: svg('<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4"/>'),
  folderOpen: svg('<path d="M3.5 8V6a1.5 1.5 0 0 1 1.5-1.5h4l2 2H19A1.5 1.5 0 0 1 20.5 8"/><path d="M3.5 8h16.7a1 1 0 0 1 1 1.2l-1.6 8A1.5 1.5 0 0 1 18.1 18.5H5.4a1.5 1.5 0 0 1-1.47-1.2l-1.6-8A1 1 0 0 1 3.3 8Z"/>'),
  importSvg: svg('<path d="M3 17l4-4 4 4 4-4"/><path d="M17 13V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v7"/><path d="M8 17l4-4-4-4"/>'),
  importImage: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4.5 16.5 9 12l3.2 3.2L15.5 12l4 4.5"/>'),
  save: svg('<path d="M5 4.5h11L20 8.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"/><path d="M8 4.5V10h7V4.5"/><path d="M8 14h8v6H8Z"/>'),
  exportHtml: svg('<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/><path d="M8.5 8.2 6.3 10.4l2.2 2.2M15.5 8.2l2.2 2.2-2.2 2.2M13 7.5l-2 9"/>'),
  fullscreen: svg('<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 9V5a1 1 0 0 0-1-1h-4"/><path d="M4 15v4a1 1 0 0 0 1 1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/>'),
  exitFullscreen: svg('<path d="M9 4v4a1 1 0 0 1-1 1H4"/><path d="M15 4v4a1 1 0 0 0 1 1h4"/><path d="M9 20v-4a1 1 0 0 0-1-1H4"/><path d="M15 20v-4a1 1 0 0 1 1-1h4"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none"/>'),
  book: svg('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 1 4 15.5Z"/><path d="M4 18h16"/><path d="M10 2v16"/>'),
  search: svg('<circle cx="12" cy="12" r="5.5"/><path d="M16.2 16.2L20.5 20.5"/>'),
  zoomIn: svg('<circle cx="12" cy="12" r="5"/><path d="M16.3 16.3L20 20"/><path d="M12 9v6M9 12h6"/>'),
  zoomOut: svg('<circle cx="12" cy="12" r="5"/><path d="M16.3 16.3L20 20"/><path d="M9 12h6"/>'),
  hand: svg('<path d="M18 12V8a2 2 0 0 0-4 0v3M14 11V6a2 2 0 0 0-4 0v6M10 11V7a2 2 0 0 0-4 0v7c0 4 3 6 6 6h1a4 4 0 0 0 4-4v-3a2 2 0 0 0-4 0"/>'),
};

// Injecte l'icône dans un bouton/élément existant, avant tout texte déjà
// présent (les boutons peuvent combiner icône + libellé, ex. undo/redo).
export function setIcon(el, name) {
  el.innerHTML = ICONS[name] || '';
}
