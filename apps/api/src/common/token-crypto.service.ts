import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * ============================================================
 * TokenCryptoService, app-level versleuteling voor OAuth-tokens
 * ============================================================
 *
 * Waarom app-level (en niet pgcrypto in de DB)?
 *   Zo staat de sleutel NIET in de database of in SQL-queries, maar
 *   alleen in de API-omgeving (INTEGRATIONS_ENCRYPTION_KEY). Wie de
 *   database (of een backup) in handen krijgt, heeft niets aan de
 *   ciphertext zonder die sleutel.
 *
 * Algoritme: AES-256-GCM (authenticated encryption) — geeft naast
 * geheimhouding ook integriteit (de auth-tag detecteert geknoei).
 *
 * Formaat van de opgeslagen string: "ivB64.tagB64.cipherB64".
 *
 * Sleutel genereren (32 bytes):  openssl rand -base64 32
 * Zet de uitvoer in INTEGRATIONS_ENCRYPTION_KEY (base64 of hex).
 */
@Injectable()
export class TokenCryptoService {
  private keyCache: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  private key(): Buffer {
    if (this.keyCache) return this.keyCache;

    const raw = this.config.get<string>('INTEGRATIONS_ENCRYPTION_KEY');
    if (!raw) {
      throw new Error(
        'INTEGRATIONS_ENCRYPTION_KEY ontbreekt in .env, nodig om koppeling-tokens te versleutelen.',
      );
    }

    // Accepteer base64 óf hex; beide moeten op 32 bytes uitkomen.
    let buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) buf = Buffer.from(raw, 'hex');
    if (buf.length !== 32) {
      throw new Error(
        'INTEGRATIONS_ENCRYPTION_KEY moet 32 bytes zijn (genereer met: openssl rand -base64 32).',
      );
    }

    this.keyCache = buf;
    return buf;
  }

  /** Versleutelt platte tekst → "ivB64.tagB64.cipherB64". */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // 96-bit nonce, aanbevolen voor GCM
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      tag.toString('base64'),
      enc.toString('base64'),
    ].join('.');
  }

  /** Ontsleutelt "ivB64.tagB64.cipherB64" → platte tekst. */
  decrypt(payload: string): string {
    const [ivB64, tagB64, cipherB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !cipherB64) {
      throw new Error('Ongeldige ciphertext-vorm (verwacht iv.tag.cipher).');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  }
}
