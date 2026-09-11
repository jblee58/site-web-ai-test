// ============================================================================
// SUNTY AI 1.0 - APPLICATION JAVASCRIPT FRONTEND
// Multimodalité, Cycle de vie des discussions, Streaming SSE & Formatage Maquette
// ============================================================================

const STORAGE_KEY = 'sunty_chat_sessions_v2';
const THEME_KEY = 'sunty_theme_preference';

// État global de l'application
const state = {
  currentSessionId: null, // null = session vierge non enregistrée
  isGenerating: false,
  pendingFiles: [], // Pièces jointes prêtes à être envoyées [{ name, mimeType, data }]
  sessions: []
};

// SVG Officiel du Logo Sunty Spiral 3D
const SUNTY_LOGO_SVG = `
  <svg viewBox="0 0 100 100" class="w-full h-full" fill="none">
    <path d="M 72 26 C 72 14, 44 12, 30 24 C 12 38, 18 58, 44 58 C 74 58, 84 76, 68 90 C 50 104, 22 92, 22 78" 
          stroke="url(#suntyLogoGrad)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadSessionsFromStorage();
  initMarked();
  setupFileUploadListener();
  renderRecentsList();

  if (state.sessions.length > 0) {
    loadSession(state.sessions[0].id);
  } else {
    renderWelcomeHero();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
});

// ============================================================================
// 1. GESTION DES SESSIONS & LOCALSTORAGE (STYLE GEMINI/CHATGPT)
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
  if (!state.currentSessionId) return null;
  return state.sessions.find(s => s.id === state.currentSessionId);
}

/**
 * Démarre un nouveau chat :
 * Ouvre simplement une vue vierge SANS créer d'entrée dans les discussions récentes !
 */
function startNewChat(notify = true) {
  if (state.isGenerating) return;

  state.currentSessionId = null;
  clearPendingFiles();

  const input = document.getElementById('chat-input');
  if (input) {
    input.value = '';
    input.focus();
  }

  renderWelcomeHero();
  renderRecentsList();

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
      <div class="px-3 py-3 text-[11px] text-slate-500 italic">
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
               ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-400/40 shadow-[0_0_15px_rgba(0,240,255,0.15)]' 
               : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
           }">
        <div class="flex items-center gap-2.5 truncate pr-1">
          <span class="w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-600'}"></span>
          <span class="truncate">${escapeHTML(session.title)}</span>
        </div>
        <button onclick="deleteSession('${session.id}', event)" 
                title="Supprimer la discussion"
                class="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-1 rounded transition shrink-0">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ============================================================================
// 2. GESTION DES FICHIERS & MULTIMODALITÉ
// ============================================================================

function setupFileUploadListener() {
  const fileInput = document.getElementById('file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        showToast(`Fichier trop lourd : ${file.name} (max 10 Mo)`);
        continue;
      }

      try {
        const base64Data = await readFileAsBase64(file);
        state.pendingFiles.push({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64Data
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
  container.innerHTML = state.pendingFiles.map((file, idx) => {
    const isImage = file.mimeType.startsWith('image/');
    return `
      <div class="attachment-chip flex items-center gap-2">
        ${isImage 
          ? `<img src="${file.data}" class="w-6 h-6 rounded object-cover border border-cyan-400/40" />`
          : `<i data-lucide="file-text" class="w-4 h-4 text-cyan-400"></i>`
        }
        <span class="max-w-[140px] truncate text-[11px] font-medium">${escapeHTML(file.name)}</span>
        <button type="button" onclick="removePendingFile(${idx})" class="hover:text-rose-400 p-0.5 rounded transition">
          <i data-lucide="x" class="w-3 h-3"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function removePendingFile(index) {
  state.pendingFiles.splice(index, 1);
  renderFilePreview();
}

function clearPendingFiles() {
  state.pendingFiles = [];
  renderFilePreview();
}

// ============================================================================
// 3. ENVOI DE MESSAGES & STREAMING SSE AVEC SUNTYAI 1.0
// ============================================================================

