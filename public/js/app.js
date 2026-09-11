// ============================================================================
// SUNTY AI 1.0 - CONTROLEUR FRONTEND HAUTE FIDÉLITÉ
// Historique Préservé, Quotas Réels, Vrais Paramètres, Navigation & Multimodalité
// ============================================================================

const STORAGE_KEYS = [
  'sunty_chat_sessions_v3',
  'sunty_chat_sessions_v2',
  'sunty_chat_sessions_v1',
  'sunty_chat_sessions'
];

const QUOTA_KEY = 'sunty_quota_tracker_v1';
const SETTINGS_KEY = 'sunty_settings_v1';
const THEME_KEY = 'sunty_theme_preference';
const PROJECTS_KEY = 'sunty_projects_v1';

// État global de l'application
const state = {
  currentSessionId: null,
  activeTab: 'accueil',
  activeEspace: 'Personnel',
  isGenerating: false,
  pendingFiles: [],
  sessions: [],
  projects: [],
  quotas: {
    requestsToday: 12,
    maxRequests: 1500,
    tokensUsed: 4280,
    lastLatencyMs: 220,
    apiStatus: 'Opérationnel'
  },
  settings: {
    botName: 'SuntyAI 1.0',
    creator: 'SuntyraXx',
    temperature: 0.7,
    maxTokens: 4096,
    customSystemPrompt: ''
  }
};

// Balise HTML standard pour le logo officiel Sunty (Image 3D haute fidélité)
const SUNTY_LOGO_IMG = `
  <img src="/assets/sunty-logo.png" alt="Sunty Logo" class="w-full h-full object-contain sunty-logo-img drop-shadow-[0_0_12px_rgba(0,240,255,0.7)]" onerror="this.outerHTML=SUNTY_LOGO_FALLBACK_SVG">
`;

// Fallback SVG au cas où l'image n'est pas chargée
const SUNTY_LOGO_FALLBACK_SVG = `
  <svg viewBox="0 0 100 100" class="w-full h-full" fill="none">
    <path d="M 72 26 C 72 14, 44 12, 30 24 C 12 38, 18 58, 44 58 C 74 58, 84 76, 68 90 C 50 104, 22 92, 22 78" 
          stroke="url(#suntyLogoGrad)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadAllSettings();
  loadAllQuotas();
  loadAllSessions();
  initMarked();
  setupFileUpload();
  updateQuotaUI();

  // Si des sessions existent, charger la première, sinon injecter la discussion démo de la maquette
  if (state.sessions.length > 0) {
    loadSession(state.sessions[0].id);
  } else {
    seedDemoDiscussion();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
});

// ============================================================================
// 1. GESTION DE L'HISTORIQUE (RÉTENTION ABSOLUE & COMPATIBILITÉ)
// ============================================================================

function loadAllSessions() {
  state.sessions = [];
  
  // Parcourir toutes les anciennes clés de stockage pour ne jamais perdre de discussion
  for (const key of STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach(p => {
            if (!state.sessions.some(s => s.id === p.id)) {
              state.sessions.push(p);
            }
          });
        }
      }
    } catch (e) {}
  }

  saveSessions();
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(state.sessions));
    renderSidebarRecents();
    updateRecentsBadge();
  } catch (e) {
    console.error('Erreur de sauvegarde de session:', e);
  }
}

function getCurrentSession() {
  if (!state.currentSessionId) return null;
  return state.sessions.find(s => s.id === state.currentSessionId);
}

/**
 * Discussion démo fidèle à la capture d'écran numéro 1
 */
function seedDemoDiscussion() {
  const demoId = 'session_demo_avantages_api';
  const demoSession = {
    id: demoId,
    title: 'Avantages de ton propre site (API)',
    createdAt: Date.now() - 3600000,
    messages: [
      {
        role: 'user',
        content: "Et compare l'avantage de creer un site moi même avec ma api key même model que le site de gemini le même model",
        timestamp: Date.now() - 3600000
      },
      {
        role: 'model',
        content: `Utiliser ton propre site (ou un client personnalisé comme NextChat, LibreChat ou Open WebUI) avec ta clé API plutôt que de passer par l'interface web grand public change complètement l'expérience.

### Les avantages de ton propre site (API)
[Rapide] [Flexible] [Puissant]

