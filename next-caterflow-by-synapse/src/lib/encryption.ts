// src/lib/encryption.ts
// Minimal encryption utilities for archive backup
// Uses AES‑256‑GCM with a 32‑byte base64‑encoded key from ENV (ARCHIVE_ENCRYPTION_KEY)

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const algorithm = 'aes-256-gcm';

// The key is validated LAZILY (inside getKey(), called from encryptData /
// decryptData) rather than at module load time. Previously the `throw` ran
// the instant anything imported this file — since export/route.ts imports
// it unconditionally, a missing/malformed ARCHIVE_ENCRYPTION_KEY crashed
// the ENTIRE /api/archive/export (and /import) function with an opaque,
// hard-to-diagnose module-load exception, before the route handler's own
// try/catch ever got a chance to run and return a clear JSON error. Now the
// same validation happens inside a route handler's try/catch, gets logged
// in full, and returns a proper error response instead of a bare crash.
class EncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionConfigError';
  }
}

function getKey(): Buffer {
  const keyBase64 = process.env.ARCHIVE_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new EncryptionConfigError('ARCHIVE_ENCRYPTION_KEY env var missing');
  }
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new EncryptionConfigError(
      `ARCHIVE_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}) — must be a 32-byte value, base64-encoded`,
    );
  }
  return key;
}

/**
 * Encrypt a string (JSON) and return base64‑encoded ciphertext and IV.
 */
export function encryptData(plain: string) {
  const key = getKey();
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
  const key = getKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const encrypted = Buffer.from(payload.data, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
