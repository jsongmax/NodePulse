export const SESSION_COOKIE_NAME = '__Host-np_session';
export const SETUP_COOKIE_NAME = '__Host-np_setup';
export const VIEW_COOKIE_NAME = '__Host-np_view';

export function getCookie(
  header: string | null | undefined,
  name: string
): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      return decodeURIComponent(v.join('='));
    }
  }
  return null;
}

export function buildCookieHeader(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    sameSite?: 'Strict' | 'Lax' | 'None';
    httpOnly?: boolean;
    secure?: boolean;
    path?: string;
  } = {}
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  parts.push(`SameSite=${options.sameSite ?? 'Strict'}`);
  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }
  if (options.secure !== false) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearCookieHeader(
  name: string,
  options: { sameSite?: 'Strict' | 'Lax'; path?: string } = {}
): string {
  return buildCookieHeader(name, '', {
    ...options,
    maxAge: 0,
  });
}
