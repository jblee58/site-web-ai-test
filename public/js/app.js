// ============================================================================
// SUNTY AI 1.0 — FRONTEND CONTROLLER
// Historique préservé · Quotas réels · Streaming SSE · Navigation complète
// ============================================================================

'use strict';

// ── Clés de stockage ─────────────────────────────────────────────────────────
const STORAGE_KEYS = [
  'sunty_chat_sessions_v4',
  'sunty_chat_sessions_v3',
  'sunty_chat_sessions_v2',
  'sunty_chat_sessions_v1',
  'sunty_chat_sessions'
];

const QUOTA_KEY    = 'sunty_quota_v2';
const SETTINGS_KEY = 'sunty_settings_v2';

// ── État global ───────────────────────────────────────────────────────────────
const state = {
  currentSessionId : null,
  activeTab        : 'accueil',
  activeEspace     : 'Personnel',
  isGenerating     : false,
  pendingFiles     : [],
  sessions         : [],

  quotas: {
    requestsToday : 0,
    maxRequests   : 1500,
    tokensUsed    : 0,
    lastLatencyMs : null,
    sessionStart  : new Date().toDateString()
  },

  settings: {
    temperature        : 0.7,
    customSystemPrompt : ''
  }
};

// ── Fallback SVG logo ─────────────────────────────────────────────────────────
const LOGO_SVG = `<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none">
  <path d="M72 26C72 14 44 12 30 24C12 38 18 58 44 58C74 58 84 76 68 90C50 104 22 92 22 78"
        stroke="white" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ── Initialisation ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadQuotas();
  loadSessions();
  initMarked();
  setupFileUpload();
  updateQuotaUI();

  if (state.sessions.length > 0) {
    loadSession(state.sessions[0].id);
  } else {
    seedDemoDiscussion();
  }

  if (window.lucide) lucide.createIcons();
});

// ============================================================================
// 1. HISTORIQUE — RÉTENTION ABSOLUE
// ============================================================================

function loadSessions() {
  state.sessions = [];

  for (const key of STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => {
          if (p && p.id && !state.sessions.some(s => s.id === p.id)) {
            state.sessions.push(p);
          }
        });
      }
    } catch (_) {}
  }
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(state.sessions));
    renderSidebarRecents();
    updateRecentsBadge();
  } catch (e) {
    console.error('Erreur sauvegarde:', e);
  }
}

function getCurrentSession() {
  return state.sessions.find(s => s.id === state.currentSessionId) || null;
}

/**
 * Discussion démo reprenant le message de la maquette originale
 */
function seedDemoDiscussion() {
  const demoId = 'session_demo_api_advantages';
  const session = {
    id        : demoId,
    title     : 'Avantages de ton propre site (API)',
    createdAt : Date.now() - 3600000,
    messages  : [
      {
        role      : 'user',
        content   : "Compare l'avantage de créer un site moi‑même avec ma clé API vs le site officiel Gemini.",
        timestamp : Date.now() - 3600000
      },
      {
        role      : 'model',
        content   : `Utiliser ton propre site avec ta clé API change complètement l'expérience. Voici les avantages clés :

### ⚡ Liberté totale de paramétrage
Température, contexte, top-P, top-K — tu contrôles tout. Les interfaces grand public appliquent des restrictions par défaut.

### 👤 System Prompt personnalisé
Tu peux imposer un rôle, un ton, un style permanent. **SuntyAI 1.0** en est l'exemple parfait.

### 💾 Historique local & privé
Tes conversations restent chez toi, stockées dans ton navigateur ou ta base de données. Aucun tiers ne peut y accéder.

### 🔧 Interface sur‑mesure
Thème, raccourcis, rendu Markdown, blocs de code colorés — tu construis exactement ce dont tu as besoin.