async function handleChatSubmit(e) {
  if (e) e.preventDefault();

  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  const filesToSend = [...state.pendingFiles];

  if ((!message && filesToSend.length === 0) || state.isGenerating) return;

  input.value = '';
  clearPendingFiles();
  state.isGenerating = true;
  toggleInputState(true);

  // Si c'est le tout premier message, on crée officiellement la session
  let session = getCurrentSession();
  if (!session) {
    const newId = 'session_' + Date.now();
    const titleText = message || filesToSend[0]?.name || 'Nouvelle discussion';
    session = {
      id: newId,
      title: titleText.length > 35 ? titleText.substring(0, 35) + '...' : titleText,
      createdAt: Date.now(),
      messages: []
    };
    state.sessions.unshift(session);
    state.currentSessionId = newId;
    saveSessionsToStorage();
  }

  // Sauvegarde du message utilisateur dans la session
  session.messages.push({
    role: 'user',
    content: message,
    files: filesToSend,
    timestamp: Date.now()
  });
  saveSessionsToStorage();

  // Affichage du message utilisateur dans le DOM
  appendUserMessageToDOM(message, filesToSend, true);

  // Préparation du conteneur de réponse SuntyAI 1.0
  const aiMessageElement = createAIMessageElement();
  const contentBody = aiMessageElement.querySelector('.ai-markdown-content');
  const cursor = aiMessageElement.querySelector('.streaming-cursor');

  let accumulatedText = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        messages: session.messages,
        files: filesToSend
      })
    });

    if (!response.ok) {
      let errDetail = 'Erreur lors de la communication avec SuntyAI 1.0';
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
            contentBody.innerHTML = formatSuntyMarkdown(accumulatedText);
            scrollToBottom();
          } else if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch (errParse) {}
      }
    }

  } catch (error) {
    console.error('[SUNTY CLIENT] Erreur:', error);
    accumulatedText = `⚠️ **Erreur :** ${error.message || 'Impossible d\'obtenir une réponse de SuntyAI 1.0.'}`;
    contentBody.innerHTML = formatSuntyMarkdown(accumulatedText);
    showToast('Erreur: ' + (error.message || 'Échec de génération'));
  } finally {
    if (cursor) cursor.remove();
    state.isGenerating = false;
    toggleInputState(false);

    // Sauvegarde de la réponse IA
    session.messages.push({
      role: 'model',
      content: accumulatedText,
      timestamp: Date.now()
    });
    saveSessionsToStorage();

    if (window.lucide) lucide.createIcons();
    scrollToBottom();
  }
}

// Pré-remplir le champ de saisie lors d'un clic sur une suggestion (sans bloquer)
function insertPromptAction(prefixText) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = prefixText;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

// ============================================================================
// 4. RENDU VISUEL & COMPOSANTS SUNTY
// ============================================================================