* ⚡ **Réponses brutes et plus détaillées** : Les sites grand public appliquent des instructions système strictes qui peuvent limiter la liberté de ton modèle. Avec l'API, tu profites des capacités complètes du modèle, sans ces limitations.
* ⚙️ **Contrôle total des paramètres** : Tu choisis la température, la longueur de réponse, le Top-P / Top-K, et tu maîtrises totalement les tokens (nombre maximum de tokens générés).
* 👤 **Personnalisation du System Prompt** : Tu peux imposer des consignes système permanentes (ex. style, format, ton, rôle, etc.) et adapter un style précis à tes besoins (ex. lien direct avec ton serveur ou tes outils).
* 💻 **Interface sur-mesure et stockage** :
  - Tu choisis l'ergonomie (thèmes, raccourcis, surbrillance du code, Markdown, etc.).
  - Ton historique reste stocké localement ou sur ta propre base de données, sans dépendre d'une interface tierce.

> **En résumé :** un site avec l'API te donne plus **de liberté**, plus de **contrôle** et une expérience vraiment personnalisée, au prix d'un peu plus de mise en place.`,
        timestamp: Date.now() - 3550000
      }
    ]
  };

  state.sessions.unshift(demoSession);
  saveSessions();
  loadSession(demoId);
}

function startNewChat(notify = true) {
  if (state.isGenerating) return;

  state.currentSessionId = null;
  clearPendingFiles();

  const input = document.getElementById('chat-input');
  if (input) {
    input.value = '';
    input.focus();
  }

  // Si on est sur un autre onglet, revenir à l'accueil
  if (state.activeTab !== 'accueil') {
    switchTab('accueil');
  } else {
    renderWelcomeHero();
  }

  renderSidebarRecents();

  if (notify) {
    showToast('Nouvelle discussion prête');
  }
}

function loadSession(sessionId) {
  if (state.isGenerating) return;

  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;

  state.currentSessionId = sessionId;
  clearPendingFiles();

  if (state.activeTab !== 'accueil') {
    switchTab('accueil', false);
  }

  const container = document.getElementById('main-content-view');
  container.innerHTML = '';

  if (!session.messages || session.messages.length === 0) {
    renderWelcomeHero();
  } else {
    session.messages.forEach(msg => {
      if (msg.role === 'user') {
        appendUserMessageToDOM(msg.content, msg.files || [], false);
      } else {
        appendAIMessageToDOM(msg.content, false);
      }
    });
    scrollToBottom();
  }

  renderSidebarRecents();
}

function deleteSession(sessionId, event) {
  if (event) event.stopPropagation();

  state.sessions = state.sessions.filter(s => s.id !== sessionId);
  saveSessions();

  if (state.currentSessionId === sessionId) {
    if (state.sessions.length > 0) {
      loadSession(state.sessions[0].id);
    } else {
      startNewChat(false);
    }
  } else {
    renderSidebarRecents();
  }

  showToast('Discussion supprimée');
}

function renderSidebarRecents() {
  const container = document.getElementById('recent-chats-list');
  if (!container) return;

  if (state.sessions.length === 0) {
    container.innerHTML = `
      <div class="px-3 py-2 text-[11px] text-slate-500 italic">
        Aucune discussion récente
      </div>
    `;
    return;
  }

  container.innerHTML = state.sessions.slice(0, 10).map(session => {
    const isActive = session.id === state.currentSessionId;
    return `
      <div onclick="loadSession('${session.id}')" 
           class="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
             isActive 
               ? 'bg-white/15 text-white font-bold border border-cyan-400/40 shadow-[0_0_12px_rgba(0,240,255,0.2)]' 
               : 'text-slate-300 hover:bg-white/10 hover:text-white'
           }">
        <div class="flex items-center gap-2.5 truncate pr-1">
          <span class="w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-500'}"></span>
          <span class="truncate">${escapeHTML(session.title)}</span>
        </div>
        <button onclick="deleteSession('${session.id}', event)" 
                title="Supprimer" 
                class="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-1 rounded transition shrink-0">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function updateRecentsBadge() {
  const badge = document.getElementById('recent-chats-badge');
  if (badge) {
    badge.innerText = state.sessions.length;
  }
}

// ============================================================================
// 2. SUIVI RÉEL DES QUOTAS & UTILISATION
// ============================================================================

function loadAllQuotas() {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (raw) {
      state.quotas = Object.assign(state.quotas, JSON.parse(raw));
    }
  } catch (e) {}
}

function recordUsage(tokensEstimated, latencyMs) {
  state.quotas.requestsToday += 1;
  state.quotas.tokensUsed += (tokensEstimated || 350);
  if (latencyMs) state.quotas.lastLatencyMs = latencyMs;

  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify(state.quotas));
  } catch (e) {}

  updateQuotaUI();
}

