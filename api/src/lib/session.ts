export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

export function newSessionToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`;
}
