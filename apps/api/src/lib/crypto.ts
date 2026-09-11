import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSha256Hex(secret: string, input: string | Buffer): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

/**
 * Constant-time comparison of two hex strings. Returns false when the lengths
 * differ (no information is leaked that timing attacks could exploit).
 */
export function secureEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), 'utf8');
  const bufB = Buffer.from(b.toLowerCase(), 'utf8');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Outgoing webhook signature, shared by the delivery worker and documented for
 * webhook consumers:
 *
 *   X-Nexora-Signature: sha256=<hex>
 *   X-Nexora-Signature = HMAC-SHA256(endpointSecret, `${timestamp}.${rawBody}`)
 *   X-Nexora-Timestamp = unix seconds at delivery time
 *
 * Consumers should verify the signature AND reject timestamps older than a few
 * minutes to prevent replay attacks.
 */
export function signWebhookDelivery(secret: string, timestamp: number, rawBody: string): string {
  return hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
}

// ============================================================================
// Envelope encryption for stored secrets (webhook endpoint signing secrets)
// ============================================================================

/**
 * Encrypt a secret for at-rest storage (AES-256-GCM). The key is derived from
 * ENCRYPTION_KEY (any length accepted, normalised to 32 bytes via sha256), so
 * rotating ENCRYPTION_KEY invalidates stored secrets rather than silently
 * decrypting with a different key.
 *
 * Output format: v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
 */
export function encryptSecret(encryptionKey: string, plaintext: string): string {
  const key = createHash('sha256').update(encryptionKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypt a secret stored with encryptSecret. Returns null for values that are
 * not in the encrypted format (e.g. legacy plaintext rows), so callers can
 * decide how to handle them.
 */
export function decryptSecret(encryptionKey: string, stored: string): string | null {
  if (!stored.startsWith('v1:')) return null;
  const parts = stored.split(':');
  if (parts.length !== 4) return null;
  try {
    const key = createHash('sha256').update(encryptionKey).digest();
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const ciphertext = Buffer.from(parts[3], 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
