// ============================================================================
// SUNTY AI - FRONTEND APPLICATION JAVASCRIPT
// Streaming SSE, Mémoire Locale, Markdown + Highlight.js, Gestion Multi-Chats
// ============================================================================

const STORAGE_KEY = 'sunty_chat_sessions_v1';
const THEME_KEY = 'sunty_theme_preference';

// État global de l'application
const state = {
  currentSessionId: null,
  activeModel: 'Gemini 3.8 Flash', // Modèle actif par défaut
  isGenerating: false,
  sessions: []
};

// SVG du Logo Officiel Sunty Gradient
const SUNTY_LOGO_SVG = `
  <svg viewBox="0 0 100 100" class="w-full h-full" fill="none">
    <path d="M 72 26 C 72 14, 44 12, 30 24 C 12 38, 18 58, 44 58 C 74 58, 84 76, 68 90 C 50 104, 22 92, 22 78" 
          stroke="url(#suntyLogoGrad)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadSessionsFromStorage();
  initMarked();
  renderRecentsList();

  if (state.sessions.length > 0) {
    loadSession(state.sessions[0].id);
  } else {
    startNewChat(false);
  }

  // Initialisation des icônes Lucide
  if (window.lucide) {
    lucide.createIcons();
  }
});

// ============================================================================
// 1. GESTION DES SESSIONS & LOCALSTORAGE
// ============================================================================

function loadSessionsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.sessions = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Erreur chargement localStorage:', e);
    state.sessions = [];
  }
}

function saveSessionsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
    renderRecentsList();
  } catch (e) {
    console.error('Erreur sauvegarde localStorage:', e);
  }
}

function getCurrentSession() {
  return state.sessions.find(s => s.id === state.currentSessionId);
}

function startNewChat(notify = true) {
  if (state.isGenerating) return;

  const newId = 'session_' + Date.now();
  const newSession = {
    id: newId,
    title: 'Nouvelle discussion',
    createdAt: Date.now(),
    model: state.activeModel,
    messages: []
  };

  state.sessions.unshift(newSession);
  state.currentSessionId = newId;
  saveSessionsToStorage();

  renderWelcomeScreen();
  renderRecentsList();

  if (notify) {
    showToast('Nouvelle discussion démarrée');
  }

  // Focus sur l'input
  const input = document.getElementById('chat-input');
  if (input) input.focus();
}

function loadSession(sessionId) {
  if (state.isGenerating) return;

  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;

  state.currentSessionId = sessionId;
  state.activeModel = session.model || state.activeModel;
  updateActiveModelUI(state.activeModel);

  const container = document.getElementById('main-content-view');
  container.innerHTML = '';

  if (!session.messages || session.messages.length === 0) {
    renderWelcomeScreen();
  } else {
    session.messages.forEach(msg => {
      if (msg.role === 'user') {
        appendUserMessageToDOM(msg.content, false);
      } else {
        appendAIMessageToDOM(msg.content, false);
      }
    });
    scrollToBottom();
  }

  renderRecentsList();
}

function deleteSession(sessionId, event) {
  if (event) event.stopPropagation();

  state.sessions = state.sessions.filter(s => s.id !== sessionId);
  saveSessionsToStorage();

  if (state.currentSessionId === sessionId) {
    if (state.sessions.length > 0) {
      loadSession(state.sessions[0].id);
    } else {
      startNewChat(false);
    }
  } else {
    renderRecentsList();
  }

  showToast('Discussion supprimée');
}

function renderRecentsList() {
  const recentsContainer = document.getElementById('recent-chats-list');
  const countBadge = document.getElementById('recent-chats-count');

  if (countBadge) {
    countBadge.innerText = state.sessions.length;
  }

  if (!recentsContainer) return;

  if (state.sessions.length === 0) {
    recentsContainer.innerHTML = `
      <div class="px-3 py-2 text-[11px] text-slate-500 italic">
        Aucune discussion récente
      </div>
    `;
    return;
  }

  recentsContainer.innerHTML = state.sessions.slice(0, 15).map(session => {
    const isActive = session.id === state.currentSessionId;
    return `
      <div onclick="loadSession('${session.id}')" 
           class="group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
             isActive 
               ? 'bg-white/15 text-cyan-300 font-semibold border border-cyan-400/30 shadow-[0_0_12px_rgba(0,240,255,0.15)]' 
               : 'text-slate-300 hover:bg-white/5 hover:text-white'
           }">
        <div class="flex items-center gap-2 truncate pr-1">
          <i data-lucide="message-square" class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}"></i>
          <span class="truncate">${escapeHTML(session.title)}</span>
        </div>
        <button onclick="deleteSession('${session.id}', event)" 
                title="Supprimer la discussion"
                class="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-1 rounded transition shrink-0">
          <i data-lucide="trash-2" class="w-3 h-3"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ============================================================================
