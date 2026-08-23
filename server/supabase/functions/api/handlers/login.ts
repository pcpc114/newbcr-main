import { bcrypt } from "../deps.ts";
import { getDb } from "../db.ts";
import { sign } from "../jwt.ts";
import { json } from "../responses.ts";

interface LoginRequest {
  username?: string;
  password?: string;
}

export async function handleLogin(req: Request): Promise<Response> {
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

  // 1. Fetch user
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

  // 2. Password check
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return json({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다" }, 401);
  }

  // 3. Expiry check
  const expiryEpochMs = new Date(user.expiry_at).getTime();
  const nowMs = Date.now();
  if (expiryEpochMs <= nowMs) {
    return json({ success: false, message: "이용권이 만료되었습니다" }, 401);
  }
  const seconds = Math.floor((expiryEpochMs - nowMs) / 1000);

  // 4. Replace any existing session for this user (중복 로그인 차단)
  const jti = crypto.randomUUID();
  const { error: delErr } = await db.from("active_sessions").delete().eq("user_id", user.id);
  if (delErr) {
    console.error("delete session err:", delErr);
  }

  const { error: insErr } = await db.from("active_sessions").insert({
    jti,
    user_id: user.id,
    expires_at: new Date(expiryEpochMs).toISOString(),
  });
  if (insErr) {
    console.error("insert session err:", insErr);
    return json({ success: false, message: "세션 생성 실패" }, 500);
  }

  // 5. Sign JWT
  const token = await sign({
    sub: String(user.id),
    jti,
    username: user.username,
    exp: Math.floor(expiryEpochMs / 1000),
  });

  // 6. Latest active notice
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
