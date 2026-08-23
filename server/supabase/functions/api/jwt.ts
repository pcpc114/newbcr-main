import { jwtCreate, jwtVerify } from "./deps.ts";

let cachedKey: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) throw new Error("JWT_SECRET not configured");
  cachedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

export interface TokenPayload {
  sub: string; // user_id as string
  jti: string; // session id
  username: string;
  exp: number; // unix seconds
  iat: number;
}

export async function sign(payload: Omit<TokenPayload, "iat">): Promise<string> {
  const key = await getKey();
  return await jwtCreate(
    { alg: "HS256", typ: "JWT" },
    { ...payload, iat: Math.floor(Date.now() / 1000) },
    key,
  );
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "expired" | "invalid" };

export async function verify(token: string): Promise<VerifyResult> {
  try {
    const key = await getKey();
    const payload = await jwtVerify(token, key) as unknown as TokenPayload;
    return { ok: true, payload };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("exp") || msg.toLowerCase().includes("expired")) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "invalid" };
  }
}

export function extractBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/);
  return m ? m[1] : null;
}
