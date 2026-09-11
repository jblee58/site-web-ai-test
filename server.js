// ============================================================================
// SUNTY AI - SERVEUR DE DÉVELOPPEMENT LOCAL (Express + dotenv)
// Lancez simplement : npm run dev
// ============================================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const chatHandler = require('./api/chat');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware pour parser les requêtes JSON
app.use(express.json({ limit: '2mb' }));

// Route API de chat
app.all('/api/chat', (req, res) => {
  return chatHandler(req, res);
});

// Fichiers statiques du Frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback vers index.html pour les routes clientes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log('------------------------------------------------------------');
  console.log('🚀 Sunty AI Web App est prête !');
  console.log(`🌐 Accès local : http://localhost:${PORT}`);
  console.log(`🔑 Clé Gemini : ${process.env.GEMINI_API_KEY ? '✅ Configurée (.env)' : '❌ Manquante'}`);
  console.log(`🤖 Modèle par défaut : ${process.env.DEFAULT_MODEL || 'gemini-3.8-flash'}`);
  console.log('------------------------------------------------------------');
});
