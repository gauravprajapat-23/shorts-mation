// Server-only symmetric encryption for OAuth tokens at rest.
// Format: v1:<iv_b64>:<ciphertext_b64>. Legacy plaintext values are
// returned as-is by decryptToken() so pre-existing rows keep working
// until the next refresh writes an encrypted version.

const PREFIX = "v1:";

export function isEncryptedToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  // Derive a stable 32-byte key from the secret via SHA-256 so any secret
  // length works, and any change to the secret rotates the key.
  const material = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", material.buffer as ArrayBuffer);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    new TextEncoder().encode(plaintext).buffer as ArrayBuffer,
  );
  return `${PREFIX}${b64encode(iv)}:${b64encode(new Uint8Array(cipherBuf))}`;
}

export async function decryptToken(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext row — return as-is so callers can still refresh it.
    return stored;
  }
  const [, ivB64, ctB64] = stored.split(":");
  if (!ivB64 || !ctB64) return null;
  try {
    const key = await getKey();
    const iv = b64decode(ivB64);
    const ct = b64decode(ctB64);
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ct.buffer as ArrayBuffer,
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}