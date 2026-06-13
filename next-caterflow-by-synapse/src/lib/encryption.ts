// src/lib/encryption.ts
// Minimal encryption utilities for archive backup
// Uses AES‑256‑GCM with a 32‑byte base64‑encoded key from ENV (ARCHIVE_ENCRYPTION_KEY)

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const algorithm = 'aes-256-gcm';
const keyBase64 = process.env.ARCHIVE_ENCRYPTION_KEY;
if (!keyBase64) {
  throw new Error('ARCHIVE_ENCRYPTION_KEY env var missing');
}
const key = Buffer.from(keyBase64, 'base64');
if (key.length !== 32) {
  throw new Error('ARCHIVE_ENCRYPTION_KEY must be a 32‑byte base64 string');
}

/**
 * Encrypt a string (JSON) and return base64‑encoded ciphertext and IV.
 */
export function encryptData(plain: string) {
  const iv = randomBytes(12); // 96‑bit IV for GCM
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Return everything base64‑encoded for easy transport
  return {
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt data produced by encryptData.
 */
export function decryptData(payload: { iv: string; data: string; tag: string }) {
  const iv = Buffer.from(payload.iv, 'base64');
  const encrypted = Buffer.from(payload.data, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
