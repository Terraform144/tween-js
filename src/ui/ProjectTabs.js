// Bandeau de fenêtres-projets : un onglet par projet ouvert, juste sous la
// barre de menu. L'onglet actif (fenêtre affichée en plein cadre) est mis en
// évidence ; les autres sont des fenêtres réduites. Bouton « + » pour ouvrir
// un nouveau projet vierge. Le composant est purement présentationnel : il
// reçoit des données descriptives et rend des callbacks d'intention.

import { ICONS } from './icons.js';

export function mountProjectTabs(container, { onActivate, onClose, onNew }) {
  container.innerHTML = '';
  const strip = document.createElement('div');
  strip.className = 'project-tabs-strip';
  container.appendChild(strip);

  const plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.className = 'project-tab-new';
  plusBtn.title = 'Nouveau projet (nouvelle fenêtre)';
  plusBtn.innerHTML = ICONS.plus + '<span>New</span>';
  plusBtn.addEventListener('click', () => onNew());
  container.appendChild(plusBtn);

  // tabs : [{ id, name, active, minimized }] ; opts.canNew = false quand le
  // nombre maximum de fenêtres est atteint (bouton + grisé/inactif).
  function update(tabs, { canNew = true } = {}) {
    plusBtn.disabled = !canNew;
    plusBtn.classList.toggle('disabled', !canNew);
    strip.innerHTML = '';
    for (const t of tabs) {
      const tab = document.createElement('div');
      tab.className = 'project-tab' + (t.active ? ' active' : '') + (t.minimized ? ' minimized' : '');
      // Pas de nom affiché (onglets compacts) : il reste en info-bulle.
      tab.title = (t.active ? 'Réduire' : 'Afficher') + ' « ' + (t.name || 'Sans titre') + ' »';
      tab.addEventListener('click', () => onActivate(t.id));

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'project-tab-close';
      close.title = 'Fermer ce projet';
      close.innerHTML = ICONS.close;
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        onClose(t.id);
      });
      tab.appendChild(close);

      strip.appendChild(tab);
    }
  }

  return { update };
}