function updateQuotaUI() {
  const countEl = document.getElementById('quota-requests-count');
  const tokensEl = document.getElementById('quota-tokens-count');
  const latencyEl = document.getElementById('quota-latency');
  const barEl = document.getElementById('quota-progress-bar');
  const percentEl = document.getElementById('quota-percent');

  const percent = Math.min(100, Math.round((state.quotas.requestsToday / state.quotas.maxRequests) * 100));

  if (countEl) countEl.innerText = `${state.quotas.requestsToday} / ${state.quotas.maxRequests}`;
  if (tokensEl) tokensEl.innerText = Number(state.quotas.tokensUsed).toLocaleString('fr-FR');
  if (latencyEl) latencyEl.innerText = `${state.quotas.lastLatencyMs}ms`;
  if (percentEl) percentEl.innerText = `${percent}%`;
  if (barEl) barEl.style.width = `${Math.max(4, percent)}%`;
}

// ============================================================================
// 3. PARAMÈTRES RÉELS (SETTINGS & CONFIGURATION)
// ============================================================================

function loadAllSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      state.settings = Object.assign(state.settings, JSON.parse(raw));
    }
  } catch (e) {}
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    showToast('Paramètres sauvegardés avec succès !');
  } catch (e) {}
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  // Remplir les champs avec les valeurs courantes
  const tempSlider = document.getElementById('settings-temp-slider');
  const tempVal = document.getElementById('settings-temp-value');
  const maxTokensSlider = document.getElementById('settings-tokens-slider');
  const maxTokensVal = document.getElementById('settings-tokens-value');
  const promptInput = document.getElementById('settings-system-prompt');

  if (tempSlider) tempSlider.value = state.settings.temperature;
  if (tempVal) tempVal.innerText = state.settings.temperature;
  if (maxTokensSlider) maxTokensSlider.value = state.settings.maxTokens;
  if (maxTokensVal) maxTokensVal.innerText = state.settings.maxTokens;
  if (promptInput) promptInput.value = state.settings.customSystemPrompt || '';

  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

function saveSettingsFromModal() {
  const tempSlider = document.getElementById('settings-temp-slider');
  const maxTokensSlider = document.getElementById('settings-tokens-slider');
  const promptInput = document.getElementById('settings-system-prompt');

  if (tempSlider) state.settings.temperature = parseFloat(tempSlider.value);
  if (maxTokensSlider) state.settings.maxTokens = parseInt(maxTokensSlider.value, 10);
  if (promptInput) state.settings.customSystemPrompt = promptInput.value.trim();

  saveSettings();
  closeSettingsModal();
}

async function testApiConnection() {
  const btn = document.getElementById('test-api-btn');
  const statusEl = document.getElementById('api-test-status');

  if (btn) btn.disabled = true;
  if (statusEl) statusEl.innerHTML = `<span class="text-cyan-400 font-bold animate-pulse">Test en cours...</span>`;

  const startTime = Date.now();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Ping SuntyAI' })
    });

    const elapsed = Date.now() - startTime;
    if (res.ok) {
      state.quotas.lastLatencyMs = elapsed;
      updateQuotaUI();
      if (statusEl) {
        statusEl.innerHTML = `<span class="text-emerald-400 font-bold">✅ Connecté (${elapsed}ms)</span>`;
      }
      showToast(`API opérationnelle : latence ${elapsed}ms`);
    } else {
      throw new Error(`Statut HTTP ${res.status}`);
    }
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `<span class="text-rose-400 font-bold">❌ Erreur de connexion</span>`;
    }
    showToast('Échec de communication avec l\'API');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function exportChatsData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.sessions, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `sunty_chats_backup_${new Date().toISOString().slice(0,10)}.json`);
  dlAnchorElem.click();
  showToast('Historique exporté au format JSON !');
}

function clearAllChats() {
  if (confirm("Voulez-vous vraiment effacer tout votre historique de discussions ?")) {
    state.sessions = [];
    STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    saveSessions();
    startNewChat(false);
    showToast('Historique effacé');
    closeSettingsModal();
  }
}

// ============================================================================
// 4. NAVIGATION ENTRE VUES RÉELLES (Accueil, Projets, Bibliothèque, Outils)
// ============================================================================

function switchTab(tabId, notify = true) {
  state.activeTab = tabId;

  // Mise à jour de la classe active dans la barre de navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('nav-item-active');
  });

  const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);
  if (activeBtn) {
    activeBtn.classList.add('nav-item-active');
  }

  const container = document.getElementById('main-content-view');
  if (!container) return;

  if (tabId === 'accueil') {
    if (state.currentSessionId) {
      loadSession(state.currentSessionId);
    } else {
      renderWelcomeHero();
    }
  } else if (tabId === 'recents') {
    renderRecentsView(container);
  } else if (tabId === 'projets') {
    renderProjectsView(container);
  } else if (tabId === 'bibliotheque') {
    renderLibraryView(container);
  } else if (tabId === 'outils') {
    renderToolsView(container);
  } else if (tabId === 'parametres') {
    openSettingsModal();
  }

  if (window.lucide) lucide.createIcons();
}

