import { extractBearer, verify } from "../jwt.ts";
import { json } from "../responses.ts";

interface Candidate {
  roomId?: string;
  roomName?: string;
}
interface BestRoomRequest {
  candidates?: Candidate[];
}

export async function handleBestRoom(req: Request): Promise<Response> {
  const token = extractBearer(req);
  if (!token) return json({ success: false, message: "인증 토큰 없음" }, 401);
  const v = await verify(token);
  if (!v.ok) return json({ success: false, message: "유효하지 않은 토큰" }, 401);

  let body: BestRoomRequest = {};
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
