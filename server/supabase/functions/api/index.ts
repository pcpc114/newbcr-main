import { preflight } from "./cors.ts";
import { json, notFound } from "./responses.ts";
import { handleLogin } from "./handlers/login.ts";
import { handleValidateToken } from "./handlers/validateToken.ts";
import { handlePredict } from "./handlers/predict.ts";
import { handleBestRoom } from "./handlers/bestRoom.ts";
import { handleResult } from "./handlers/result.ts";
import { handleShoeChange } from "./handlers/shoeChange.ts";
import { handleVersionCheck } from "./handlers/versionCheck.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const url = new URL(req.url);
  // Supabase strips `/functions/v1/api` — pathname is e.g. `/login` or `/v2/predict`.
  // But in some environments it leaves `/api/...`. Strip both defensively.
  const path = url.pathname.replace(/^\/api/, "") || "/";
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