function renderWelcomeHero() {
  const container = document.getElementById('main-content-view');
  container.innerHTML = `
    <div class="max-w-2xl mx-auto text-center space-y-6 pt-12 md:pt-20 fade-in-up">
      
      <!-- Logo Sunty Ribbon 3D Animé -->
      <div class="w-20 h-20 mx-auto flex items-center justify-center sunty-logo-glow">
        ${SUNTY_LOGO_SVG}
      </div>

      <!-- Titre d'accueil épuré -->
      <div class="space-y-2">
        <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight text-white drop-shadow-md">
          Que puis-je faire pour toi aujourd'hui ?
        </h1>
        <p class="text-xs text-slate-400 font-medium">
          SuntyAI 1.0 créé et développé par <span class="text-cyan-400 font-bold">SuntyraXx</span>
        </p>
      </div>

    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

function appendUserMessageToDOM(text, files = [], isAnimated = true) {
  const container = document.getElementById('main-content-view');
  
  // Retirer l'écran d'accueil si présent
  const welcomeHero = container.querySelector('.text-center');
  if (welcomeHero) welcomeHero.remove();

  const userDiv = document.createElement('div');
  userDiv.className = `flex justify-end gap-3 items-start ${isAnimated ? 'fade-in-up' : ''}`;

  let filesHTML = '';
  if (Array.isArray(files) && files.length > 0) {
    filesHTML = `
      <div class="flex flex-wrap gap-2 mb-2">
        ${files.map(f => {
          if (f.mimeType && f.mimeType.startsWith('image/')) {
            return `<img src="${f.data}" class="w-28 h-20 object-cover rounded-xl border border-cyan-400/40 shadow-md" />`;
          }
          return `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/20 text-xs text-cyan-200">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
              <span class="truncate max-w-[150px]">${escapeHTML(f.name)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  userDiv.innerHTML = `
    <div class="user-bubble">
      ${filesHTML}
      <div>${escapeHTML(text)}</div>
    </div>
    <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1 shadow-md border border-white/40">
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
      <div class="w-8 h-8 flex items-center justify-center shrink-0 sunty-logo-glow mt-0.5">
        ${SUNTY_LOGO_SVG}
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
      <div class="w-8 h-8 flex items-center justify-center shrink-0 sunty-logo-glow mt-0.5">
        ${SUNTY_LOGO_SVG}
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
// 5. MARKDOWN, SYNTAX HIGHLIGHTING & MISE EN FORME MAQUETTE
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

  // Remplacement des blocs de code avec en-tête stylisé et bouton Copier
  html = html.replace(/<pre><code class="language-([a-zA-Z0-9_\-]+)">([\s\S]*?)<\/code><\/pre>/g, (match, lang, codeContent) => {
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

  // Mise en valeur de la section "En résumé" sous forme de carte élégante comme sur la maquette
  html = html.replace(/<blockquote>\s*<p>\s*<strong>En résumé :<\/strong>([\s\S]*?)<\/p>\s*<\/blockquote>/gi, (match, summaryText) => {
    const cleanText = summaryText.trim();
    return `
      <div class="sunty-summary-card">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 flex items-center justify-center shrink-0 drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]">
            ${SUNTY_LOGO_SVG}
          </div>
          <p class="text-xs font-semibold text-slate-200 leading-relaxed">
            <span class="text-cyan-300 font-bold">En résumé :</span> ${cleanText}
          </p>
        </div>
        <button onclick="copySummary(this, '${encodeURIComponent(cleanText)}')" title="Copier le résumé" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-slate-200 hover:text-white transition shrink-0 active:scale-95">
          <i data-lucide="arrow-right" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  });

  // Nettoyage XSS via DOMPurify
  if (window.DOMPurify) {
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['target', 'onclick', 'data-lucide']
    });
  }

  return html;
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
    showToast('Erreur lors de la copie');
  });
}

function copySummary(btnElement, encodedText) {
  const text = decodeURIComponent(encodedText);
  navigator.clipboard.writeText(text).then(() => {
    showToast('Résumé copié dans le presse-papier !');
  });
}

// ============================================================================
// 6. THÈME, OUTILS & NAVIGATION
// ============================================================================

function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  showToast(isLight ? 'Thème Clair activé' : 'Thème Sombre activé');

  const themeIcon = document.getElementById('theme-toggle-icon');
  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
    if (window.lucide) lucide.createIcons();
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    const themeIcon = document.getElementById('theme-toggle-icon');
    if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
  }
}

function switchTab(e, tabId) {
  if (e) e.preventDefault();

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('bg-white/10', 'text-white', 'border', 'border-cyan-400/30', 'shadow-[0_0_15px_rgba(0,240,255,0.15)]');
    item.classList.add('text-slate-400', 'hover:bg-white/5');
    const indicator = item.querySelector('.bg-cyan-400');
    if (indicator) indicator.remove();
  });

  const clicked = e?.currentTarget;
  if (clicked) {
    clicked.classList.add('bg-white/10', 'text-white', 'border', 'border-cyan-400/30', 'shadow-[0_0_15px_rgba(0,240,255,0.15)]');
    clicked.insertAdjacentHTML('afterbegin', '<span class="w-1.5 h-4 bg-cyan-400 rounded-full absolute left-0 shadow-[0_0_8px_#22d3ee]"></span>');
  }

  if (tabId === 'accueil') {
    // Si aucune discussion active, hero d'accueil
    if (!state.currentSessionId) renderWelcomeHero();
  } else {
    showToast(`Section ${tabId} activée`);
  }
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

function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;

  toastMsg.innerText = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 2500);
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
