// 외부 의존성을 한 곳에 모아 버전을 고정한다.
export { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
export {
  create as jwtCreate,
  getNumericDate,
  verify as jwtVerify,
} from "https://deno.land/x/djwt@v3.0.1/mod.ts";
export { default as bcrypt } from "https://esm.sh/bcryptjs@2.4.3";