> **En résumé :** plus de liberté, plus de contrôle, une expérience 100 % personnalisée.`,
        timestamp : Date.now() - 3550000
      }
    ]
  };

  state.sessions.unshift(session);
  saveSessions();
  loadSession(demoId);
}

function startNewChat(notify = true) {
  if (state.isGenerating) return;

  state.currentSessionId = null;
  clearPendingFiles();

  const input = document.getElementById('chat-input');
  if (input) { input.value = ''; input.focus(); }

  if (state.activeTab !== 'accueil') {
    switchTab('accueil');
  } else {
    renderWelcomeHero();
  }

  renderSidebarRecents();
  if (notify) showToast('✦ Nouvelle discussion prête');
}

function loadSession(sessionId) {
  if (state.isGenerating) return;

  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;

  state.currentSessionId = sessionId;
  clearPendingFiles();

  if (state.activeTab !== 'accueil') switchTab('accueil', false);

  const view = document.getElementById('main-content-view');
  view.innerHTML = '';

  if (!session.messages || session.messages.length === 0) {
    renderWelcomeHero();
  } else {
    session.messages.forEach(msg => {
      if (msg.role === 'user') appendUserMessageToDOM(msg.content, msg.files || [], false);
      else appendAIMessageToDOM(msg.content, false);
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
    if (state.sessions.length > 0) loadSession(state.sessions[0].id);
    else startNewChat(false);
  } else {
    renderSidebarRecents();
  }
  showToast('Discussion supprimée');
}

function renderSidebarRecents() {
  const el = document.getElementById('recent-chats-list');
  if (!el) return;

  if (state.sessions.length === 0) {
    el.innerHTML = `<div style="font-size:0.72rem;color:#3f3f46;padding:6px 4px;font-style:italic">Aucune discussion</div>`;
    return;
  }

  el.innerHTML = state.sessions.slice(0, 12).map(s => {
    const active = s.id === state.currentSessionId;
    return `<div onclick="loadSession('${s.id}')" class="recent-item ${active ? 'active' : ''}">
      <span class="recent-dot"></span>
      <span class="recent-title">${escapeHTML(s.title)}</span>
      <button class="recent-delete" onclick="deleteSession('${s.id}', event)" title="Supprimer">
        <i data-lucide="x" style="width:11px;height:11px"></i>
      </button>
    </div>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function updateRecentsBadge() {
  const b = document.getElementById('recent-chats-badge');
  if (b) b.textContent = state.sessions.length;
}

// ============================================================================
// 2. QUOTAS & UTILISATION
// ============================================================================

function loadQuotas() {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    // Reset si c'est un nouveau jour
    if (saved.sessionStart !== new Date().toDateString()) {
      state.quotas.requestsToday = 0;
      state.quotas.tokensUsed    = 0;
    } else {
      Object.assign(state.quotas, saved);
    }
  } catch (_) {}
}

function saveQuotas() {
  try {
    state.quotas.sessionStart = new Date().toDateString();
    localStorage.setItem(QUOTA_KEY, JSON.stringify(state.quotas));
  } catch (_) {}
}

function recordUsage(tokensEst, latencyMs) {
  state.quotas.requestsToday += 1;
  state.quotas.tokensUsed    += (tokensEst || 350);
  if (latencyMs) state.quotas.lastLatencyMs = latencyMs;
  saveQuotas();
  updateQuotaUI();
}

function updateQuotaUI() {
  const pct = Math.min(100, Math.round((state.quotas.requestsToday / state.quotas.maxRequests) * 100));

  const pctEl = document.getElementById('quota-percent');
  if (pctEl) pctEl.textContent = pct + '%';

  const reqEl = document.getElementById('quota-requests-count');
  if (reqEl) reqEl.textContent = `${state.quotas.requestsToday.toLocaleString()} / ${state.quotas.maxRequests.toLocaleString()}`;

  const barEl = document.getElementById('quota-progress-bar');
  if (barEl) barEl.style.width = Math.max(pct, 0.5) + '%';

  const tokEl = document.getElementById('quota-tokens-count');
  if (tokEl) tokEl.textContent = state.quotas.tokensUsed.toLocaleString();

  const latEl = document.getElementById('quota-latency');
  if (latEl) latEl.textContent = state.quotas.lastLatencyMs ? state.quotas.lastLatencyMs + 'ms' : '—';
}

