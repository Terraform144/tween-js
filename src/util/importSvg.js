// Utilitaire pour importer des fichiers SVG et les convertir en éléments
// TweenJS (rect, ellipse, line, path, text).
//
// Limitations :
// - Ne gère pas les groupes imbriqués (seul le contenu direct de <svg> est importé)
// - Ne gère pas les transformations complexes (seulement x, y, width, height de base)
// - Les paths complexes sont importés comme des tracés fermés ou ouverts
// - Les styles inline sont partiellement supportés (fill, stroke, stroke-width)

import { createShape, createPathPoint } from '../core/model.js';

/**
 * Parse un fichier SVG et retourne une liste d'éléments TweenJS.
 * @param {string} svgText - Le contenu textuel du fichier SVG
 * @param {Object} options - Options d'import
 * @param {number} options.x - Position x de départ (défaut: 0)
 * @param {number} options.y - Position y de départ (défaut: 0)
 * @returns {Array} Tableau d'éléments au format TweenJS
 */
export function parseSvg(svgText, { x = 0, y = 0 } = {}) {
  const elements = [];
  
  // Créer un DOM temporaire pour parser le SVG
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  
  // Vérifier les erreurs de parsing
  const parserErrors = doc.querySelector('parsererror');
  if (parserErrors) {
    throw new Error('Fichier SVG invalide : ' + parserErrors.textContent.trim());
  }
  
  // Récupérer le root SVG
  const svgRoot = doc.querySelector('svg');
  if (!svgRoot) {
    throw new Error('Aucun élément <svg> trouvé dans le fichier');
  }
  
  // Extraire les attributs de style par défaut du SVG root
  const defaultStyles = parseStyles(svgRoot);
  
  // Parser tous les enfants directs de <svg> qui sont des éléments graphiques
  const children = Array.from(svgRoot.children);
  for (const child of children) {
    // Ignorer les éléments non-graphiques
    if (child.tagName === 'defs' || child.tagName === 'style' || child.tagName === 'script') continue;
    
    const element = parseSvgElement(child, { x, y, defaultStyles });
    if (element) {
      // Gérer le cas où parseSvgElement retourne un tableau (groupe)
      if (Array.isArray(element)) {
        elements.push(...element);
      } else {
        elements.push(element);
      }
    }
  }
  
  return elements;
}

/**
 * Parse un élément SVG unique et le convertit en élément TweenJS.
 */
function parseSvgElement(node, { x: offsetX, y: offsetY, defaultStyles }) {
  const tagName = node.tagName.toLowerCase();
  const styles = { ...defaultStyles, ...parseStyles(node) };
  
  // Calculer la position finale (offset + position de l'élément)
  const elementX = offsetX + (parseFloat(node.getAttribute('x') || '0') || 0);
  const elementY = offsetY + (parseFloat(node.getAttribute('y') || '0') || 0);
  
  // Gérer le groupe : parser récursivement les enfants
  if (tagName === 'g') {
    const groupX = elementX;
    const groupY = elementY;
    const groupElements = [];
    
    for (const child of node.children) {
      const childElement = parseSvgElement(child, { 
        x: groupX, 
        y: groupY, 
        defaultStyles: { ...defaultStyles, ...parseStyles(node) }
      });
      if (childElement) {
        // Gérer les sous-groupes (qui retournent des tableaux)
        if (Array.isArray(childElement)) {
          groupElements.push(...childElement);
        } else {
          groupElements.push(childElement);
        }
      }
    }
    
    // Retourner les éléments du groupe (pas de groupe en tant que tel dans TweenJS)
    return groupElements;
  }
  
  // Mapper les éléments SVG vers les types TweenJS
  switch (tagName) {
    case 'rect':
      return parseRect(node, { x: elementX, y: elementY, styles });
    
    case 'circle':
    case 'ellipse':
      return parseEllipse(node, { x: elementX, y: elementY, styles });
    
    case 'line':
      return parseLine(node, { x: elementX, y: elementY, styles });
    
    case 'path':
      return parsePath(node, { x: elementX, y: elementY, styles });
    
    case 'text':
      return parseText(node, { x: elementX, y: elementY, styles });
    
    case 'polygon':
    case 'polyline':
      return parsePolygon(node, { x: elementX, y: elementY, styles, closed: tagName === 'polygon' });
    
    default:
      // Éléments non supportés : ignorer
      console.warn(`Élément SVG non supporté : <${tagName}>`);
      return null;
  }
}

