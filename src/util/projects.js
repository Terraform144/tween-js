// Gestion des projets sauvegardés dans localStorage
// Permet d'enregistrer, charger, lister et supprimer des projets TweenJS

const PROJECTS_KEY = 'tweenjs:projects';

/**
 * Structure d'un projet sauvegardé :
 * { id: string, name: string, data: string (JSON), timestamp: number }
 */

/**
 * Récupère la liste de tous les projets sauvegardés
 * @returns {Array} Tableau d'objets projet
 */
export function getAllProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Sauvegarde un projet dans localStorage
 * @param {Object} doc - Document à sauvegarder
 * @param {string} name - Nom du projet (optionnel, utilise doc.name si non fourni)
 * @returns {Object} Le projet sauvegardé (avec id, name, data, timestamp)
 */
export function saveProject(doc, name = null) {
  const projects = getAllProjects();
  const projectName = name || doc.name || 'Sans titre';
  const timestamp = Date.now();
  
  // Créer ou mettre à jour le projet
  const existingIndex = projects.findIndex(p => p.name === projectName);
  const projectData = {
    id: existingIndex >= 0 ? projects[existingIndex].id : generateId(),
    name: projectName,
    data: JSON.stringify(doc),
    timestamp
  };
  
  if (existingIndex >= 0) {
    projects[existingIndex] = projectData;
  } else {
    projects.push(projectData);
  }
  
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error('Erreur lors de la sauvegarde du projet :', e);
    // Si localStorage est plein, essayer de nettoyer les anciens projets
    if (e.name === 'QuotaExceededError') {
      cleanupOldProjects(projects);
      try {
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      } catch (e2) {
        console.error('Impossible de sauvegarder même après nettoyage :', e2);
        throw new Error('Stockage local plein. Veuillez supprimer certains projets.');
      }
    } else {
      throw e;
    }
  }
  
  return projectData;
}

/**
 * Charge un projet depuis localStorage
 * @param {string} projectId - ID du projet à charger
 * @returns {Object|null} Le document chargé ou null si non trouvé
 */
export function loadProject(projectId) {
  const projects = getAllProjects();
  const project = projects.find(p => p.id === projectId);
  
  if (!project) {
    console.warn(`Projet non trouvé : ${projectId}`);
    return null;
  }
  
  try {
    return JSON.parse(project.data);
  } catch (e) {
    console.error(`Erreur lors du chargement du projet ${projectId} :`, e);
    return null;
  }
}

/**
 * Charge un projet par son nom
 * @param {string} projectName - Nom du projet à charger
 * @returns {Object|null} Le document chargé ou null si non trouvé
 */
export function loadProjectByName(projectName) {
  const projects = getAllProjects();
  const project = projects.find(p => p.name === projectName);
  
  if (!project) {
    console.warn(`Projet non trouvé : ${projectName}`);
    return null;
  }
  
  return loadProject(project.id);
}

/**
 * Supprime un projet de localStorage
 * @param {string} projectId - ID du projet à supprimer
 * @returns {boolean} true si supprimé, false si non trouvé
 */
export function deleteProject(projectId) {
  const projects = getAllProjects();
  const index = projects.findIndex(p => p.id === projectId);
  
  if (index === -1) {
    return false;
  }
  
  projects.splice(index, 1);
  
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch (e) {
    console.error('Erreur lors de la suppression du projet :', e);
    return false;
  }
}

/**
 * Supprime tous les projets
 * @returns {boolean} true si réussie
 */
export function deleteAllProjects() {
  try {
    localStorage.removeItem(PROJECTS_KEY);
    return true;
  } catch (e) {
    console.error('Erreur lors de la suppression de tous les projets :', e);
    return false;
  }
}

/**
 * Nettoie les projets anciens (plus de 30 jours) pour libérer de l'espace
 * @param {Array} projects - Tableau de projets à nettoyer (optionnel, sinon charge depuis localStorage)
 */
export function cleanupOldProjects(projects = null) {
  const allProjects = projects || getAllProjects();
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const filteredProjects = allProjects.filter(p => p.timestamp > thirtyDaysAgo);
  
  if (filteredProjects.length < allProjects.length) {
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(filteredProjects));
    } catch (e) {
      console.error('Erreur lors du nettoyage des projets :', e);
    }
  }
}

/**
 * Génère un ID unique pour un projet
 * @returns {string} ID unique
 */
function generateId() {
  return 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Met à jour le nom d'un projet
 * @param {string} projectId - ID du projet à renommer
 * @param {string} newName - Nouveau nom
 * @returns {boolean} true si réussie
 */
export function renameProject(projectId, newName) {
  const projects = getAllProjects();
  const index = projects.findIndex(p => p.id === projectId);
  
  if (index === -1) {
    return false;
  }
  
  // Vérifier qu'un projet avec ce nom n'existe pas déjà
  if (projects.some(p => p.name === newName && p.id !== projectId)) {
    return false; // Nom déjà utilisé
  }
  
  projects[index].name = newName;
  
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return true;
  } catch (e) {
    console.error('Erreur lors du renommage du projet :', e);
    return false;
  }
}

/**
 * Vérifie si un nom de projet existe déjà
 * @param {string} name - Nom à vérifier
 * @returns {boolean} true si le nom existe déjà
 */
export function projectNameExists(name) {
  const projects = getAllProjects();
  return projects.some(p => p.name === name);
}

/**
 * Récupère un projet par son nom et son timestamp (pour éviter les conflits)
 * @param {string} name - Nom du projet
 * @param {number} timestamp - Timestamp du projet
 * @returns {Object|null} Le projet ou null si non trouvé
 */
export function getProjectByNameAndTimestamp(name, timestamp) {
  const projects = getAllProjects();
  return projects.find(p => p.name === name && p.timestamp === timestamp);
}