// ============================================================================
// 3. PARAMÈTRES
// ============================================================================

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (_) {}
}

// ============================================================================
// 4. NAVIGATION PAR ONGLETS
// ============================================================================

function switchTab(tabName, animate = true) {
  state.activeTab = tabName;

  // Mettre à jour l'état actif des liens
  document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
    link.classList.toggle('active', link.dataset.tab === tabName);
  });

  const view = document.getElementById('main-content-view');

  switch (tabName) {
    case 'accueil':
      if (state.currentSessionId) loadSession(state.currentSessionId);
      else renderWelcomeHero();
      break;

    case 'recents':
      renderRecentsView(view);
      break;

    case 'projets':
      renderProjetsView(view);
      break;

    case 'bibliotheque':
      renderBibliothequeView(view);
      break;

    case 'outils':
      renderOutilsView(view);
      break;

    default:
      renderWelcomeHero();
  }
}

function selectEspace(nom) {
  state.activeEspace = nom;

  document.querySelectorAll('.espace-item').forEach(el => {
    el.classList.toggle('active', el.dataset.espace === nom);
  });

  showToast(`✦ Espace "${nom}" sélectionné`);
  if (state.activeTab !== 'accueil') switchTab('accueil');
}

// ============================================================================
// 5. VUES DE NAVIGATION
// ============================================================================