/**
 * Parse les styles CSS inline ou les attributs de style d'un nœud SVG.
 */
function parseStyles(node) {
  const styles = {};
  
  // Attributs directs (fill, stroke, stroke-width, etc.)
  const directAttrs = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family'];
  for (const attr of directAttrs) {
    const value = node.getAttribute(attr);
    if (value !== null) {
      // Normaliser le nom (stroke-width -> strokeWidth)
      const camelName = attr.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      styles[camelName] = value;
    }
  }
  
  // Attribut style
  const styleAttr = node.getAttribute('style');
  if (styleAttr) {
    const declarations = styleAttr.split(';');
    for (const decl of declarations) {
      const [prop, value] = decl.split(':').map(s => s.trim());
      if (prop && value) {
        const camelName = prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        styles[camelName] = value;
      }
    }
  }
  
  return styles;
}

/**
 * Convertir une couleur hex 3 ou 6 chiffres en format complet #RRGGBB
 */
function normalizeColor(color) {
  if (!color) return '#000000';
  
  // Déjà au bon format
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  
  // Format court (#RGB)
  if (/^#[0-9A-Fa-f]{3}$/.test(color)) {
    const r = color[1] + color[1];
    const g = color[2] + color[2];
    const b = color[3] + color[3];
    return `#${r}${g}${b}`;
  }
  
  // Noms de couleur (simplifié : retourner tel quel, le navigateur gérera)
  return color;
}

/**
 * Parse un élément <rect>
 */
function parseRect(node, { x, y, styles }) {
  const width = parseFloat(node.getAttribute('width') || '100');
  const height = parseFloat(node.getAttribute('height') || '100');
  const rx = parseFloat(node.getAttribute('rx') || '0');
  const ry = parseFloat(node.getAttribute('ry') || '0');
  
  // Si rx ou ry > 0, c'est un rectangle arrondi, qu'on import comme ellipse
  if (rx > 0 || ry > 0) {
    return createShape('ellipse', {
      x: x + width / 2,
      y: y + height / 2,
      width,
      height,
      fill: normalizeColor(styles.fill || '#cb4b16'),
      stroke: normalizeColor(styles.stroke || '#073642'),
      strokeWidth: parseFloat(styles.strokeWidth || '2') || 0,
    });
  }
  
  return createShape('rect', {
    x: x + width / 2,
    y: y + height / 2,
    width,
    height,
    fill: normalizeColor(styles.fill || '#cb4b16'),
    stroke: normalizeColor(styles.stroke || '#073642'),
    strokeWidth: parseFloat(styles.strokeWidth || '2') || 0,
  });
}

/**
 * Parse un élément <circle> ou <ellipse>
 */
function parseEllipse(node, { x, y, styles }) {
  const tagName = node.tagName.toLowerCase();
  
  let cx, cy, rx, ry;
  
  if (tagName === 'circle') {
    cx = parseFloat(node.getAttribute('cx') || '0');
    cy = parseFloat(node.getAttribute('cy') || '0');
    const r = parseFloat(node.getAttribute('r') || '50');
    rx = r;
    ry = r;
  } else {
    cx = parseFloat(node.getAttribute('cx') || '0');
    cy = parseFloat(node.getAttribute('cy') || '0');
    rx = parseFloat(node.getAttribute('rx') || '50');
    ry = parseFloat(node.getAttribute('ry') || '50');
  }
  
  // Convertir cx/cy + rx/ry en x/y + width/height
  return createShape('ellipse', {
    x: x + cx,
    y: y + cy,
    width: rx * 2,
    height: ry * 2,
    fill: normalizeColor(styles.fill || '#cb4b16'),
    stroke: normalizeColor(styles.stroke || '#073642'),
    strokeWidth: parseFloat(styles.strokeWidth || '2') || 0,
  });
}

