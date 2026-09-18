import {
	DEFAULT_TOKEN_PEPPER,
	randomBytes,
	sha256,
} from './crypto.js';

/**
 * AES-256-GCM encryption for notification channel configuration.
 * Format per SECURITY §7: v1 || iv (12 bytes) || ciphertext || tag (16 bytes)
 * Header: [0x76, 0x31] ("v1")
 * AAD = record id
 */

const HEADER_V1 = new Uint8Array([0x76, 0x31]); // "v1"

async function deriveAesKey(masterKeyHexOrString: string): Promise<CryptoKey> {
	// Ensure 32-byte key via SHA-256 of master key material
	const keyBytes = await sha256(masterKeyHexOrString || DEFAULT_TOKEN_PEPPER);
	return crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptChannelConfig(
	id: string,
	plaintextObj: unknown,
	masterKey: string
): Promise<Uint8Array> {
	const key = await deriveAesKey(masterKey);
	const iv = randomBytes(12);
	const aad = new TextEncoder().encode(id);
	const plaintext = new TextEncoder().encode(JSON.stringify(plaintextObj));

	const encrypted = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv,
			additionalData: aad,
			tagLength: 128,
		},
		key,
		plaintext
	);

	const encryptedBytes = new Uint8Array(encrypted);
	// v1 (2 bytes) + iv (12 bytes) + ciphertext+tag
	const result = new Uint8Array(2 + 12 + encryptedBytes.byteLength);
	result.set(HEADER_V1, 0);
	result.set(iv, 2);
	result.set(encryptedBytes, 14);

	return result;
}

export async function decryptChannelConfig<T = unknown>(
	id: string,
	ciphertextWithIv: Uint8Array,
	masterKey: string
): Promise<T> {
	if (ciphertextWithIv.byteLength < 14 + 16) {
		throw new Error('Ciphertext too short');
	}
	// Check header "v1"
	if (ciphertextWithIv[0] !== HEADER_V1[0] || ciphertextWithIv[1] !== HEADER_V1[1]) {
		throw new Error('Unsupported encryption version header');
	}

	const iv = ciphertextWithIv.slice(2, 14);
	const data = ciphertextWithIv.slice(14);
	const aad = new TextEncoder().encode(id);
	const key = await deriveAesKey(masterKey);

	const decrypted = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv,
			additionalData: aad,
			tagLength: 128,
		},
		key,
		data
	);

	const text = new TextDecoder().decode(decrypted);
	return JSON.parse(text) as T;
}

/**
 * Mask sensitive configuration strings for UI display (e.g., bot tokens, webhook URLs)
 * Returns a safe object with masked strings, never exposing secrets.
 */
export function maskChannelConfig(type: string, config: any): Record<string, string> {
	if (!config || typeof config !== 'object') return {};

	const maskString = (str: string, keepStart = 4, keepEnd = 4): string => {
		if (!str || typeof str !== 'string') return '';
		if (str.length <= keepStart + keepEnd) return '••••••••';
		return `${str.slice(0, keepStart)}••••${str.slice(-keepEnd)}`;
	};

	const res: Record<string, string> = {};

	if (type === 'telegram') {
		res.bot_token = maskString(config.bot_token, 4, 3);
		res.chat_id = config.chat_id ? String(config.chat_id) : '';
	} else if (type === 'discord') {
		res.webhook_url = maskString(config.webhook_url, 15, 6);
	} else if (type === 'slack') {
		res.webhook_url = maskString(config.webhook_url, 15, 6);
	} else if (type === 'webhook') {
		res.url = maskString(config.url, 12, 6);
		if (config.secret) {
			res.secret = '••••••••';
		}
	} else {
		for (const [k, v] of Object.entries(config)) {
			if (typeof v === 'string') {
				res[k] = maskString(v, 3, 3);
			}
		}
	}

	return res;
}