function renderWelcomeHero() {
  state.currentSessionId = null;
  const view = document.getElementById('main-content-view');
  if (!view) return;

  view.innerHTML = `
    <div class="welcome-hero fade-in">
      <div class="hero-logo">
        <img src="/assets/sunty-logo.png" alt="Sunty" style="width:100%;height:100%;object-fit:contain" onerror="this.outerHTML='${LOGO_SVG}'">
      </div>
      <h1 class="hero-title">Bonjour 👋</h1>
      <p class="hero-sub">Je suis <strong>SuntyAI 1.0</strong>, créée par SuntyraXx.<br>Comment puis-je t'aider aujourd'hui ?</p>

      <div class="suggestion-grid">
        <button class="suggestion-chip" onclick="insertPromptAction('Crée un site web interactif complet avec HTML, CSS et JavaScript : ')">
          <div class="chip-icon">🌐</div>
          <div class="chip-text">
            <span class="chip-label">Créer un site web</span>
            <span class="chip-desc">HTML, CSS, JavaScript</span>
          </div>
        </button>
        <button class="suggestion-chip" onclick="insertPromptAction('Analyse ce code et explique-le ligne par ligne : ')">
          <div class="chip-icon">⚡</div>
          <div class="chip-text">
            <span class="chip-label">Analyser du code</span>
            <span class="chip-desc">Debug, révision, optimisation</span>
          </div>
        </button>
        <button class="suggestion-chip" onclick="insertPromptAction('Génère un composant React avec TypeScript et Tailwind CSS : ')">
          <div class="chip-icon">🔧</div>
          <div class="chip-text">
            <span class="chip-label">Générer du code</span>
            <span class="chip-desc">React, Next.js, Python...</span>
          </div>
        </button>
        <button class="suggestion-chip" onclick="insertPromptAction('Rédige un texte professionnel sur ce sujet : ')">
          <div class="chip-icon">✍️</div>
          <div class="chip-text">
            <span class="chip-label">Rédiger un texte</span>
            <span class="chip-desc">Email, rapport, article</span>
          </div>
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function renderRecentsView(view) {
  const sorted = [...state.sessions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Chats récents</h1>
      <p class="view-sub">${sorted.length} discussion${sorted.length !== 1 ? 's' : ''} sauvegardée${sorted.length !== 1 ? 's' : ''}</p>
    </div>
    ${sorted.length === 0 ? `<div style="text-align:center;padding:40px 0;color:#a1a1aa;font-size:0.85rem">Aucune discussion pour l'instant.<br>Commence un nouveau chat !</div>` :
      sorted.map((s, i) => `
        <div class="content-card fade-in" style="animation-delay:${i * 0.04}s" onclick="loadSession('${s.id}')">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div class="content-card-title">${escapeHTML(s.title)}</div>
            <button onclick="deleteSession('${s.id}', event)" style="padding:4px 8px;border-radius:6px;background:rgba(220,38,38,0.07);border:1px solid rgba(220,38,38,0.15);color:#dc2626;font-size:0.68rem;cursor:pointer" title="Supprimer">
              <i data-lucide="trash-2" style="width:11px;height:11px"></i>
            </button>
          </div>
          <div class="content-card-meta">${formatDate(s.createdAt)} · ${s.messages?.length || 0} message${(s.messages?.length || 0) !== 1 ? 's' : ''}</div>
        </div>
      `).join('')
    }
  `;

  if (window.lucide) lucide.createIcons();
}

function renderProjetsView(view) {
  const projectCategories = [
    { icon: '💻', name: 'Développement Web', desc: 'Sites, apps, composants', count: 0 },
    { icon: '📱', name: 'Applications Mobile', desc: 'React Native, Flutter', count: 0 },
    { icon: '🤖', name: 'IA & Machine Learning', desc: 'Modèles, datasets, pipelines', count: 0 },
    { icon: '📊', name: 'Analyse de Données', desc: 'Python, pandas, visualisation', count: 0 }
  ];

  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Mes Projets</h1>
      <p class="view-sub">Organise tes discussions par projet</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${projectCategories.map((p, i) => `
        <div class="content-card fade-in" style="animation-delay:${i * 0.06}s;cursor:pointer" onclick="startProjectChat('${escapeHTML(p.name)}')">
          <div style="font-size:1.5rem;margin-bottom:8px">${p.icon}</div>
          <div class="content-card-title">${p.name}</div>
          <div class="content-card-meta">${p.desc}</div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.06);display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:0.72rem;color:#a1a1aa">${p.count} discussion${p.count !== 1 ? 's' : ''}</span>
            <span style="font-size:0.72rem;font-weight:600;color:#09090b">Commencer →</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function renderBibliothequeView(view) {
  const resources = [
    { icon: '📚', title: 'Prompts Favoris', desc: 'Tes prompts sauvegardés', action: () => showToast('Fonctionnalité bientôt disponible') },
    { icon: '📎', title: 'Fichiers Importés', desc: 'Documents et images analysés', action: () => showToast('Fonctionnalité bientôt disponible') },
    { icon: '🔖', title: 'Réponses Mémorisées', desc: 'Réponses importantes sauvegardées', action: () => showToast('Fonctionnalité bientôt disponible') },
    { icon: '📝', title: 'Templates', desc: 'Modèles de messages réutilisables', action: () => showToast('Fonctionnalité bientôt disponible') }
  ];

  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Bibliothèque</h1>
      <p class="view-sub">Accès rapide à tes ressources</p>
    </div>
    ${resources.map((r, i) => `
      <div class="content-card fade-in" style="animation-delay:${i * 0.05}s;display:flex;align-items:center;gap:14px" onclick="(${r.action.toString()})()">
        <div style="width:42px;height:42px;border-radius:10px;background:#f4f4f5;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">${r.icon}</div>
        <div style="flex:1">
          <div class="content-card-title">${r.title}</div>
          <div class="content-card-meta">${r.desc}</div>
        </div>
        <i data-lucide="chevron-right" style="width:14px;height:14px;color:#a1a1aa;flex-shrink:0"></i>
      </div>
    `).join('')}
  `;

  if (window.lucide) lucide.createIcons();
}

function renderOutilsView(view) {
  const tools = [
    { icon: '🌐', title: 'Générateur de site web', desc: 'HTML, CSS, JS complet', prompt: 'Génère un site web complet et moderne avec HTML, CSS et JavaScript, thème sombre, avec des animations : ' },
    { icon: '⚡', title: 'Débogueur de code', desc: 'Analyse et corrige ton code', prompt: 'Analyse et débogue ce code, explique chaque problème et corrige-le : ' },
    { icon: '✍️', title: "Assistant d'écriture", desc: 'Rédaction et amélioration de textes', prompt: 'Améliore et reformule ce texte de façon professionnelle : ' },
    { icon: '📊', title: 'Analyseur de données', desc: 'CSV, JSON, tableaux', prompt: 'Analyse ces données et donne des insights pertinents : ' },
    { icon: '🔄', title: 'Traducteur avancé', desc: 'Multi-langue avec contexte', prompt: 'Traduis ce texte en conservant le ton et le style, explique tes choix : ' },
    { icon: '💡', title: 'Brainstorming', desc: "Génération d'idées créatives", prompt: 'Génère 10 idées créatives et originales pour : ' }
  ];

  view.innerHTML = `
    <div class="view-header">
      <h1 class="view-title">Outils</h1>
      <p class="view-sub">Accès rapide aux outils spécialisés</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${tools.map((t, i) => `
        <div class="content-card fade-in" style="animation-delay:${i * 0.04}s" onclick="insertPromptAction(${JSON.stringify(t.prompt)})">
          <div style="font-size:1.4rem;margin-bottom:8px">${t.icon}</div>
          <div class="content-card-title">${t.title}</div>
          <div class="content-card-meta">${t.desc}</div>
        </div>
      `).join('')}
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function startProjectChat(projectName) {
  startNewChat(false);
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = `[Projet: ${projectName}] `;
    input.focus();
  }
  switchTab('accueil', false);
}

