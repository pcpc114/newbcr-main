# 배포 절차 (브라우저만으로)

Supabase CLI 로그인이 이 환경에서 동작하지 않아(`NonInteractiveError`) 대시보드 경로를 쓴다.
CLI 설치·토큰 발급 없이 복사·붙여넣기만으로 끝난다.

프로젝트: `vthqlfcuspqmuvazfncf` (`https://vthqlfcuspqmuvazfncf.supabase.co`)

---

## 1. 테이블 만들기

대시보드 → 왼쪽 **SQL Editor** → `New query` → `supabase/migrations/20260511000000_initial.sql`
내용을 통째로 붙여넣고 **Run**.

성공하면 Table Editor 에 4개가 보인다: `users`, `active_sessions`, `notices`, `app_versions`.

---

## 2. JWT_SECRET 등록

대시보드 → **Project Settings → Edge Functions → Secrets** (또는 Edge Functions → Secrets)
→ `Add new secret`

| Name | Value |
|---|---|
| `JWT_SECRET` | 32바이트 랜덤 hex (아래 명령으로 생성) |

```powershell
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
($b | ForEach-Object { $_.ToString("x2") }) -join ""
```

`SUPABASE_URL` 과 `SUPABASE_SERVICE_ROLE_KEY` 는 **등록하지 않는다.** 런타임이 자동 주입한다.

---

## 3. 함수 배포

대시보드 → **Edge Functions** → `Deploy a new function` → **Via Editor**

| 항목 | 값 |
|---|---|
| 함수 이름 | **`api`** ← 반드시 이 이름. 클라이언트 경로가 `/functions/v1/api/...` 다 |
| 코드 | `supabase/functions/api/index.ts` 전체 |

### ⚠️ Verify JWT 를 반드시 끌 것

배포 화면에 **"Verify JWT"** (또는 `Enforce JWT verification`) 토글이 있으면 **OFF**.

이 함수는 Supabase 가 발급한 JWT 가 아니라 자체 `JWT_SECRET` 으로 서명한 토큰을 쓴다.
켜두면 게이트웨이가 먼저 401 을 뱉어서 `/login` 요청조차 코드에 도달하지 못한다.
(CLI 로 배포한다면 `supabase functions deploy api --no-verify-jwt`)

---

## 4. 동작 확인

```powershell
# 버전 체크 — 인증 불필요. 200 + requiredVersion 이 나와야 정상
Invoke-WebRequest -Uri "https://vthqlfcuspqmuvazfncf.supabase.co/functions/v1/api/version/check" `
  -Method Post -Body '{"clientVersion":"1.3.4","platform":"desktop"}' `
  -ContentType 'application/json' -UseBasicParsing

# 로그인 — 계정이 없으니 401 이 나오는 게 정상 (404/500 이면 배포 문제)
Invoke-WebRequest -Uri "https://vthqlfcuspqmuvazfncf.supabase.co/functions/v1/api/login" `
  -Method Post -Body '{"username":"x","password":"y"}' `
  -ContentType 'application/json' -UseBasicParsing
```

| 결과 | 의미 |
|---|---|
| 404 | 함수 이름이 `api` 가 아니거나 미배포 |
| 401 (`/version/check` 에서) | Verify JWT 가 켜져 있음 → 끄고 재배포 |
| 500 + `JWT_SECRET not configured` | 2번 단계 누락 |

---

## 5. 계정 만들기

```powershell
cd server
node scripts/hash-password.mjs "원하는비밀번호"
```

출력된 해시를 SQL Editor 에서:

```sql
INSERT INTO users (username, password_hash, expiry_at)
VALUES ('원하는아이디', '<해시>', now() + interval '30 days');
```

`expiry_at` 이 곧 남은 사용 시간이다. 연장:

```sql
UPDATE users SET expiry_at = now() + interval '30 days' WHERE username = '아이디';
```

---

## 6. 클라이언트 재빌드

`BCR_API_BASE_URL` 은 `option_env!` 라 **컴파일 시점**에 박힌다. 실행 중에는 못 바꾼다.

```powershell
$env:BCR_API_BASE_URL = "https://vthqlfcuspqmuvazfncf.supabase.co/functions/v1"
npm run tauri:dev
```
