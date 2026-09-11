// ============================================================================
// SUNTY AI - BACKEND SERVERLESS FUNCTION (/api/chat)
// Compatible Vercel Serverless Function & Express (Local Dev)
// ============================================================================

// Rate limiter en mémoire pour limiter les abus par adresse IP
const ipRequestHistory = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 requêtes par minute par IP

// Nettoyage régulier du cache de rate limit
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestHistory.entries()) {
    if (now - data.startTime > RATE_LIMIT_WINDOW_MS * 2) {
      ipRequestHistory.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipRequestHistory.get(ip) || { count: 0, startTime: now };

  if (now - entry.startTime > RATE_LIMIT_WINDOW_MS) {
    entry.count = 1;
    entry.startTime = now;
    ipRequestHistory.set(ip, entry);
    return { allowed: true };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((entry.startTime + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count += 1;
  ipRequestHistory.set(ip, entry);
  return { allowed: true };
}

// Résolution du modèle Gemini réel et du System Prompt selon le choix de l'utilisateur
function resolveModelConfig(selectedModel) {
  const defaultModel = process.env.DEFAULT_MODEL || 'gemini-3.8-flash';
  const modelLower = (selectedModel || '').toLowerCase();

  let geminiModelName = defaultModel;
  let systemPersona = "Tu es Sunty, un assistant d'intelligence artificielle intelligent, chaleureux, rapide et précis. Tu structures toujours tes réponses avec un Markdown élégant, des titres clairs, des puces et des blocs de code avec coloration lorsque pertinent.";

  if (selectedModel && selectedModel.startsWith('gemini-')) {
    geminiModelName = selectedModel;
  } else if (modelLower.includes('gpt-4o')) {
    geminiModelName = defaultModel;
    systemPersona = "Tu es Sunty alimenté par une configuration haute performance polyvalente (style GPT-4o). Réponds de manière complète, structurée et logique.";
  } else if (modelLower.includes('claude')) {
    geminiModelName = defaultModel;
    systemPersona = "Tu es Sunty alimenté par une configuration ultra-créative et littéraire (style Claude 3.5). Soigne particulièrement l'élégance du style et la clarté explicative.";
  } else if (modelLower.includes('llama')) {
    geminiModelName = defaultModel;
    systemPersona = "Tu es Sunty alimenté par une configuration axée sur le code et les données brutes (style Llama 3.1). Sois concis, direct et technique.";
  } else if (modelLower.includes('gemini')) {
    geminiModelName = defaultModel;
  }

  return { geminiModelName, systemPersona };
}

module.exports = async function handler(req, res) {
  // 1. Protection CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Méthode non autorisée. Utilisez la méthode POST.'
    });
  }

  // 2. Récupération & Vérification de l'adresse IP pour le Rate Limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.socket?.remoteAddress || 
                   '127.0.0.1';

  const limitCheck = checkRateLimit(clientIp);
  if (!limitCheck.allowed) {
    return res.status(429).json({
      error: `Trop de requêtes. Veuillez patienter ${limitCheck.retryAfter} secondes avant de réessayer.`
    });
  }

const { decryptKey } = require('../utils/crypto');

  // 3. Vérification & Déchiffrement sécurisé de la clé d'API
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[SUNTY BACKEND] Erreur: GEMINI_API_KEY manquante dans les variables d\'environnement.');
    return res.status(500).json({
      error: "Clé d'API Gemini manquante côté serveur. Veuillez définir GEMINI_API_KEY dans le fichier .env ou les paramètres Vercel."
    });
  }

  // Déchiffrement à la volée en mémoire si la clé a été chiffrée
  if (apiKey.startsWith('enc:')) {
    const secret = process.env.ENCRYPTION_SECRET || 'sunty-secure-vault-passphrase-2026';
    try {
      apiKey = decryptKey(apiKey, secret);
    } catch (err) {
      console.error('[SUNTY BACKEND] Erreur lors du déchiffrement de la clé API:', err.message);
      return res.status(500).json({
        error: "Erreur de déchiffrement de la clé d'API. Assurez-vous que ENCRYPTION_SECRET est correct."
      });
    }
  }

  // 4. Validation des entrées utilisateur
  const { message, messages, model } = req.body || {};

  if (!message && (!messages || !Array.isArray(messages) || messages.length === 0)) {
    return res.status(400).json({
      error: 'Requête invalide: un message ou un historique de messages est requis.'
    });
  }

  const { geminiModelName, systemPersona } = resolveModelConfig(model);

  // 5. Préparation de l'historique de conversation (Multi-turn Context)
  let conversationContents = [];

  if (Array.isArray(messages) && messages.length > 0) {
    // Ne garder que les 16 derniers messages pour préserver le contexte sans surcharger
    const recentMessages = messages.slice(-16);
    conversationContents = recentMessages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(msg.content || msg.text || '') }]
    }));
  } else {
    conversationContents = [
      {
        role: 'user',
        parts: [{ text: String(message) }]
      }
    ];
  }

  // Payload conforme à l'API Google Gemini
  const geminiPayload = {
    contents: conversationContents,
    systemInstruction: {
      parts: [{ text: systemPersona }]
    },
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 4096
    }
  };

  // 6. Appel streaming à l'API Google Generative Language
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelName}:streamGenerateContent?alt=sse&key=${apiKey}`;

  try {
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(geminiPayload)
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error('[SUNTY BACKEND] Erreur Google Gemini API:', apiResponse.status, errText);

      let parsedErr;
      try { parsedErr = JSON.parse(errText); } catch (_) {}
      const errMsg = parsedErr?.error?.message || `Erreur API Gemini (${apiResponse.status})`;

      return res.status(apiResponse.status).json({
        error: errMsg
      });
    }

    // 7. Envoi de la réponse en Server-Sent Events (SSE) en temps réel
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (res.flushHeaders) {
      res.flushHeaders();
    }

    const reader = apiResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Garde la ligne incomplète en tampon

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataContent = trimmed.substring(5).trim();
        if (dataContent === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataContent);
          const parts = parsed?.candidates?.[0]?.content?.parts;
          if (parts && Array.isArray(parts)) {
            for (const part of parts) {
              if (part.text) {
                // Envoi du fragment au Frontend
                res.write(`data: ${JSON.stringify({ text: part.text })}\n\n`);
                if (res.flush) res.flush();
              }
            }
          }
        } catch (e) {
          // Ligne partielle ou format non standard, ignorée
        }
      }
    }

    // Fin du flux
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('[SUNTY BACKEND] Exception pendant le streaming:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Une erreur interne est survenue lors de la communication avec l'IA."
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
};