// ============================================================================
// 6. PARAMÈTRES — MODALE
// ============================================================================

function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;

  // Pré-remplir les valeurs
  const tempSlider = document.getElementById('settings-temp-slider');
  const tempValue  = document.getElementById('settings-temp-value');
  const sysPrompt  = document.getElementById('settings-system-prompt');

  if (tempSlider) tempSlider.value = state.settings.temperature;
  if (tempValue)  tempValue.textContent = parseFloat(state.settings.temperature).toFixed(2);
  if (sysPrompt)  sysPrompt.value = state.settings.customSystemPrompt;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSettingsModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function saveSettingsFromModal() {
  const temp   = parseFloat(document.getElementById('settings-temp-slider')?.value || 0.7);
  const prompt = document.getElementById('settings-system-prompt')?.value || '';

  state.settings.temperature        = temp;
  state.settings.customSystemPrompt = prompt;
  saveSettings();

  closeSettingsModal();
  showToast('✦ Paramètres sauvegardés');
}

async function testApiConnection() {
  const btn      = document.getElementById('test-api-btn');
  const statusEl = document.getElementById('api-test-status');

  if (btn) {
    btn.disabled  = true;
    btn.innerHTML = `<i data-lucide="loader" style="width:12px;height:12px;animation:spin 1s linear infinite"></i> Test...`;
    if (window.lucide) lucide.createIcons();
  }

  const t0 = Date.now();
  try {
    const res  = await fetch('/api/chat', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ message: 'Réponds juste "OK"', messages: [] })
    });

    const latency = Date.now() - t0;
    if (res.ok || res.status === 200) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#16a34a;font-weight:600">✓ API opérationnelle · ${latency}ms</span>`;
    } else {
      const err = await res.json().catch(() => ({}));
      if (statusEl) statusEl.innerHTML = `<span style="color:#dc2626">✗ Erreur ${res.status}: ${escapeHTML(err.error || 'Inconnue')}</span>`;
    }
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:#dc2626">✗ Connexion impossible au serveur</span>`;
  } finally {
    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = `<i data-lucide="activity" style="width:12px;height:12px"></i> Tester`;
      if (window.lucide) lucide.createIcons();
    }
  }
}

