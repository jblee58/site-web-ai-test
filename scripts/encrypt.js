// ============================================================================
// SCRIPT UTILITAIRE : CHIFFRER LA CLÉ D'API DANS LE FICHIER .ENV
// Exécution : node scripts/encrypt.js
// ============================================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { encryptKey } = require('../utils/crypto');

const envPath = path.join(__dirname, '..', '.env');
const rawKey = process.env.GEMINI_API_KEY;
const secretPassphrase = process.env.ENCRYPTION_SECRET || 'sunty-secure-vault-passphrase-2026';

if (!rawKey) {
  console.error("❌ Erreur: Aucune GEMINI_API_KEY trouvée dans le fichier .env");
  process.exit(1);
}

if (rawKey.startsWith('enc:')) {
  console.log("ℹ️ La clé GEMINI_API_KEY dans .env est DÉJÀ chiffrée en AES-256-GCM :");
  console.log(rawKey);
  process.exit(0);
}

const encrypted = encryptKey(rawKey, secretPassphrase);

// Mise à jour de .env
let envContent = fs.readFileSync(envPath, 'utf8');
envContent = envContent.replace(
  new RegExp(`GEMINI_API_KEY=.*`),
  `GEMINI_API_KEY=${encrypted}`
);

if (!envContent.includes('ENCRYPTION_SECRET=')) {
  envContent += `\n# Phrase secrète de déchiffrement AES-256-GCM\nENCRYPTION_SECRET=${secretPassphrase}\n`;
}

fs.writeFileSync(envPath, envContent, 'utf8');

console.log('------------------------------------------------------------');
console.log('🔒 SUCCÈS : Votre clé API Gemini a été chiffrée avec succès !');
console.log('------------------------------------------------------------');
console.log('Clé chiffrée (AES-256-GCM) enregistrée dans votre .env :');
console.log(`GEMINI_API_KEY=${encrypted}`);
console.log('\nPersonne ne peut voler votre vraie clé en lisant le fichier .env !');
console.log('Le backend Sunty la déchiffre automatiquement en mémoire.');
console.log('------------------------------------------------------------');
