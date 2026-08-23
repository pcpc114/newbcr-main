import { getDb } from "../db.ts";
import { extractBearer, verify } from "../jwt.ts";
import { json } from "../responses.ts";

// ⚠️ 3-state 응답 계약을 반드시 지킬 것.
//    클라이언트(session_monitor.rs)가 만료(expired)와 중복로그인을 이걸로 구분한다.
//      { valid:false, expired:true  } → 이용권 만료
//      { valid:false, expired:false } → 다른 기기에서 로그인함(중복로그인)
export async function handleValidateToken(req: Request): Promise<Response> {
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

  // Check session row exists (= this jti is still the current session)
  const { data: session } = await db
    .from("active_sessions")
    .select("jti, user_id")
    .eq("jti", jti)
    .maybeSingle();

  if (!session) {
    // 🎯 Duplicate-login: someone else logged in and deleted/replaced our row
    return json({ valid: false, expired: false });
  }

  // Fetch user expiry
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

  // Touch last_validated_at (best-effort; ignore errors)
  await db.from("active_sessions").update({
    last_validated_at: new Date().toISOString(),
  }).eq("jti", jti);

  return json({ valid: true, expired: false, remainingSeconds });
}