// 2. RENDU MARKDOWN & COLORATION SYNTAXIQUE
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

function parseMarkdown(text) {
  if (!window.marked) return escapeHTML(text);

  let rawHTML = marked.parse(text);

  // Remplacement des balises <pre><code> par notre composant stylisé avec bouton copier
  rawHTML = rawHTML.replace(/<pre><code class="language-([a-zA-Z0-9_\-]+)">([\s\S]*?)<\/code><\/pre>/g, (match, lang, codeContent) => {
    const rawCode = decodeHTMLEntities(codeContent.replace(/<[^>]*>?/gm, ''));
    const encodedRawCode = encodeURIComponent(rawCode);
    return `
      <div class="code-block-wrapper">
        <div class="code-header">
          <span class="font-mono text-cyan-400 uppercase text-[11px] font-bold">${escapeHTML(lang)}</span>
          <button onclick="copyCode(this, '${encodedRawCode}')" class="copy-code-btn">
            <i data-lucide="copy" class="w-3 h-3"></i>
            <span>Copier</span>
          </button>
        </div>
        <pre><code class="hljs language-${lang}">${codeContent}</code></pre>
      </div>
    `;
  });

  // Nettoyage de sécurité XSS via DOMPurify si présent
  if (window.DOMPurify) {
    return DOMPurify.sanitize(rawHTML, {
      ADD_ATTR: ['target', 'onclick', 'data-lucide']
    });
  }

  return rawHTML;
}

function copyCode(btnElement, encodedCode) {
  const code = decodeURIComponent(encodedCode);
  navigator.clipboard.writeText(code).then(() => {
    const originalHTML = btnElement.innerHTML;
    btnElement.innerHTML = `
      <i data-lucide="check" class="w-3 h-3 text-emerald-400"></i>
      <span class="text-emerald-400">Copié !</span>
    `;
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
      btnElement.innerHTML = originalHTML;
      if (window.lucide) lucide.createIcons();
    }, 2000);
  }).catch(() => {
    showToast('Erreur lors de la copie du code');
  });
}

// ============================================================================
// 3. SOUMISSION DU CHAT & STREAMING SSE EN DIRECT
// ============================================================================

async function handleChatSubmit(e) {
  if (e) e.preventDefault();

  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || state.isGenerating) return;

  input.value = '';
  state.isGenerating = true;
  toggleInputState(true);

  // S'assurer qu'une session existe
  let session = getCurrentSession();
  if (!session) {
    startNewChat(false);
    session = getCurrentSession();
  }

  // Renommer la session au premier message
  if (session.messages.length === 0) {
    session.title = message.length > 32 ? message.substring(0, 32) + '...' : message;
    saveSessionsToStorage();
  }

  // Sauvegarde du message utilisateur
  session.messages.push({
    role: 'user',
    content: message,
    timestamp: Date.now()
  });
  saveSessionsToStorage();

  // Affichage du message utilisateur
  appendUserMessageToDOM(message, true);

  // Préparation du conteneur de réponse IA
  const aiMessageElement = createAIMessageElement();
  const contentBody = aiMessageElement.querySelector('.ai-markdown-content');
  const cursor = aiMessageElement.querySelector('.streaming-cursor');

  let accumulatedText = '';

  try {
    // Appel à l'API Serverless sécurisée
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        messages: session.messages,
        model: state.activeModel
      })
    });

    if (!response.ok) {
      let errDetail = 'Erreur lors de la communication avec l\'IA';
      try {
        const errJson = await response.json();
        errDetail = errJson.error || errDetail;
      } catch (_) {}
      throw new Error(errDetail);
    }

    // Lecture du flux SSE
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
            contentBody.innerHTML = parseMarkdown(accumulatedText);
            scrollToBottom();
          } else if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch (errParse) {
          // Fragment JSON partiel ou non standard
        }
      }
    }

  } catch (error) {
    console.error('[SUNTY CLIENT] Erreur de génération:', error);
    accumulatedText = `⚠️ **Une erreur est survenue :** ${error.message || 'Impossible d\'obtenir une réponse du modèle.'}`;
    contentBody.innerHTML = parseMarkdown(accumulatedText);
    showToast('Erreur: ' + (error.message || 'Échec de la requête'));
  } finally {
    // Retrait du curseur de frappe
    if (cursor) cursor.remove();
    state.isGenerating = false;
    toggleInputState(false);

    // Sauvegarde de la réponse dans la session
    session.messages.push({
      role: 'model',
      content: accumulatedText,
      timestamp: Date.now()
    });
    saveSessionsToStorage();

    // Actualisation des icônes Lucide pour les boutons copier
    if (window.lucide) lucide.createIcons();
    scrollToBottom();
  }
}

