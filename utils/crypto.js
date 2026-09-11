// ============================================================================
// MODULE DE CHIFFREMENT MILITAIRE AES-256-GCM POUR SECRETS & CLÉS D'API
// ============================================================================

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

/**
 * Chiffre une chaîne de caractères (ex: clé d'API) en AES-256-GCM
 * @param {string} text - Le texte brut à chiffrer
 * @param {string} secretPassphrase - Phrase secrète de dérivation
 * @returns {string} Format: enc:<iv_hex>:<authTag_hex>:<cipher_hex>
 */
function encryptKey(text, secretPassphrase) {
  if (!text) return '';
  const key = crypto.createHash('sha256').update(String(secretPassphrase)).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Déchiffre une chaîne chiffrée au format enc:...
 * Si la chaîne n'est pas chiffrée, elle est retournée telle quelle (compatibilité ascendante)
 * @param {string} encryptedString - La chaîne enc:iv:tag:data
 * @param {string} secretPassphrase - Phrase secrète
 * @returns {string} Le texte déchiffré
 */
function decryptKey(encryptedString, secretPassphrase) {
  if (!encryptedString || typeof encryptedString !== 'string') return '';
  
  // Si ce n'est pas chiffré, retourner directement
  if (!encryptedString.startsWith('enc:')) {
    return encryptedString;
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 4) {
    throw new Error("Format de clé chiffrée invalide. Attendu: enc:<iv>:<tag>:<data>");
  }

  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const encryptedText = parts[3];

  const key = crypto.createHash('sha256').update(String(secretPassphrase)).digest();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  encryptKey,
  decryptKey
};