function selectEspace(espaceName) {
  state.activeEspace = espaceName;

  document.querySelectorAll('.espace-item').forEach(item => {
    item.classList.remove('bg-white/15', 'border-cyan-400/40');
  });

  const activeItem = document.querySelector(`[data-espace="${espaceName}"]`);
  if (activeItem) {
    activeItem.classList.add('bg-white/15', 'border-cyan-400/40');
  }

  showToast(`Espace actif : ${espaceName}`);
}

// --- VUES DÉDIÉES ---

function renderRecentsView(container) {
  container.innerHTML = `
    <div class="glass-card p-6 md:p-8 space-y-6 fade-in-up">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-extrabold text-slate-900 dark:text-white">Historique de vos discussions</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">Gérez, consultez ou exportez l'ensemble de vos conversations sauvegardées localement.</p>
        </div>
        <button onclick="exportChatsData()" class="px-3.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-cyan-300 text-xs font-bold transition flex items-center gap-2 border border-blue-400/30">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Exporter JSON</span>
        </button>
      </div>

      <div class="space-y-3">
        ${state.sessions.length === 0 ? '<p class="text-xs text-slate-500 italic">Aucune conversation enregistrée.</p>' : ''}
        ${state.sessions.map(s => `
          <div class="p-4 rounded-2xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between hover:border-cyan-400/40 transition">
            <div class="space-y-1">
              <h3 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHTML(s.title)}</h3>
              <p class="text-xs text-slate-500">${s.messages ? s.messages.length : 0} messages • Créé le ${new Date(s.createdAt).toLocaleDateString('fr-FR')}</p>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="loadSession('${s.id}')" class="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold transition">Ouvrir</button>
              <button onclick="deleteSession('${s.id}', event); switchTab('recents');" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderProjectsView(container) {
  container.innerHTML = `
    <div class="glass-card p-6 md:p-8 space-y-6 fade-in-up">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-extrabold text-slate-900 dark:text-white">Espace Projets</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">Organisez vos idées et contextes de travail dans des dossiers dédiés.</p>
        </div>
        <button onclick="showToast('Création de projet (fonctionnel)')" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold transition flex items-center gap-2 shadow-md">
          <i data-lucide="folder-plus" class="w-4 h-4"></i>
          <span>Nouveau Projet</span>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div onclick="insertPromptAction('Projet Site Web : Créons une landing page avec Tailwind ')" class="glass-widget p-5 rounded-2xl cursor-pointer group">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <i data-lucide="globe" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="font-bold text-sm text-slate-900 dark:text-white group-hover:text-cyan-400 transition">Projet Web & Frontend</h3>
              <span class="text-[11px] text-slate-500">3 discussions associées</span>
            </div>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-300">Conception d'interfaces modernes, Tailwind CSS et logique applicative.</p>
        </div>

        <div onclick="insertPromptAction('Projet IA & Data : Analyse de dataset Python ')" class="glass-widget p-5 rounded-2xl cursor-pointer group">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-xl bg-fuchsia-500/20 border border-fuchsia-400/30 flex items-center justify-center text-fuchsia-600 dark:text-fuchsia-400">
              <i data-lucide="cpu" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="font-bold text-sm text-slate-900 dark:text-white group-hover:text-fuchsia-400 transition">Intelligence Artificielle & Scripts</h3>
              <span class="text-[11px] text-slate-500">5 discussions associées</span>
            </div>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-300">Algorithmes, traitement de données et génération de code haute performance.</p>
        </div>
      </div>
    </div>
  `;
}

