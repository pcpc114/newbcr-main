// SmartHelper 백엔드 — Supabase Edge Function (단일 파일)
//
// 출처: docs/superpowers/plans/2026-05-11-bcra-server-migration-plan.md
//
// ⚠️ 왜 한 파일인가
//    Supabase 대시보드의 브라우저 편집기로 붙여넣어 배포할 수 있도록 일부러 한 파일로 합쳤다.
//    (CLI 로그인이 이 환경에서 동작하지 않아 대시보드 배포 경로를 택했다.)
//    파일을 다시 쪼개면 대시보드로 배포할 수 없으니 주의.
//
// ⚠️ 배포 시 반드시 "Verify JWT" 를 꺼야 한다 (CLI 기준 --no-verify-jwt).
//    이 함수는 Supabase 발급 JWT 가 아니라 자체 JWT_SECRET 으로 서명한 토큰을 쓴다.
//    켜두면 /login 요청조차 게이트웨이에서 401 로 막힌다.
//
// ⚠️ 필요한 시크릿은 JWT_SECRET 하나뿐.
//    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 런타임이 자동 주입한다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  create as jwtCreate,
  verify as jwtVerify,
} from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

// ==================== CORS ====================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// ==================== 응답 헬퍼 ====================

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return json({ success: false, message: "Not found" }, 404);
}

// ==================== DB ====================

function getDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// ==================== JWT ====================

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

interface TokenPayload {
  sub: string; // user_id as string
  jti: string; // session id
  username: string;
  exp: number; // unix seconds
  iat: number;
}

async function sign(payload: Omit<TokenPayload, "iat">): Promise<string> {
  const key = await getKey();
  return await jwtCreate(
    { alg: "HS256", typ: "JWT" },
    { ...payload, iat: Math.floor(Date.now() / 1000) },
    key,
  );
}

type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "expired" | "invalid" };

async function verify(token: string): Promise<VerifyResult> {
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

function extractBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/);
  return m ? m[1] : null;
}

/** 토큰 서명만 확인하는 공통 가드. 통과하면 null, 실패하면 401 응답. */
async function requireToken(req: Request): Promise<Response | null> {
  const token = extractBearer(req);
  if (!token) return json({ success: false, message: "인증 토큰 없음" }, 401);
  const v = await verify(token);
  if (!v.ok) return json({ success: false, message: "유효하지 않은 토큰" }, 401);
  return null;
}

// ==================== POST /login ====================

interface LoginRequest {
  username?: string;
  password?: string;
}

