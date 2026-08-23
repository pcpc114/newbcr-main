-- 20260511000000_initial.sql
-- 출처: docs/superpowers/plans/2026-05-11-bcra-server-migration-plan.md (Task 2)

-- 사용자 마스터
CREATE TABLE users (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(50) NOT NULL UNIQUE,
  password_hash   VARCHAR(100) NOT NULL,
  expiry_at       TIMESTAMPTZ NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'USER',
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_username ON users(username);

-- 활성 세션 (한 명당 1개 = 중복로그인 방지)
CREATE TABLE active_sessions (
  jti               UUID PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  last_validated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_active_sessions_user ON active_sessions(user_id);

-- 공지 (NoticePopup용)
CREATE TABLE notices (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 강제 업데이트
CREATE TABLE app_versions (
  platform         VARCHAR(20) PRIMARY KEY,
  required_version VARCHAR(20) NOT NULL,
  download_url     TEXT,
  file_name        TEXT,
  message          TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 시드
INSERT INTO app_versions (platform, required_version)
VALUES ('desktop', '0.1.0');
