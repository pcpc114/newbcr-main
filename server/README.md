# bcr-server (Supabase Edge Functions)

SmartHelper 데스크톱 앱의 백엔드. Supabase 무료 티어에서 동작한다.

출처: `docs/superpowers/plans/2026-05-11-bcra-server-migration-plan.md`

## 하는 일

| 엔드포인트 | 용도 |
|---|---|
| `POST /login` | 로그인. bcrypt 검증 → JWT 발급, 기존 세션 삭제(중복로그인 차단) |
| `GET /validate-token` | 세션 유효성. **만료 / 중복로그인을 구분해서** 응답 |
| `POST /v2/predict` | 예측 (랜덤 stub — 실제 ML은 설계상 범위 밖) |
| `POST /v2/predict/best-room` | 추천 방 (랜덤 stub) |
| `POST /v2/result` | 결과 보고 (수신만) |
| `POST /v2/shoe-change` | 슈 교체 알림 (수신만) |
| `POST /version/check` | 클라이언트 강제 업데이트 정책 |

클라이언트가 부르는 실제 주소는 `https://<ref>.supabase.co/functions/v1/api/login` 형태다.
함수 이름을 `api` 로 둔 덕분에 클라이언트는 **base URL 만 바꾸면** 된다.

## ⚠️ validate-token 3-state 계약

절대 바꾸지 말 것. 클라이언트 `session_monitor.rs` 가 이 차이로 상황을 구분한다.

| 응답 | 의미 |
|---|---|
| `{ valid: true,  expired: false, remainingSeconds: N }` | 정상 |
| `{ valid: false, expired: true,  remainingSeconds: 0 }` | 이용권 만료 |
| `{ valid: false, expired: false }` | **다른 기기에서 로그인함(중복로그인)** |

## 배포

```bash
npx supabase login                      # 브라우저 인증 1회
npx supabase link --project-ref <REF>   # 대시보드 주소창의 긴 문자열
npx supabase db push                    # 테이블 생성
npx supabase secrets set JWT_SECRET=<랜덤 32바이트 hex>
npx supabase functions deploy api
```

`SUPABASE_URL` 과 `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가 함수 런타임에 자동 주입한다.
따로 설정하지 않는다. **직접 설정해야 하는 시크릿은 `JWT_SECRET` 하나뿐이다.**

## 사용자 계정 추가

```bash
node scripts/hash-password.mjs "비밀번호"
```

출력된 해시를 Supabase 대시보드 → SQL Editor 에서:

```sql
INSERT INTO users (username, password_hash, expiry_at)
VALUES ('아이디', '<해시>', now() + interval '30 days');
```

`expiry_at` 이 곧 남은 사용 시간이다. 연장하려면:

```sql
UPDATE users SET expiry_at = now() + interval '30 days' WHERE username = '아이디';
```

## ⚠️ 무료 티어는 1주일 미사용 시 자동 일시정지

일시정지 후 1년 안에는 데이터 그대로 복구 가능하지만, 방치하면 삭제된다.
(이전 서버가 이렇게 사라졌다.) 주 1회 이상 접속을 유지하거나 자동 핑을 걸어둘 것.
