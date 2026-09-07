export const YOUTUBE_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeBase64Url(value: string): Uint8Array | null {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function signYouTubeOAuthState(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(signature));
}

export async function verifyYouTubeOAuthStateSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const bytes = decodeBase64Url(signature);
  if (!bytes) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(payload));
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseYouTubeOAuthState(state: string): { userId: string; nonce: string; issuedAtMs: number; payload: string; signature: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [userId, nonce, issuedAt, signature] = parts;
  const issuedAtMs = Number.parseInt(issuedAt, 36);
  if (!userId || !nonce || !signature || !Number.isFinite(issuedAtMs)) return null;
  return { userId, nonce, issuedAtMs, payload: `${userId}.${nonce}.${issuedAt}`, signature };
}

export function youtubeOAuthAppBaseUrl(requestOrigin?: string): string {
  const configured = process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (requestOrigin) return requestOrigin.replace(/\/+$/, "");
  throw new Error("PUBLIC_APP_URL is not configured");
}

export function youtubeOAuthRedirectUri(appBaseUrl: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/api/public/youtube/callback`;
}