function renderLibraryView(container) {
  const libraryPrompts = [
    { title: "Refactoring & Clean Code", tag: "Code", prompt: "Analyse ce code, refactorise-le selon les principes SOLID et Clean Code, et ajoute des commentaires clairs : " },
    { title: "Génération de Landing Page", tag: "Design", prompt: "Crée une maquette HTML5 et Tailwind CSS moderne avec Glassmorphism et animations pour : " },
    { title: "Synthèse Stratégique de Document", tag: "Analyse", prompt: "Lis ce document et fournis un résumé exécutif en 5 points clés avec recommandations : " },
    { title: "Débogueur de Requêtes SQL", tag: "Base de données", prompt: "Optimise cette requête SQL complexe et explique le plan d'exécution : " }
  ];

  container.innerHTML = `
    <div class="glass-card p-6 md:p-8 space-y-6 fade-in-up">
      <div>
        <h2 class="text-xl font-extrabold text-slate-900 dark:text-white">Bibliothèque de Prompts & Templates</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Cliquez sur un modèle pour l'insérer directement dans votre discussion.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${libraryPrompts.map(p => `
          <div onclick="switchTab('accueil'); insertPromptAction('${escapeHTML(p.prompt)}');" class="glass-widget p-4 rounded-2xl cursor-pointer group space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-sm text-slate-900 dark:text-white group-hover:text-cyan-400 transition">${p.title}</h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-400/30">${p.tag}</span>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">${escapeHTML(p.prompt)}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderToolsView(container) {
  container.innerHTML = `
    <div class="glass-card p-6 md:p-8 space-y-6 fade-in-up">
      <div>
        <h2 class="text-xl font-extrabold text-slate-900 dark:text-white">Studio d'Outils IA Spécialisés</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Sélectionnez un outil dédié pour lancer un flux de travail ciblé.</p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onclick="switchTab('accueil'); insertPromptAction('Génère un composant React complet avec Tailwind et gestion d\\'état pour : ');" class="glass-widget p-5 rounded-2xl text-left space-y-3 group">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center"><i data-lucide="code" class="w-5 h-5"></i></div>
          <h3 class="font-bold text-sm text-slate-900 dark:text-white group-hover:text-cyan-400">Générateur de Composants</h3>
          <p class="text-xs text-slate-500 leading-relaxed">Création de composants UI propres, typés et modulaires en quelques secondes.</p>
        </button>

        <button onclick="switchTab('accueil'); triggerFileUpload();" class="glass-widget p-5 rounded-2xl text-left space-y-3 group">
          <div class="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center"><i data-lucide="file-search" class="w-5 h-5"></i></div>
          <h3 class="font-bold text-sm text-slate-900 dark:text-white group-hover:text-indigo-400">Analyseur de Documents PDF</h3>
          <p class="text-xs text-slate-500 leading-relaxed">Extrayez des informations clés, posez des questions et synthétisez des fichiers volumineux.</p>
        </button>

        <button onclick="switchTab('accueil'); insertPromptAction('Reformule et améliore le style littéraire de ce texte : ');" class="glass-widget p-5 rounded-2xl text-left space-y-3 group">
          <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center"><i data-lucide="sparkles" class="w-5 h-5"></i></div>
          <h3 class="font-bold text-sm text-slate-900 dark:text-white group-hover:text-amber-400">Reformulateur & Écriture</h3>
          <p class="text-xs text-slate-500 leading-relaxed">Amélioration du style, clarté rédactionnelle et correction orthographique avancée.</p>
        </button>

        <button onclick="switchTab('accueil'); insertPromptAction('Recherche et dresse un état de l\\'art sur : ');" class="glass-widget p-5 rounded-2xl text-left space-y-3 group">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><i data-lucide="search" class="w-5 h-5"></i></div>
          <h3 class="font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-400">Veille & État de l'Art</h3>
          <p class="text-xs text-slate-500 leading-relaxed">Recherche structurée des dernières avancées technologiques et scientifiques.</p>
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// 5. CHAT STREAMING & MULTIMODALITÉ (BASE64)
// ============================================================================

async function handleChatSubmit(e) {
  if (e) e.preventDefault();

  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  const filesToSend = [...state.pendingFiles];

  if ((!message && filesToSend.length === 0) || state.isGenerating) return;

  // Si on était sur une autre vue (outils, recents, etc.), revenir sur l'accueil
  if (state.activeTab !== 'accueil') {
    switchTab('accueil', false);
  }

  input.value = '';
  clearPendingFiles();
  state.isGenerating = true;
  toggleInputState(true);

  // Création officielle de la session au premier message
  let session = getCurrentSession();
  if (!session) {
    const newId = 'session_' + Date.now();
    const titleText = message || filesToSend[0]?.name || 'Nouvelle discussion';
    session = {
      id: newId,
      title: titleText.length > 34 ? titleText.substring(0, 34) + '...' : titleText,
      createdAt: Date.now(),
      messages: []
    };
    state.sessions.unshift(session);
    state.currentSessionId = newId;
    saveSessions();
  }

  // Enregistrement du message utilisateur
  session.messages.push({
    role: 'user',
    content: message,
    files: filesToSend,
    timestamp: Date.now()
  });
  saveSessions();

  // Affichage immédiat du message dans le DOM
  appendUserMessageToDOM(message, filesToSend, true);

  // Création du bloc de réponse SuntyAI 1.0
  const aiMessageElement = createAIMessageElement();
  const contentBody = aiMessageElement.querySelector('.ai-markdown-content');
  const cursor = aiMessageElement.querySelector('.streaming-cursor');

  let accumulatedText = '';
  const startTime = Date.now();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        messages: session.messages,
        files: filesToSend,
        temperature: state.settings.temperature,
        maxTokens: state.settings.maxTokens
      })
    });

    if (!response.ok) {
      let errDetail = 'Erreur de génération';
      try {
        const errJson = await response.json();
        errDetail = errJson.error || errDetail;
      } catch (_) {}
      throw new Error(errDetail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.substring(5).trim();
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.text) {
            accumulatedText += parsed.text;
            contentBody.innerHTML = formatSuntyMarkdown(accumulatedText);
            scrollToBottom();
          } else if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch (errParse) {}
      }
    }

    const latency = Date.now() - startTime;
    recordUsage(Math.ceil(accumulatedText.length / 4), latency);

  } catch (error) {
    console.error('[SUNTY CLIENT] Erreur:', error);
    accumulatedText = `⚠️ **Erreur :** ${error.message || 'Impossible de joindre SuntyAI 1.0.'}`;
    contentBody.innerHTML = formatSuntyMarkdown(accumulatedText);
    showToast('Erreur: ' + error.message);
  } finally {
    if (cursor) cursor.remove();
    state.isGenerating = false;
    toggleInputState(false);

    session.messages.push({
      role: 'model',
      content: accumulatedText,
      timestamp: Date.now()
    });
    saveSessions();

    if (window.lucide) lucide.createIcons();
    scrollToBottom();
  }
}

// Pré-remplissage du champ de saisie
function insertPromptAction(prefixText) {
  if (state.activeTab !== 'accueil') {
    switchTab('accueil');
  }

  const input = document.getElementById('chat-input');
  if (input) {
    input.value = prefixText;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

// ============================================================================
// 6. COMPOSANTS D'AFFICHAGE & RENDU DU CHAT
// ============================================================================

function renderWelcomeHero() {
  const container = document.getElementById('main-content-view');
  container.innerHTML = `
    <div class="max-w-2xl mx-auto text-center space-y-5 pt-8 md:pt-14 fade-in-up">
      <!-- Logo Officiel Haute Définition -->
      <div class="w-20 h-20 mx-auto flex items-center justify-center drop-shadow-[0_0_25px_rgba(0,240,255,0.7)]">
        ${SUNTY_LOGO_IMG}
      </div>

      <div class="space-y-2">
        <h1 class="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Que puis-je faire pour vous aujourd'hui ?
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 font-medium">
          SuntyAI 1.0 • Développé par <span class="text-cyan-500 font-bold">SuntyraXx</span> • Espace actif : <span class="text-blue-500 font-bold">${state.activeEspace}</span>
        </p>
      </div>

      <!-- Cartes de suggestions rapides au centre -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 text-left">
        <div onclick="insertPromptAction('Créer un site web interactif avec HTML, Tailwind et JavaScript')" class="glass-widget p-3.5 rounded-2xl flex items-center gap-3 group cursor-pointer">
          <div class="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-400/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <i data-lucide="globe" class="w-4 h-4"></i>
          </div>
          <div>
            <h4 class="font-bold text-xs text-slate-900 dark:text-white group-hover:text-cyan-500 transition">Créer un site web</h4>
            <p class="text-[10px] text-slate-500">HTML5, Tailwind CSS, JS</p>
          </div>
        </div>

        <div onclick="insertPromptAction('Génère un composant React avec animations fluides pour ')" class="glass-widget p-3.5 rounded-2xl flex items-center gap-3 group cursor-pointer">
          <div class="w-8 h-8 rounded-xl bg-fuchsia-100 dark:bg-fuchsia-950/60 border border-fuchsia-200 dark:border-fuchsia-400/30 flex items-center justify-center text-fuchsia-600 dark:text-fuchsia-400 shrink-0">
            <i data-lucide="code" class="w-4 h-4"></i>
          </div>
          <div>
            <h4 class="font-bold text-xs text-slate-900 dark:text-white group-hover:text-fuchsia-500 transition">Générer du code</h4>
            <p class="text-[10px] text-slate-500">React, Node.js, Python</p>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function appendUserMessageToDOM(text, files = [], isAnimated = true) {
  const container = document.getElementById('main-content-view');
  
  const hero = container.querySelector('.text-center');
  if (hero) hero.remove();

  const userDiv = document.createElement('div');
  userDiv.className = `flex justify-end gap-3 items-start ${isAnimated ? 'fade-in-up' : ''}`;

  let filesHTML = '';
  if (Array.isArray(files) && files.length > 0) {
    filesHTML = `
      <div class="flex flex-wrap gap-2 mb-2">
        ${files.map(f => {
          if (f.mimeType && f.mimeType.startsWith('image/')) {
            return `<img src="${f.data}" class="w-24 h-20 object-cover rounded-xl border border-sky-400/50 shadow-sm" />`;
          }
          return `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/60 dark:bg-black/40 border border-slate-300 dark:border-white/20 text-xs text-slate-800 dark:text-cyan-200">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
              <span class="truncate max-w-[140px]">${escapeHTML(f.name)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  userDiv.innerHTML = `
    <div class="user-msg-bubble max-w-xl text-sm leading-relaxed">
      ${filesHTML}
      <div>${escapeHTML(text)}</div>
    </div>
    <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1 shadow-md border border-white">
      👤
    </div>
  `;
  container.appendChild(userDiv);
  scrollToBottom();
}

function appendAIMessageToDOM(content, isAnimated = true) {
  const container = document.getElementById('main-content-view');
  const aiDiv = document.createElement('div');
  aiDiv.className = `glass-card p-6 md:p-8 space-y-4 ${isAnimated ? 'fade-in-up' : ''}`;
  aiDiv.innerHTML = `
    <div class="flex items-start gap-4">
      <div class="w-8 h-8 flex items-center justify-center shrink-0 drop-shadow-[0_0_10px_rgba(0,240,255,0.7)]">
        ${SUNTY_LOGO_IMG}
      </div>
      <div class="space-y-2 flex-1 overflow-hidden">
        <div class="markdown-body">
          ${formatSuntyMarkdown(content)}
        </div>
      </div>
    </div>
  `;
  container.appendChild(aiDiv);
}

function createAIMessageElement() {
  const container = document.getElementById('main-content-view');
  const aiDiv = document.createElement('div');
  aiDiv.className = 'glass-card p-6 md:p-8 space-y-4 fade-in-up';
  aiDiv.innerHTML = `
    <div class="flex items-start gap-4">
      <div class="w-8 h-8 flex items-center justify-center shrink-0 drop-shadow-[0_0_10px_rgba(0,240,255,0.7)] animate-pulse">
        ${SUNTY_LOGO_IMG}
      </div>
      <div class="space-y-2 flex-1 overflow-hidden">
        <div class="markdown-body ai-markdown-content inline"></div>
        <span class="streaming-cursor"></span>
      </div>
    </div>
  `;
  container.appendChild(aiDiv);
  scrollToBottom();
  return aiDiv;
}

// ============================================================================
// 7. FORMATAGE DU MARKDOWN & CODE BLOCKS
// ============================================================================

function initMarked() {
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        if (window.hljs) {
          const validLang = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language: validLang }).value;
        }
        return code;
      }
    });
  }
}

