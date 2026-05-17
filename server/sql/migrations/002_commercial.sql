-- Nestworth 商业化基础 schema（Sprint 0）
-- 设计原则：
--   1. users 表只存订阅状态，绝不存任何资产/调用内容
--   2. 邮箱用 HMAC-SHA256(EMAIL_HASH_SALT, lowercase(email)) 单向哈希，明文不入库
--   3. magic_link_tokens 同样存哈希，原 token 一次性
--   4. usage_events append-only，不存 prompt/response 正文
--   5. 所有时间戳用 TIMESTAMPTZ；UUID 用 pgcrypto 的 gen_random_uuid()
--
-- 部署：psql "$DATABASE_URL" -f sql/migrations/002_commercial.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. users · 订阅状态唯一权威源
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash          TEXT        NOT NULL UNIQUE,
  subscription_tier   TEXT        NOT NULL DEFAULT 'free'
                                  CHECK (subscription_tier IN ('free','plus','pro','max','studio')),
  subscription_status TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (subscription_status IN ('active','trialing','cancelled','expired','past_due')),
  current_period_end  TIMESTAMPTZ,
  trial_ends_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_hash_idx ON users(email_hash);

-- ============================================================================
-- 2. magic_link_tokens · 一次性登录令牌
--    Sprint 0 用 magic link 代替密码：邮箱收链接 → 点击 → /auth/verify
-- ============================================================================
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token_hash  TEXT        PRIMARY KEY,            -- HMAC-SHA256(salt, raw_token)
  email_hash  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS magic_link_tokens_email_pending_idx
  ON magic_link_tokens(email_hash, expires_at)
  WHERE used_at IS NULL;

-- ============================================================================
-- 3. usage_events · LLM 调用计费日志（append-only）
--    只存 token 数 + 模型 + 时间，不存任何 prompt / response 正文
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_events (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT         NOT NULL
                          CHECK (event_type IN ('ocr','analysis','report_gen')),
  model_id   TEXT         NOT NULL,
  tokens_in  INTEGER      NOT NULL DEFAULT 0,
  tokens_out INTEGER      NOT NULL DEFAULT 0,
  cost_cents INTEGER      NOT NULL DEFAULT 0,
  trace_id   UUID,
  ts         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_events_user_ts_idx ON usage_events(user_id, ts);

-- ============================================================================
-- 4. quota_snapshots · 月度配额快照
--    每月 1 号根据 subscription_tier 物化生成；event 写入时扣减 *_used
-- ============================================================================
CREATE TABLE IF NOT EXISTS quota_snapshots (
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start   DATE        NOT NULL,
  ocr_quota      INTEGER     NOT NULL,
  analysis_quota INTEGER     NOT NULL,
  ocr_used       INTEGER     NOT NULL DEFAULT 0,
  analysis_used  INTEGER     NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, period_start)
);

CREATE INDEX IF NOT EXISTS quota_snapshots_period_idx ON quota_snapshots(period_start);