function exportChatsData() {
  const data = {
    exportedAt : new Date().toISOString(),
    sessions   : state.sessions,
    quotas     : state.quotas,
    settings   : { temperature: state.settings.temperature }
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sunty-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Export JSON téléchargé');
}

function clearAllChats() {
  if (!confirm('Supprimer définitivement toutes les discussions ? Cette action est irréversible.')) return;
  state.sessions = [];
  state.currentSessionId = null;
  for (const key of STORAGE_KEYS) {
    try { localStorage.removeItem(key); } catch (_) {}
  }
  saveSessions();
  startNewChat(false);
  closeSettingsModal();
  showToast('Historique effacé');
}

// ============================================================================
// 7. GESTION DES FICHIERS
// ============================================================================

function setupFileUpload() {
  const input = document.getElementById('file-input');
  if (!input) return;

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    for (const file of files.slice(0, 3)) {
      try {
        const data = await readFileAsBase64(file);
        state.pendingFiles.push({ name: file.name, mimeType: file.type, data, size: file.size });
      } catch (_) {}
    }

    renderFilePreviews();
    input.value = '';
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function triggerFileUpload() {
  document.getElementById('file-input')?.click();
}

function renderFilePreviews() {
  const container = document.getElementById('file-preview-container');
  if (!container) return;

  if (state.pendingFiles.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.style.display = 'flex';

  container.innerHTML = state.pendingFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:5px 10px;background:#ffffff;border:1px solid rgba(0,0,0,0.09);border-radius:20px;font-size:0.72rem;font-weight:600;color:#3f3f46">
      <i data-lucide="paperclip" style="width:11px;height:11px;color:#a1a1aa"></i>
      <span>${escapeHTML(f.name)}</span>
      <button onclick="removePendingFile(${i})" style="margin-left:2px;color:#a1a1aa;background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center">
        <i data-lucide="x" style="width:11px;height:11px"></i>
      </button>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function removePendingFile(index) {
  state.pendingFiles.splice(index, 1);
  renderFilePreviews();
}

function clearPendingFiles() {
  state.pendingFiles = [];
  renderFilePreviews();
}

// ============================================================================
// 8. ENVOI & STREAMING
// ============================================================================

async function handleChatSubmit(event) {
  event.preventDefault();
  if (state.isGenerating) return;

  const input   = document.getElementById('chat-input');
  const message = input?.value?.trim() || '';
  const files   = [...state.pendingFiles];

  if (!message && files.length === 0) return;

  // Si pas de session en cours, créer une nouvelle
  if (!state.currentSessionId) {
    const id = 'session_' + Date.now();
    const title = message ? (message.length > 48 ? message.slice(0, 45) + '…' : message) : 'Fichier(s) joint(s)';
    state.sessions.unshift({ id, title, createdAt: Date.now(), messages: [] });
    state.currentSessionId = id;
    saveSessions();

    // Vider la vue welcome si elle est affichée
    const view = document.getElementById('main-content-view');
    if (view) view.innerHTML = '';
  }

  // Réinitialiser les entrées
  if (input) input.value = '';
  clearPendingFiles();

  // Ajouter le message utilisateur à l'UI et à la session
  const session = getCurrentSession();
  if (!session) return;

  const msgObj = { role: 'user', content: message, files: files.map(f => ({ name: f.name, mimeType: f.mimeType, size: f.size })), timestamp: Date.now() };
  session.messages.push(msgObj);
  saveSessions();
  appendUserMessageToDOM(message, msgObj.files, true);

  // Construire l'historique pour l'API (avec données fichiers)
  const apiMessages = session.messages.slice(0, -1).map(m => ({
    role    : m.role === 'model' ? 'model' : 'user',
    content : m.content
  }));

  // Ajouter les fichiers au message courant si présents
  const filesWithData = files.map(f => ({ data: f.data, mimeType: f.mimeType }));

  // Indicateur de frappe
  const typingId   = 'typing_' + Date.now();
  const typingHtml = `
    <div id="${typingId}" class="msg-row fade-in" style="animation-delay:0.05s">
      <div class="msg-avatar ai">
        <img src="/assets/sunty-logo.png" alt="S" style="width:100%;height:100%;object-fit:contain;border-radius:6px" onerror="this.outerHTML='<span>S</span>'">
      </div>
      <div class="msg-bubble ai">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>`;

  const view = document.getElementById('main-content-view');
  view.insertAdjacentHTML('beforeend', typingHtml);
  scrollToBottom();

  setGeneratingState(true);
  const t0 = Date.now();

  try {
    const response = await fetch('/api/chat', {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({
        message,
        messages              : apiMessages,
        files                 : filesWithData,
        temperature           : state.settings.temperature,
        customSystemPrompt    : state.settings.customSystemPrompt
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Erreur serveur ${response.status}`);
    }

    // Remplacer l'indicateur par le message AI en streaming
    const typingEl = document.getElementById(typingId);
    const aiMsgId  = 'ai_' + Date.now();

    if (typingEl) {
      typingEl.id        = aiMsgId;
      typingEl.innerHTML = `
        <div class="msg-avatar ai">
          <img src="/assets/sunty-logo.png" alt="S" style="width:100%;height:100%;object-fit:contain;border-radius:6px" onerror="this.outerHTML='<span>S</span>'">
        </div>
        <div class="msg-bubble ai">
          <div class="markdown-body" id="stream_${aiMsgId}"></div>
          <span class="streaming-cursor"></span>
        </div>`;
    }

    // Lire le flux SSE
    const reader  = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer    = '';
    let fullText  = '';
    let chunkBuf  = '';
    let lastRender = 0;

    const streamEl = document.getElementById(`stream_${aiMsgId}`);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            fullText += parsed.text;
            chunkBuf += parsed.text;

            // Rendu progressif (throttled pour performance)
            const now = Date.now();
            if (now - lastRender > 60 && streamEl) {
              streamEl.innerHTML = renderMarkdown(fullText);
              lastRender = now;
              scrollToBottom();
              chunkBuf = '';
            }
          }
        } catch (_) {}
      }
    }

    // Rendu final
    if (streamEl) {
      streamEl.innerHTML = renderMarkdown(fullText);
    }

    // Supprimer le curseur
    const msgEl = document.getElementById(aiMsgId);
    const cursor = msgEl?.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();

    // Sauvegarder la réponse dans la session
    const latency = Date.now() - t0;
    const tokEst  = Math.ceil(fullText.length / 4);

    session.messages.push({ role: 'model', content: fullText, timestamp: Date.now() });
    saveSessions();
    recordUsage(tokEst, latency);
    scrollToBottom();

  } catch (err) {
    // Supprimer l'indicateur de frappe en cas d'erreur
    document.getElementById(typingId)?.remove();

    // Afficher le message d'erreur
    const errHtml = `
      <div class="msg-row fade-in">
        <div class="msg-avatar ai">
          <img src="/assets/sunty-logo.png" alt="S" style="width:100%;height:100%;object-fit:contain;border-radius:6px" onerror="this.outerHTML='<span>S</span>'">
        </div>
        <div class="msg-bubble ai" style="border-color:rgba(220,38,38,0.2);background:#fff5f5">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:0.9rem">⚠️</span>
            <span style="font-size:0.78rem;font-weight:700;color:#dc2626">Erreur de connexion</span>
          </div>
          <div style="font-size:0.8rem;color:#7f1d1d">${escapeHTML(err.message || 'Une erreur est survenue')}</div>
        </div>
      </div>`;
    view.insertAdjacentHTML('beforeend', errHtml);
    scrollToBottom();
    showToast('⚠️ Erreur: ' + (err.message || 'Inconnue'));
  } finally {
    setGeneratingState(false);
  }
}

function setGeneratingState(generating) {
  state.isGenerating = generating;

  const btn  = document.getElementById('chat-submit-btn');
  const input = document.getElementById('chat-input');

  if (btn) {
    btn.disabled = generating;
    if (generating) {
      btn.innerHTML = `<i data-lucide="loader" style="width:15px;height:15px;animation:spin 1s linear infinite"></i>`;
    } else {
      btn.innerHTML = `<i data-lucide="send" style="width:15px;height:15px"></i>`;
    }
    if (window.lucide) lucide.createIcons();
  }

  if (input) input.disabled = generating;
}

// ============================================================================
// 9. RENDU DES MESSAGES
// ============================================================================

function appendUserMessageToDOM(content, files = [], animate = true) {
  const view = document.getElementById('main-content-view');
  if (!view) return;

  const fileHtml = files.length > 0 ? `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      ${files.map(f => `
        <div style="display:flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.15);border-radius:12px;font-size:0.7rem;color:rgba(255,255,255,0.8)">
          <i data-lucide="paperclip" style="width:10px;height:10px"></i>
          ${escapeHTML(f.name)}
        </div>
      `).join('')}
    </div>
  ` : '';

  const html = `
    <div class="msg-row user ${animate ? 'fade-in' : ''}">
      <div class="msg-bubble user">
        ${fileHtml}
        <div style="white-space:pre-wrap;word-break:break-word">${escapeHTML(content)}</div>
      </div>
      <div class="msg-avatar user">S</div>
    </div>`;

  view.insertAdjacentHTML('beforeend', html);
  if (window.lucide) lucide.createIcons();
  if (animate) scrollToBottom();
}

function appendAIMessageToDOM(content, animate = true) {
  const view = document.getElementById('main-content-view');
  if (!view) return;

  const html = `
    <div class="msg-row ${animate ? 'fade-in' : ''}">
      <div class="msg-avatar ai">
        <img src="/assets/sunty-logo.png" alt="S" style="width:100%;height:100%;object-fit:contain;border-radius:6px" onerror="this.outerHTML='<span>S</span>'">
      </div>
      <div class="msg-bubble ai">
        <div class="markdown-body">${renderMarkdown(content)}</div>
      </div>
    </div>`;

  view.insertAdjacentHTML('beforeend', html);
  if (animate) scrollToBottom();
}

// ============================================================================
// 10. MARKDOWN & CODE
// ============================================================================

function initMarked() {
  if (!window.marked) return;

  const renderer = new marked.Renderer();

  renderer.code = (code, lang) => {
    const language  = (lang || 'text').toLowerCase();
    let highlighted = code;
    try {
      if (window.hljs) {
        const result = window.hljs.highlight(code, { language, ignoreIllegals: true });
        highlighted  = result.value;
      }
    } catch (_) {
      if (window.hljs) {
        highlighted = window.hljs.highlightAuto(code).value;
      }
    }

    const id = 'code_' + Math.random().toString(36).slice(2, 8);
    return `<div class="code-block-wrapper">
      <div class="code-header">
        <span class="code-lang">${escapeHTML(language)}</span>
        <button class="code-copy-btn" onclick="copyCode('${id}')">
          <i data-lucide="copy" style="width:10px;height:10px"></i>
          Copier
        </button>
      </div>
      <pre><code id="${id}" class="hljs language-${escapeHTML(language)}">${highlighted}</code></pre>
    </div>`;
  };

  marked.setOptions({
    renderer,
    breaks   : true,
    gfm      : true
  });
}

function renderMarkdown(text) {
  if (!text) return '';
  try {
    const raw  = window.marked ? marked.parse(text) : escapeHTML(text).replace(/\n/g, '<br>');
    const clean = window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
    return clean;
  } catch (_) {
    return escapeHTML(text);
  }
}

function copyCode(codeId) {
  const el   = document.getElementById(codeId);
  const text = el?.innerText || el?.textContent || '';
  navigator.clipboard.writeText(text).then(() => showToast('✓ Code copié')).catch(() => showToast('Impossible de copier'));
}

// ============================================================================
// 11. HELPERS
// ============================================================================

function scrollToBottom() {
  const scroll = document.getElementById('chat-scroll');
  if (scroll) {
    requestAnimationFrame(() => {
      scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
    });
  }
}

function insertPromptAction(prompt) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = prompt;
    input.focus();

    if (state.activeTab !== 'accueil') switchTab('accueil');
    if (!state.currentSessionId) renderWelcomeHero();
  }
}

function showToast(message, duration = 3000) {
  const toast   = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.classList.remove('hide');
  toast.classList.add('show');

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.classList.remove('hide'), 300);
  }, duration);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000)        return 'À l\'instant';
  if (diff < 3600000)      return Math.floor(diff / 60000) + ' min';
  if (diff < 86400000)     return Math.floor(diff / 3600000) + 'h';
  if (diff < 172800000)    return 'Hier';

  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