/**
 * Parse un élément <line>
 */
function parseLine(node, { x, y, styles }) {
  const x1 = parseFloat(node.getAttribute('x1') || '0');
  const y1 = parseFloat(node.getAttribute('y1') || '0');
  const x2 = parseFloat(node.getAttribute('x2') || '100');
  const y2 = parseFloat(node.getAttribute('y2') || '0');
  
  // Créer deux points pour la ligne
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  return createShape('line', {
    x: x + x1,
    y: y + y1,
    points: [
      createPathPoint(0, 0),
      createPathPoint(dx, dy),
    ],
    width: Math.abs(dx),
    height: Math.abs(dy),
    fill: 'none',
    stroke: normalizeColor(styles.stroke || '#073642'),
    strokeWidth: parseFloat(styles.strokeWidth || '2') || 0,
  });
}

/**
 * Parse un élément <path>
 */
function parsePath(node, { x, y, styles }) {
  const d = node.getAttribute('d');
  if (!d) return null;
  
  // Parser les commandes du path
  const commands = parsePathData(d);
  
  if (commands.length === 0) return null;
  
  // Calculer le bounding box pour positionner le path
  const bounds = calculatePathBounds(commands);
  
  // Convertir les points en points relatifs au centre du path
  const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
  const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2;
  
  const points = commands.map(cmd => {
    return createPathPoint(cmd.x - centerX, cmd.y - centerY);
  });
  
  // Déterminer si le path est fermé
  const closed = commands.length > 1 && 
    Math.abs(commands[0].x - commands[commands.length - 1].x) < 0.001 &&
    Math.abs(commands[0].y - commands[commands.length - 1].y) < 0.001;
  
  return createShape('path', {
    x: x + centerX,
    y: y + centerY,
    points,
    closed,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    fill: closed ? normalizeColor(styles.fill || '#cb4b16') : 'none',
    stroke: normalizeColor(styles.stroke || '#073642'),
    strokeWidth: parseFloat(styles.strokeWidth || '2') || 0,
  });
}

/**
 * Parse un élément <text>
 */
function parseText(node, { x, y, styles }) {
  const textContent = node.textContent.trim();
  if (!textContent) return null;
  
  // Position du texte
  const textX = parseFloat(node.getAttribute('x') || '0');
  const textY = parseFloat(node.getAttribute('y') || '0');
  
  // Calculer la largeur approximative (simplifié)
  const fontSize = parseFloat(styles.fontSize || '24') || 24;
  const width = textContent.length * fontSize * 0.6;
  const height = fontSize * 1.2;
  
  return createShape('text', {
    x: x + textX,
    y: y + textY,
    width,
    height,
    text: textContent,
    fill: normalizeColor(styles.fill || '#073642'),
    stroke: 'none',
    strokeWidth: 0,
    fontSize,
    fontFamily: styles.fontFamily || 'Arial',
  });
}

/**
 * Parse un élément <polygon> ou <polyline>
 */