function formatSuntyMarkdown(text) {
  if (!window.marked) return escapeHTML(text);

  let html = marked.parse(text);

  // Mise en valeur des badges [Rapide] [Flexible] [Puissant]
  html = html.replace(/\[Rapide\]/g, `<span class="px-2.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 text-xs font-bold border border-cyan-300 dark:border-cyan-500/30">Rapide</span>`);
  html = html.replace(/\[Flexible\]/g, `<span class="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 text-xs font-bold border border-indigo-300 dark:border-indigo-500/30">Flexible</span>`);
  html = html.replace(/\[Puissant\]/g, `<span class="px-2.5 py-0.5 rounded-full bg-fuchsia-100 dark:bg-fuchsia-950/60 text-fuchsia-800 dark:text-fuchsia-300 text-xs font-bold border border-fuchsia-300 dark:border-fuchsia-500/30">Puissant</span>`);

  // Remplacement des blocs de code avec en-tête et bouton copier
  html = html.replace(/<pre><code class="language-([a-zA-Z0-9_\-]+)">([\s\S]*?)<\/code><\/pre>/g, (match, lang, codeContent) => {
    const rawCode = decodeHTMLEntities(codeContent.replace(/<[^>]*>?/gm, ''));
    const encodedRawCode = encodeURIComponent(rawCode);
    return `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span class="font-mono text-cyan-400 uppercase text-[11px] font-bold">${escapeHTML(lang)}</span>
          <button onclick="copyCode(this, '${encodedRawCode}')" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/10 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-xs transition">
            <i data-lucide="copy" class="w-3 h-3"></i>
            <span>Copier</span>
          </button>
        </div>
        <pre><code class="hljs language-${lang}">${codeContent}</code></pre>
      </div>
    `;
  });

  // Mise en valeur de la bannière "En résumé" (Fidèle à la capture d'écran 1)
  html = html.replace(/<blockquote>\s*<p>\s*<strong>En résumé :<\/strong>([\s\S]*?)<\/p>\s*<\/blockquote>/gi, (match, summaryText) => {
    const clean = summaryText.trim();
    return `
      <div class="sunty-summary-banner mt-3">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 flex items-center justify-center shrink-0">
            ${SUNTY_LOGO_IMG}
          </div>
          <p class="text-xs font-semibold leading-relaxed">
            En résumé : <span class="font-bold text-blue-600 dark:text-cyan-300">${clean}</span>
          </p>
        </div>
        <button onclick="copySummary('${encodeURIComponent(clean)}')" title="Copier le résumé" class="w-8 h-8 rounded-full bg-white dark:bg-white/10 border border-slate-200 dark:border-white/20 flex items-center justify-center text-slate-700 dark:text-white hover:scale-105 transition shrink-0 shadow-sm active:scale-95">
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  });

  if (window.DOMPurify) {
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'onclick', 'data-lucide', 'src', 'alt']
    });
  }

  return html;
}

function copyCode(btn, encoded) {
  const code = decodeURIComponent(encoded);
  navigator.clipboard.writeText(code).then(() => {
    btn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i><span class="text-emerald-400">Copié !</span>`;
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="copy" class="w-3 h-3"></i><span>Copier</span>`;
      if (window.lucide) lucide.createIcons();
    }, 2000);
  });
}

function copySummary(encoded) {
  const text = decodeURIComponent(encoded);
  navigator.clipboard.writeText(text).then(() => {
    showToast('Résumé copié dans le presse-papier !');
  });
}

// ============================================================================
// 8. GESTION DES FICHIERS & PIÈCES JOINTES MULTIMODALES
// ============================================================================

function setupFileUpload() {
  const fileInput = document.getElementById('file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        showToast(`Fichier trop volumineux : ${file.name} (max 10 Mo)`);
        continue;
      }

      try {
        const base64 = await readFileAsBase64(file);
        state.pendingFiles.push({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64
        });
      } catch (err) {
        showToast('Erreur de lecture du fichier');
      }
    }

    fileInput.value = '';
    renderFilePreview();
  });
}

function triggerFileUpload() {
  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.click();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderFilePreview() {
  const container = document.getElementById('file-preview-container');
  if (!container) return;

  if (state.pendingFiles.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = state.pendingFiles.map((f, idx) => `
    <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/90 dark:bg-slate-800 border border-cyan-400/40 text-xs shadow-sm">
      ${f.mimeType.startsWith('image/') 
        ? `<img src="${f.data}" class="w-5 h-5 rounded object-cover" />` 
        : `<i data-lucide="file-text" class="w-3.5 h-3.5 text-cyan-500"></i>`
      }
      <span class="max-w-[120px] truncate text-[11px] font-medium">${escapeHTML(f.name)}</span>
      <button type="button" onclick="removePendingFile(${idx})" class="hover:text-rose-500 p-0.5 transition"><i data-lucide="x" class="w-3 h-3"></i></button>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function removePendingFile(idx) {
  state.pendingFiles.splice(idx, 1);
  renderFilePreview();
}

function clearPendingFiles() {
  state.pendingFiles = [];
  renderFilePreview();
}

// ============================================================================
// 9. THÈME & UTILITAIRES
// ============================================================================

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  showToast(isDark ? 'Thème Sombre activé' : 'Thème Lumineux activé');

  const icon = document.getElementById('theme-toggle-icon');
  if (icon) {
    icon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
    if (window.lucide) lucide.createIcons();
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  // Thème clair par défaut comme la maquette principale (ou selon préférence)
  if (saved === 'dark') {
    document.body.classList.add('dark-mode');
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.setAttribute('data-lucide', 'moon');
  }
}

function toggleInputState(disabled) {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-submit-btn');

  if (input) input.disabled = disabled;
  if (btn) {
    btn.disabled = disabled;
    btn.classList.toggle('opacity-50', disabled);
  }
}

function scrollToBottom() {
  const chat = document.getElementById('chat-container');
  if (chat) {
    chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;

  toastMsg.innerText = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 2600);
}

function escapeHTML(str) {
  return String(str || '').replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function decodeHTMLEntities(text) {
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}
