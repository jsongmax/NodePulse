export async function sha256(input: string | Uint8Array): Promise<Uint8Array> {
  const data =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const hash = await sha256(input);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

export function randomTokenHex(length = 32): string {
  const buf = randomBytes(length);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hmacSha256(
  pepper: string,
  secret: string | Uint8Array
): Promise<Uint8Array> {
  const keyData = new TextEncoder().encode(pepper);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data =
    typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return new Uint8Array(signature);
}

export async function hashIp(ip: string, pepper: string): Promise<string> {
  const combined = `${ip}:${pepper}`;
  const fullHash = await sha256(combined);
  // Store first 16 bytes as hex per SECURITY §11
  return Array.from(fullHash.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