function sendQuickPrompt(promptText) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = promptText;
    handleChatSubmit(new Event('submit'));
  }
}

// ============================================================================
// 4. ÉLÉMENTS DU DOM & AFFICHAGE DU CHAT
// ============================================================================

function renderWelcomeScreen() {
  const container = document.getElementById('main-content-view');
  container.innerHTML = `
    <div class="glass-card rounded-3xl p-8 md:p-12 text-center space-y-5 fade-in-up max-w-2xl mx-auto shadow-2xl">
      <div class="w-16 h-16 mx-auto flex items-center justify-center drop-shadow-[0_0_25px_rgba(0,240,255,0.8)] hover:scale-105 transition duration-300">
        ${SUNTY_LOGO_SVG}
      </div>
      <div>
        <h2 class="text-2xl font-black tracking-tight text-slate-900">Que puis-je faire pour vous aujourd'hui ?</h2>
        <p class="text-xs text-slate-600 max-w-md mx-auto leading-relaxed mt-2">
          Sunty combine la puissance des modèles IA de pointe avec une interface moderne, du streaming ultra-fluide et une sécurité renforcée.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-left">
        <button onclick="sendQuickPrompt('Explique-moi les avantages d\\'un site IA autonome avec API')" class="glass-widget p-3 rounded-2xl flex items-center gap-3 group text-xs font-semibold text-slate-800">
          <div class="w-8 h-8 rounded-xl bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-600 shrink-0 group-hover:rotate-6 transition">
            <i data-lucide="zap" class="w-4 h-4"></i>
          </div>
          <span>Pourquoi créer son propre site IA ?</span>
        </button>

        <button onclick="sendQuickPrompt('Génère un script Python pour analyser des données CSV')" class="glass-widget p-3 rounded-2xl flex items-center gap-3 group text-xs font-semibold text-slate-800">
          <div class="w-8 h-8 rounded-xl bg-fuchsia-100 border border-fuchsia-200 flex items-center justify-center text-fuchsia-600 shrink-0 group-hover:rotate-6 transition">
            <i data-lucide="code" class="w-4 h-4"></i>
          </div>
          <span>Générer du code Python</span>
        </button>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function appendUserMessageToDOM(text, isAnimated = true) {
  const container = document.getElementById('main-content-view');
  
  // Retirer l'écran de bienvenue si présent
  const welcomeCard = container.querySelector('.text-center');
  if (welcomeCard) welcomeCard.remove();

  const userDiv = document.createElement('div');
  userDiv.className = `flex justify-end gap-3 items-start ${isAnimated ? 'fade-in-up' : ''}`;
  userDiv.innerHTML = `
    <div class="bg-sky-200/90 backdrop-blur-md text-slate-900 rounded-3xl rounded-tr-sm px-6 py-3.5 max-w-xl text-sm font-medium leading-relaxed border border-sky-300/80 shadow-md">
      ${escapeHTML(text)}
    </div>
    <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1 shadow-md border border-white/60">
      👤
    </div>
  `;
  container.appendChild(userDiv);
  scrollToBottom();
}

function appendAIMessageToDOM(content, isAnimated = true) {
  const container = document.getElementById('main-content-view');
  const aiDiv = document.createElement('div');
  aiDiv.className = `glass-card rounded-3xl p-6 md:p-8 space-y-4 ${isAnimated ? 'fade-in-up' : ''}`;
  aiDiv.innerHTML = `
    <div class="flex items-start gap-4">
      <div class="w-8 h-8 flex items-center justify-center shrink-0 drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
        ${SUNTY_LOGO_SVG}
      </div>
      <div class="space-y-2 pt-0.5 flex-1 overflow-hidden">
        <div class="markdown-body">
          ${parseMarkdown(content)}
        </div>
      </div>
    </div>
  `;
  container.appendChild(aiDiv);
}

function createAIMessageElement() {
  const container = document.getElementById('main-content-view');
  const aiDiv = document.createElement('div');
  aiDiv.className = 'glass-card rounded-3xl p-6 md:p-8 space-y-4 fade-in-up';
  aiDiv.innerHTML = `
    <div class="flex items-start gap-4">
      <div class="w-8 h-8 flex items-center justify-center shrink-0 drop-shadow-[0_0_10px_rgba(0,240,255,0.6)] animate-pulse">
        ${SUNTY_LOGO_SVG}
      </div>
      <div class="space-y-2 pt-0.5 flex-1 overflow-hidden">
        <div class="markdown-body ai-markdown-content inline"></div>
        <span class="streaming-cursor"></span>
      </div>
    </div>
  `;
  container.appendChild(aiDiv);
  scrollToBottom();
  return aiDiv;
}

function toggleInputState(disabled) {
  const input = document.getElementById('chat-input');
  const submitBtn = document.getElementById('chat-submit-btn');

  if (input) input.disabled = disabled;
  if (submitBtn) {
    submitBtn.disabled = disabled;
    if (disabled) {
      submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

function scrollToBottom() {
  const chat = document.getElementById('chat-container');
  if (chat) {
    chat.scrollTo({
      top: chat.scrollHeight,
      behavior: 'smooth'
    });
  }
}

// ============================================================================
// 5. GESTION DES MODÈLES & THÈMES
// ============================================================================

function selectModel(modelName) {
  state.activeModel = modelName;
  updateActiveModelUI(modelName);

  const session = getCurrentSession();
  if (session) {
    session.model = modelName;
    saveSessionsToStorage();
  }

  showToast(`Modèle actif : ${modelName}`);
}

function updateActiveModelUI(modelName) {
  document.querySelectorAll('.model-btn').forEach(btn => {
    btn.classList.remove('border-cyan-400', 'bg-white/90', 'shadow-[0_0_15px_rgba(0,240,255,0.2)]');
    const badge = btn.querySelector('.active-model-indicator');
    if (badge) badge.remove();
  });

  const selected = document.querySelector(`[data-model="${modelName}"]`);
  if (selected) {
    selected.classList.add('border-cyan-400', 'bg-white/90', 'shadow-[0_0_15px_rgba(0,240,255,0.2)]');
    selected.insertAdjacentHTML('beforeend', '<span class="active-model-indicator w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>');
  }
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  showToast(isDark ? 'Mode Sombre activé' : 'Mode Lumineux activé');

  const themeIcon = document.getElementById('theme-toggle-icon');
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', isDark ? 'moon' : 'sun');
    if (window.lucide) lucide.createIcons();
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark') {
    document.body.classList.add('dark-mode');
    const themeIcon = document.getElementById('theme-toggle-icon');
    if (themeIcon) {
      themeIcon.setAttribute('data-lucide', 'moon');
    }
  }
}

// ============================================================================
// 6. MODALES & NOTIFICATIONS
// ============================================================================

function openProModal() {
  const modal = document.getElementById('pro-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeProModal() {
  const modal = document.getElementById('pro-modal');
  if (modal) modal.classList.add('hidden');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;

  toastMsg.innerText = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 2800);
}

// Navigation par onglets
function switchTab(e, tabId) {
  if (e) e.preventDefault();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('bg-white/15', 'text-white', 'border', 'border-cyan-400/30', 'shadow-[0_0_15px_rgba(0,240,255,0.15)]');
    item.classList.add('text-slate-300', 'hover:bg-white/10');
    const indicator = item.querySelector('.bg-cyan-400');
    if (indicator) indicator.remove();
  });

  const clicked = e?.currentTarget;
  if (clicked) {
    clicked.classList.add('bg-white/15', 'text-white', 'border', 'border-cyan-400/30', 'shadow-[0_0_15px_rgba(0,240,255,0.15)]');
    clicked.insertAdjacentHTML('afterbegin', '<span class="w-1.5 h-5 bg-cyan-400 rounded-full absolute left-0 shadow-[0_0_8px_#22d3ee]"></span>');
  }

  if (tabId === 'recents') {
    showToast(`Historique : ${state.sessions.length} discussions trouvées`);
  } else if (tabId === 'projets') {
    showToast('Section Projets (en développement)');
  } else if (tabId === 'bibliotheque') {
    showToast('Bibliothèque de prompts et documents');
  } else {
    showToast(`Section ${tabId} activée`);
  }
}

// Fonctions utilitaires
function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function decodeHTMLEntities(text) {
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}