async function handleLogin(req: Request): Promise<Response> {
  let body: LoginRequest;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: "잘못된 요청 형식입니다" }, 400);
  }
  const { username, password } = body;
  if (!username || !password) {
    return json({ success: false, message: "아이디와 비밀번호를 입력하세요" }, 400);
  }

  const db = getDb();

  const { data: user, error: userErr } = await db
    .from("users")
    .select("id, username, password_hash, expiry_at, active")
    .eq("username", username)
    .maybeSingle();

  if (userErr) {
    console.error("DB error:", userErr);
    return json({ success: false, message: "서버 오류" }, 500);
  }
  if (!user || !user.active) {
    return json({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다" }, 401);
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return json({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다" }, 401);
  }

  const expiryEpochMs = new Date(user.expiry_at).getTime();
  const nowMs = Date.now();
  if (expiryEpochMs <= nowMs) {
    return json({ success: false, message: "이용권이 만료되었습니다" }, 401);
  }
  const seconds = Math.floor((expiryEpochMs - nowMs) / 1000);

  // 기존 세션 삭제 = 중복로그인 차단 (마지막 로그인이 이전 기기를 밀어낸다)
  const jti = crypto.randomUUID();
  const { error: delErr } = await db.from("active_sessions").delete().eq("user_id", user.id);
  if (delErr) console.error("delete session err:", delErr);

  const { error: insErr } = await db.from("active_sessions").insert({
    jti,
    user_id: user.id,
    expires_at: new Date(expiryEpochMs).toISOString(),
  });
  if (insErr) {
    console.error("insert session err:", insErr);
    return json({ success: false, message: "세션 생성 실패" }, 500);
  }

  const token = await sign({
    sub: String(user.id),
    jti,
    username: user.username,
    exp: Math.floor(expiryEpochMs / 1000),
  });

  const { data: notice } = await db
    .from("notices")
    .select("id, title, content, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({
    success: true,
    token,
    userId: String(user.id),
    username: user.username,
    seconds,
    notice: notice
      ? {
        id: notice.id,
        title: notice.title,
        content: notice.content,
        regDate: notice.created_at,
      }
      : null,
    message: null,
  });
}

// ==================== GET /validate-token ====================

// ⚠️ 3-state 응답 계약. 클라이언트 session_monitor.rs 가 이걸로 상황을 구분한다.
//    { valid:true,  expired:false, remainingSeconds:N } → 정상
//    { valid:false, expired:true,  remainingSeconds:0 } → 이용권 만료
//    { valid:false, expired:false }                     → 중복로그인
async function handleValidateToken(req: Request): Promise<Response> {
  const token = extractBearer(req);
  if (!token) return json({ success: false, message: "인증 토큰 없음" }, 401);

  const v = await verify(token);
  if (!v.ok) {
    if (v.reason === "expired") {
      return json({ valid: false, expired: true, remainingSeconds: 0 });
    }
    return json({ success: false, message: "유효하지 않은 토큰" }, 401);
  }

  const { jti, sub } = v.payload;
  const db = getDb();

  const { data: session } = await db
    .from("active_sessions")
    .select("jti, user_id")
    .eq("jti", jti)
    .maybeSingle();

  if (!session) {
    // 🎯 다른 기기에서 로그인해 우리 세션 행이 지워졌다
    return json({ valid: false, expired: false });
  }

  const { data: user } = await db
    .from("users")
    .select("expiry_at")
    .eq("id", sub)
    .maybeSingle();

  if (!user) {
    return json({ valid: false, expired: false });
  }

  const expiryEpochMs = new Date(user.expiry_at).getTime();
  const nowMs = Date.now();
  if (expiryEpochMs <= nowMs) {
    await db.from("active_sessions").delete().eq("jti", jti);
    return json({ valid: false, expired: true, remainingSeconds: 0 });
  }

  const remainingSeconds = Math.floor((expiryEpochMs - nowMs) / 1000);

  await db.from("active_sessions")
    .update({ last_validated_at: new Date().toISOString() })
    .eq("jti", jti);

  return json({ valid: true, expired: false, remainingSeconds });
}

// ==================== POST /v2/predict ====================

// 실제 ML 예측은 설계상 범위 밖(Non-Goal). 클라이언트가 파싱 가능한 랜덤 응답.
async function handlePredict(req: Request): Promise<Response> {
  const guard = await requireToken(req);
  if (guard) return guard;

  let body: { roomId?: string } = {};
  try {
    body = await req.json();
  } catch { /* predict is forgiving */ }

  const r = Math.random();
  let prediction: "Banker" | "Player" | "skip";
  let isSkip = false;
  let reasoning: string | null = null;
  let skipReason: string | null = null;

  if (r < 0.45) {
    prediction = "Banker";
    reasoning = "랜덤 stub (서버 마이그레이션)";
  } else if (r < 0.90) {
    prediction = "Player";
    reasoning = "랜덤 stub (서버 마이그레이션)";
  } else {
    prediction = "skip";
    isSkip = true;
    skipReason = "데이터 부족 (stub)";
  }
  const confidence = 60 + Math.floor(Math.random() * 35); // 60..94

  return json({
    prediction,
    confidence,
    isSkip,
    skipReason,
    reasoning,
    responseTimeMs: 5,
    algorithmVersion: "stub-1.0",
    roomId: body.roomId ?? null,
  });
}

// ==================== POST /v2/predict/best-room ====================

interface Candidate {
  roomId?: string;
  roomName?: string;
}

async function handleBestRoom(req: Request): Promise<Response> {
  const guard = await requireToken(req);
  if (guard) return guard;

  let body: { candidates?: Candidate[] } = {};
  try {
    body = await req.json();
  } catch { /* ignore */ }

  const candidates = body.candidates ?? [];
  const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? null;

  return json({
    bestRoomId: picked?.roomId ?? null,
    bestRoomName: picked?.roomName ?? null,
    results: [],
    evaluated: candidates.length,
    skipped: 0,
    responseTimeMs: 10,
    reason: "랜덤 stub",
  });
}

// ==================== POST /v2/result ====================

async function handleResult(req: Request): Promise<Response> {
  const guard = await requireToken(req);
  if (guard) return guard;

  let body: { roomId?: string } = {};
  try {
    body = await req.json();
  } catch { /* ignore */ }
  const url = new URL(req.url);
  const actualResult = url.searchParams.get("actualResult");

  return json({
    success: true,
    message: null,
    roomId: body.roomId ?? null,
    result: actualResult,
    error: null,
  });
}

// ==================== POST /v2/shoe-change ====================

async function handleShoeChange(req: Request): Promise<Response> {
  const guard = await requireToken(req);
  if (guard) return guard;

  let body: { roomId?: string; shoeId?: string } = {};
  try {
    body = await req.json();
  } catch { /* ignore */ }

  return json({
    success: true,
    message: null,
    roomId: body.roomId ?? null,
    shoeId: body.shoeId ?? null,
    error: null,
  });
}

// ==================== POST /version/check ====================

function parseSemver(v: string): number[] {
  return v.split(".").map((p) => parseInt(p, 10) || 0);
}

function semverGte(a: string, b: string): boolean {
  const [aMaj, aMin, aPat] = parseSemver(a);
  const [bMaj, bMin, bPat] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat >= bPat;
}

async function handleVersionCheck(req: Request): Promise<Response> {
  let body: { clientVersion?: string; platform?: string } = {};
  try {
    body = await req.json();
  } catch { /* tolerate */ }
  const platform = body.platform ?? "desktop";
  const clientVersion = body.clientVersion ?? "0.0.0";

  const db = getDb();
  const { data: row } = await db
    .from("app_versions")
    .select("required_version, download_url, file_name, message")
    .eq("platform", platform)
    .maybeSingle();

  if (!row) {
    return json({
      requiredVersion: "0.0.0",
      compatible: true,
      message: null,
      downloadUrl: null,
      fileName: null,
    });
  }

  return json({
    requiredVersion: row.required_version,
    compatible: semverGte(clientVersion, row.required_version),
    message: row.message,
    downloadUrl: row.download_url,
    fileName: row.file_name,
  });
}

// ==================== 라우터 ====================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Supabase 는 보통 `/functions/v1/api` 를 떼어내 `/login` 형태로 준다.
  // 환경에 따라 `/api/...` 가 남는 경우가 있어 방어적으로 둘 다 처리한다.
  const path = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/api/, "") || "/";
  const key = `${req.method} ${path}`;

  try {
    switch (key) {
      case "POST /login":
        return await handleLogin(req);
      case "GET /validate-token":
        return await handleValidateToken(req);
      case "POST /v2/predict":
        return await handlePredict(req);
      case "POST /v2/predict/best-room":
        return await handleBestRoom(req);
      case "POST /v2/result":
        return await handleResult(req);
      case "POST /v2/shoe-change":
        return await handleShoeChange(req);
      case "POST /version/check":
        return await handleVersionCheck(req);
      default:
        return notFound();
    }
  } catch (e) {
    console.error("Unhandled error:", e);
    return json({ success: false, message: "Internal error" }, 500);
  }
});
