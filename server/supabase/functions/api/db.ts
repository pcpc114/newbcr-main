import { createClient } from "./deps.ts";

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 Edge Function 런타임에
// 자동으로 주입한다. 따로 secrets 로 설정할 필요 없다.
export function getDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