function parsePolygon(node, { x, y, styles, closed }) {
  const pointsAttr = node.getAttribute('points');
  if (!pointsAttr) return null;
  
  // Parser les points "x1,y1 x2,y2 x3,y3"
  const pointPairs = pointsAttr.trim().split(/[\s,]+/);
  const points = [];
  
  for (let i = 0; i < pointPairs.length; i += 2) {
    if (i + 1 >= pointPairs.length) break;
    const px = parseFloat(pointPairs[i]);
    const py = parseFloat(pointPairs[i + 1]);
    if (!isNaN(px) && !isNaN(py)) {
      points.push({ x: px, y: py });
    }
  }
  
  if (points.length < 2) return null;
  
  // Calculer le centre
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  // Convertir en points relatifs
  const pathPoints = points.map(p => {
    return createPathPoint(p.x - centerX, p.y - centerY);
  });
  
  return createShape('path', {
    x: x + centerX,
    y: y + centerY,
    points: pathPoints,
    closed,
    width: maxX - minX,
    height: maxY - minY,
    fill: closed ? normalizeColor(styles.fill || '#cb4b16') : 'none',
    stroke: normalizeColor(styles.stroke || '#073642'),
    strokeWidth: parseFloat(styles.strokeWidth || '2') || 0,
  });
}

/**
 * Parse les données d'un path SVG (attribut d)
 * Simplifié : ne gère que M, L, C, Q, Z (move, line, cubic bezier, quadratic bezier, close)
 */
function parsePathData(d) {
  const commands = [];
  let currentX = 0, currentY = 0;
  let startX = 0, startY = 0;
  
  // Regex pour matcher les commandes et leurs paramètres
  // Format: [MmLlHhVvCcSsQqTtAaZz] [nombres]
  const commandRegex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  
  let match;
  while ((match = commandRegex.exec(d)) !== null) {
    const cmd = match[1];
    const paramsStr = match[2].trim();
    
    // Parser les nombres
    const params = parseNumbers(paramsStr);
    
    switch (cmd) {
      case 'M': // Move to (absolu)
      case 'm': { // Move to (relatif)
        const x = cmd === 'M' ? params[0] : currentX + params[0];
        const y = cmd === 'M' ? params[1] : currentY + params[1];
        currentX = x;
        currentY = y;
        startX = x;
        startY = y;
        commands.push({ type: 'M', x, y, isRelative: cmd === 'm' });
        
        // Si plus de 2 paramètres, c'est une ligne implicite
        for (let i = 2; i < params.length; i += 2) {
          const lx = cmd === 'M' ? params[i] : currentX + params[i];
          const ly = cmd === 'M' ? params[i + 1] : currentY + params[i + 1];
          currentX = lx;
          currentY = ly;
          commands.push({ type: 'L', x: lx, y: ly, isRelative: cmd === 'm' });
        }
        break;
      }
      
      case 'L': // Line to (absolu)
      case 'l': { // Line to (relatif)
        for (let i = 0; i < params.length; i += 2) {
          const x = cmd === 'L' ? params[i] : currentX + params[i];
          const y = cmd === 'L' ? params[i + 1] : currentY + params[i + 1];
          currentX = x;
          currentY = y;
          commands.push({ type: 'L', x, y, isRelative: cmd === 'l' });
        }
        break;
      }
      
      case 'H': // Horizontal line (absolu)
      case 'h': { // Horizontal line (relatif)
        for (let i = 0; i < params.length; i++) {
          const x = cmd === 'H' ? params[i] : currentX + params[i];
          currentX = x;
          commands.push({ type: 'L', x, y: currentY });
        }
        break;
      }
      
      case 'V': // Vertical line (absolu)
      case 'v': { // Vertical line (relatif)
        for (let i = 0; i < params.length; i++) {
          const y = cmd === 'V' ? params[i] : currentY + params[i];
          currentY = y;
          commands.push({ type: 'L', x: currentX, y });
        }
        break;
      }
      
      case 'C': // Cubic bezier (absolu)
      case 'c': { // Cubic bezier (relatif)
        for (let i = 0; i < params.length; i += 6) {
          const isRel = cmd === 'c';
          const x1 = isRel ? currentX + params[i] : params[i];
          const y1 = isRel ? currentY + params[i + 1] : params[i + 1];
          const x2 = isRel ? currentX + params[i + 2] : params[i + 2];
          const y2 = isRel ? currentY + params[i + 3] : params[i + 3];
          const x = isRel ? currentX + params[i + 4] : params[i + 4];
          const y = isRel ? currentY + params[i + 5] : params[i + 5];
          
          currentX = x;
          currentY = y;
          
          // Pour TweenJS, on approxime la courbe de Bézier par des segments de ligne
          // ou on stocke les points de contrôle dans les path points
          // Ici, on va créer un point avec cIn et cOut
          const lastCmd = commands[commands.length - 1];
          const lastX = lastCmd ? lastCmd.x : currentX;
          const lastY = lastCmd ? lastCmd.y : currentY;
          
          // Ajouter le point avec poignées
          commands.push({ 
            type: 'C', 
            x, 
            y,
            cIn: { x: x2 - x, y: y2 - y },
            cOut: { x: x1 - lastX, y: y1 - lastY }
          });
        }
        break;
      }
      
      case 'Z': // Close path
      case 'z':
        currentX = startX;
        currentY = startY;
        commands.push({ type: 'Z', x: startX, y: startY });
        break;
        
      // Cas non gérés : S, Q, T, A (simplifiés en lignes pour l'instant)
      default:
        // Pour simplifier, on ignore les courbes complexes
        console.warn(`Commande path SVG non gérée : ${cmd}`);
        break;
    }
  }
  
  // Filtrer pour ne garder que les points finaux (M, L, C, Z)
  const finalCommands = [];
  for (const cmd of commands) {
    if (cmd.type === 'M' || cmd.type === 'L' || cmd.type === 'C' || cmd.type === 'Z') {
      finalCommands.push(cmd);
    }
  }
  
  // Convertir en points simples avec poignées
  const points = [];
  for (let i = 0; i < finalCommands.length; i++) {
    const cmd = finalCommands[i];
    const point = { x: cmd.x, y: cmd.y };
    
    // Ajouter les poignées si disponible
    if (cmd.cIn) {
      point.cIn = cmd.cIn;
    }
    if (cmd.cOut) {
      point.cOut = cmd.cOut;
    }
    
    points.push(point);
  }
  
  return points;
}

