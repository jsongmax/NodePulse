import { describe, it, expect } from 'vitest';
import {
  encryptChannelConfig,
  decryptChannelConfig,
  maskChannelConfig,
} from '../src/auth/aes-gcm.js';
import { webhookUrlSchema } from '@nodepulse/protocol';

describe('M4-T1: AES-GCM Channel Encryption & SSRF URL Validation', () => {
  const masterKey = 'test_master_key_32_bytes_random_dev';

  it('encrypts and decrypts channel config correctly with AAD=record_id', async () => {
    const channelId = 'chan_test123';
    const originalConfig = {
      bot_token: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      chat_id: '-1001234567890',
    };

    const encrypted = await encryptChannelConfig(channelId, originalConfig, masterKey);
    expect(encrypted).toBeInstanceOf(Uint8Array);
    // Header should be v1
    expect(encrypted[0]).toBe(0x76);
    expect(encrypted[1]).toBe(0x31);

    // Decrypt with matching channelId and key
    const decrypted = await decryptChannelConfig(channelId, encrypted, masterKey);
    expect(decrypted).toEqual(originalConfig);

    // Tampering AAD / wrong channelId must fail
    await expect(
      decryptChannelConfig('chan_other_id', encrypted, masterKey)
    ).rejects.toThrow();

    // Tampering ciphertext must fail
    const tampered = new Uint8Array(encrypted);
    tampered[15] ^= 0xff;
    await expect(
      decryptChannelConfig(channelId, tampered, masterKey)
    ).rejects.toThrow();
  });

  it('masks sensitive fields so plaintext is never exposed to UI/API', () => {
    // 1. Telegram
    const tgMasked = maskChannelConfig('telegram', {
      bot_token: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      chat_id: '12345678',
    });
    expect(tgMasked.bot_token).not.toContain('ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
    expect(tgMasked.bot_token).toContain('••••');

    // 2. Discord / Slack
    const discordMasked = maskChannelConfig('discord', {
      webhook_url: 'https://discord.com/api/webhooks/123456789/abcdefghijk_secret_token',
    });
    expect(discordMasked.webhook_url).not.toContain('abcdefghijk_secret_token');
    expect(discordMasked.webhook_url).toContain('••••');

    // 3. Webhook
    const hookMasked = maskChannelConfig('webhook', {
      url: 'https://alert.example.com/webhook/endpoint',
      secret: 'super_secret_signing_key_123',
    });
    expect(hookMasked.secret).toBe('••••••••');
    expect(hookMasked.url).toContain('••••');
  });

  it('strictly rejects non-compliant Webhook URLs (SSRF protection)', () => {
    // Negative cases per requirement:
    // http://, IP literals, localhost, .internal, non-443 port

    // 1. http://
    expect(webhookUrlSchema.safeParse('http://example.com/webhook').success).toBe(false);

    // 2. IP literals (IPv4 & IPv6)
    expect(webhookUrlSchema.safeParse('https://127.0.0.1/webhook').success).toBe(false);
    expect(webhookUrlSchema.safeParse('https://10.0.0.1/webhook').success).toBe(false);
    expect(webhookUrlSchema.safeParse('https://192.168.1.100/webhook').success).toBe(false);
    expect(webhookUrlSchema.safeParse('https://169.254.169.254/webhook').success).toBe(false);
    expect(webhookUrlSchema.safeParse('https://[::1]/webhook').success).toBe(false);

    // 3. localhost
    expect(webhookUrlSchema.safeParse('https://localhost/webhook').success).toBe(false);
    expect(webhookUrlSchema.safeParse('https://sub.localhost/webhook').success).toBe(false);

    // 4. .internal / .local / .arpa
    expect(webhookUrlSchema.safeParse('https://service.internal/webhook').success).toBe(false);
    expect(webhookUrlSchema.safeParse('https://myrouter.local/webhook').success).toBe(false);
    expect(webhookUrlSchema.safeParse('https://node.home.arpa/webhook').success).toBe(false);

    // 5. Non-443 port
    expect(webhookUrlSchema.safeParse('https://api.example.com:8443/webhook').success).toBe(false);
    expect(webhookUrlSchema.safeParse('https://api.example.com:8080/webhook').success).toBe(false);

    // Positive case: valid public HTTPS URL on default 443 port
    expect(webhookUrlSchema.safeParse('https://api.example.com/webhook').success).toBe(true);
    expect(webhookUrlSchema.safeParse('https://discord.com/api/webhooks/123/abc').success).toBe(true);
  });
});
