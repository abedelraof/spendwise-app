const crypto = require('crypto');

const KEY = crypto.scryptSync(process.env.JWT_SECRET || 'fallback_key', 'expense_tracker_salt', 32);
const ALGO = 'aes-256-gcm';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