/**
 * Calcule le bounding box d'un tableau de points
 */
function calculatePathBounds(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    
    if (p.cIn) {
      minX = Math.min(minX, p.x + p.cIn.x);
      maxX = Math.max(maxX, p.x + p.cIn.x);
      minY = Math.min(minY, p.y + p.cIn.y);
      maxY = Math.max(maxY, p.y + p.cIn.y);
    }
    if (p.cOut) {
      minX = Math.min(minX, p.x + p.cOut.x);
      maxX = Math.max(maxX, p.x + p.cOut.x);
      minY = Math.min(minY, p.y + p.cOut.y);
      maxY = Math.max(maxY, p.y + p.cOut.y);
    }
  }
  
  return { minX, maxX, minY, maxY };
}

/**
 * Parse une chaîne de nombres séparés par des virgules ou espaces
 */
function parseNumbers(str) {
  return str.split(/[,\s]+/).filter(s => s !== '').map(parseFloat).filter(n => !isNaN(n));
}

/**
 * Import un fichier SVG via un input file
 * @param {HTMLElement} container - Le conteneur pour l'input file caché
 * @param {Function} onImport - Callback appelé avec les éléments importés
 * @returns {Function} Fonction pour déclencher l'import manuellement
 */
export function createSvgImporter(container, onImport) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.svg,image/svg+xml';
  fileInput.style.display = 'none';
  container.appendChild(fileInput);
  
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const elements = parseSvg(text);
      onImport(elements);
    } catch (err) {
      alert('Erreur lors de l\'import SVG : ' + err.message);
    } finally {
      fileInput.value = '';
    }
  });
  
  return () => fileInput.click();
}
