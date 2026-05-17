# Nestworth Analytics Server

Nestworth 的网站访问统计接入端。**绝不存任何资产/金额/Key**，只采页面访问、按钮点击、停留时长这些基础运行数据。

## 它存什么 / 不存什么

存：
- `event_name` — `page_view` / `cta_click` / `dwell`
- `ts` — 事件时间戳
- `device_hash` — 前端 localStorage 里的随机 UUID（90 天滚动；用户清缓存即重置）
- `session_id` — 30 分钟无操作滑窗
- `path` — 路由 path（去掉 query / hash，最长 120 字节）
- `ref_host` — 引荐 hostname（不含 path）
- `cta` — 受控枚举（见 `src/schema.ts`）
- `dwell_ms`、`lang`、`screen_wh`、`app_ver`

**绝不存**：
- IP（CF/Nginx 反代记得脱）
- User-Agent 字符串
- 资产 / 金额 / ticker / API Key / 资产名 / 平台名 — 这些在前端 schema 就不会被发出来，再传也会被 zod `.strict()` 拒收

## 部署

### 1. 准备 Postgres

```bash
createdb nestworth_analytics
export DATABASE_URL="postgres://user:pass@host:5432/nestworth_analytics"
psql "$DATABASE_URL" -f sql/schema.sql
```

### 2. 环境变量

复制 `.env.example` 到 `.env` 后填：

```env
DATABASE_URL=postgres://user:pass@host:5432/nestworth_analytics
ADMIN_TOKEN=<openssl rand -hex 32>
ALLOWED_ORIGINS=https://nestworth.app,https://nestworth.pages.dev
PORT=8787
```

### 3. 启动

```bash
pnpm install
pnpm run dev     # 开发
pnpm run build && pnpm run start    # 生产
```

### 4. 前端配置

在前端项目的环境变量里加：

```env
VITE_ANALYTICS_ENDPOINT=https://your-analytics-server.example.com
VITE_APP_VERSION=2.x.x       # 可选，用于看版本分布
```

后台访问入口：`https://<前端域名>/_admin/<ADMIN_TOKEN>`。这条 URL **绝对不要分享出去**，token 等于 root 权限。

## API

### `POST /track`
- Body：`application/json`，schema 见 `src/schema.ts`
- 返回：永远 204（fire-and-forget）
- 失败：静默丢弃，避免客户端重试风暴

### `GET /admin/overview?range=7d|30d|90d`
鉴权：`X-Admin-Token: <ADMIN_TOKEN>`

```json
{
  "rangeDays": 30,
  "uv": 1234,
  "pv": 8765,
  "pvPerUv": 7.1,
  "dwellP50Ms": 23400,
  "dwellP90Ms": 124000,
  "byPath": [
    { "path": "/", "pv": 3200, "dwellP50Ms": 18000 }
  ]
}
```

### `GET /admin/funnel?range=7d|30d|90d`
关键 CTA 的点击次数 + 独立设备数。

### `GET /admin/retention?range=7d|30d|90d`
首访日为分组维度的 D1/D3/D7/D14/D30 留存。

## 合规检查清单

- [ ] 部署完成后用 `pg_dump` 验证 `events` 表没有 IP 字段
- [ ] 反向代理（Nginx / CF）配置移除 `X-Forwarded-For` 透传
- [ ] About 页注明数据采集说明（前端项目内）
- [ ] 设置页"网站访问统计"开关默认开但用户可关
- [ ] 定期清理 90 天前的数据：`DELETE FROM events WHERE ts < NOW() - INTERVAL '90 days';`

## 不做的事

- 不做用户画像 / 行为序列拼接
- 不做精确地理位置（甚至连国家都不存）
- 不做 fingerprint（canvas / webgl 都不碰）
- 不和任何第三方分析平台对接
