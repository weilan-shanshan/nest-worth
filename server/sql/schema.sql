-- Nestworth 网站访问统计 schema
-- 设计原则：
--   1. 一张大表存所有事件，靠 event_name 区分
--   2. 不存 IP、不存 user_agent 完整字符串（PIPL 合规缓冲带）
--   3. device_hash 保留 90 天即可（前端 localStorage 90 天滚动）
--   4. 索引覆盖典型查询：日聚合、按 path 分组、留存
--
-- 部署：psql "$DATABASE_URL" -f schema.sql

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  event_name  TEXT NOT NULL CHECK (event_name IN ('page_view','cta_click','dwell')),
  ts          TIMESTAMPTZ NOT NULL,
  device_hash TEXT NOT NULL,            -- 前端 localStorage 随机 UUID
  session_id  TEXT NOT NULL,            -- 30min 滑窗 UUID
  path        TEXT,                     -- /assets, /trend ...
  ref_host    TEXT,                     -- 引荐域名（hostname only）
  cta         TEXT,                     -- CTA 枚举值
  dwell_ms    INTEGER,                  -- 仅 dwell
  lang        TEXT,
  screen_wh   TEXT,                     -- 1920x1080
  app_ver     TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW() -- 后端接收时间
);

-- 按 ts 范围查询是高频操作
CREATE INDEX IF NOT EXISTS events_ts_idx ON events(ts);
-- 留存 / UV 计算
CREATE INDEX IF NOT EXISTS events_device_ts_idx ON events(device_hash, ts);
-- path 维度聚合
CREATE INDEX IF NOT EXISTS events_path_ts_idx ON events(path, ts) WHERE event_name = 'page_view';
-- CTA 维度聚合
CREATE INDEX IF NOT EXISTS events_cta_ts_idx ON events(cta, ts) WHERE event_name = 'cta_click';

-- 90 天后自动清理（手动执行；也可配 cron）
-- DELETE FROM events WHERE ts < NOW() - INTERVAL '90 days';

-- 用 materialized view 加速 retention 的"首访日"查询
CREATE MATERIALIZED VIEW IF NOT EXISTS device_first_seen AS
SELECT device_hash, MIN(ts)::date AS first_date, MIN(ts) AS first_ts
FROM events
GROUP BY device_hash;

CREATE INDEX IF NOT EXISTS device_first_date_idx ON device_first_seen(first_date);

-- 定时刷新（DB 维护层调度；也可在每次 admin 查询前刷新一次）
-- REFRESH MATERIALIZED VIEW CONCURRENTLY device_first_seen;
