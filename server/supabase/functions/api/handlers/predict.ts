import { extractBearer, verify } from "../jwt.ts";
import { json } from "../responses.ts";

// 설계상 실제 ML 예측은 범위 밖(Non-Goal). 클라이언트가 파싱 가능한 랜덤 응답을 돌려준다.
interface PredictRequest {
  roomId?: string;
  [k: string]: unknown;
}

export async function handlePredict(req: Request): Promise<Response> {
  const token = extractBearer(req);
  if (!token) return json({ success: false, message: "인증 토큰 없음" }, 401);
  const v = await verify(token);
  if (!v.ok) return json({ success: false, message: "유효하지 않은 토큰" }, 401);

  let body: PredictRequest = {};
  try {
    body = await req.json();
  } catch { /* ignore — predict is forgiving */ }

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
