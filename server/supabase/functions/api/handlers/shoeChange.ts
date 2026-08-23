import { extractBearer, verify } from "../jwt.ts";
import { json } from "../responses.ts";

export async function handleShoeChange(req: Request): Promise<Response> {
  const token = extractBearer(req);
  if (!token) return json({ success: false, message: "인증 토큰 없음" }, 401);
  const v = await verify(token);
  if (!v.ok) return json({ success: false, message: "유효하지 않은 토큰" }, 401);

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
