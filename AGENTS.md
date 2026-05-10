# Nestworth · 巢值

## 项目概述

把分散在各 App（银行 / 支付宝 / 券商 / 基金 / 房产 / ...）的资产汇成一处可视画面的 PWA。
核心交互：用户截图银行/理财 App → AI 自动识别金额并入账 → 在总览/走势/目标页查看汇总与 AI 顾问建议。
**100% 本地存储 IndexedDB，零账号、零服务器、零埋点**。

## 项目基本信息

- **仓库类型**：【工具类】（独立开源 PWA · 个人理财管理工具 · 与阿里业务域无关）

---

## AGENTS.md 更新时机

当识别到发生代码变更或代码事实和当前 AGENTS.md 内容不一致时，按照当前 AGENTS.md 结构及时更新 AGENTS.md 对应区块。

---

## 本仓库开发必需 skill

| skill 名称 | 安装方式 |
| ---------- | -------- |

（非 AJX 项目，无强制 skill 约束）

---

## 技术栈

| 维度 | 方案 |
| ---- | ---- |
| 框架 | Vue 3 (Composition API + `<script setup>`) + TypeScript + Vite 5 |
| 状态管理 | Pinia（`src/store/assets.ts` 单 store 全局） |
| 路由 | vue-router 4（`src/router.ts`，5 个 tab + about + setup-key） |
| 样式方案 | UnoCSS（`uno.config.ts`，含 presetIcons 加载 `@iconify-json/ph` Phosphor 图标 + presetWebFonts 加载 Bunny Fonts 的 Playfair Display + Nunito） |
| 本地存储 | Dexie.js（IndexedDB 封装，schema v2，5 张表：assets / snapshots / goals / settings / advice） |
| 图表 | ECharts 5（按需 import：LineChart + PieChart + 必要 components） |
| PWA | vite-plugin-pwa + workbox-window（autoUpdate + 多源 runtime cache） |
| AI 调用 | 阿里云百炼 `dashscope.aliyuncs.com`（OpenAI 兼容协议）— 视觉模型 7 个 + 文本/推理模型 7 个，统一双链 fallback |
| 运行环境 | **必须 Node 20+**（vite-plugin-pwa workbox-build 链路依赖 `diagnostics_channel.tracingChannel`）+ 现代浏览器（Chromium / WebKit / Firefox） |

---

## 项目目录结构

```
Nestworth/
├── public/                 # 静态资源 (favicon.svg + 4 张 PWA icon)
├── src/
│   ├── views/              # 7 个页面级组件
│   │   ├── Home.vue           # 总览：净值卡 + 月增长柱状图 + 资产分组聚合
│   │   ├── Assets.vue         # 资产明细：sticky 锚点 + 按类型分组列表
│   │   ├── Trend.vue          # 走势：折线 + 饼图 + AI 持仓分析
│   │   ├── Goals.vue          # 目标：进度 + AI 整体增值方案（中国+全球）
│   │   ├── Settings.vue       # API Key / 模型链 / 备份导入 / PWA 安装入口
│   │   ├── About.vue          # 产品介绍 + 浏览器兼容矩阵 + 隐私承诺
│   │   └── KeySetup.vue       # 保姆级 4 步 API Key 引导（含调用 qwen-turbo 验证）
│   ├── components/         # 13 个可复用组件
│   │   ├── AppShell.vue            # 外框 + 底部导航 (5 tab)
│   │   ├── AssetRow.vue            # 资产明细行（chip 跟名 + 副行右栏对齐）
│   │   ├── AssetGroupCard.vue      # 资产分组聚合卡（Home 页用）
│   │   ├── AssetEditor.vue         # 资产新建/编辑 modal（按 category 条件字段）
│   │   ├── AssetBatchEditor.vue    # 批量金额更新 modal
│   │   ├── ScreenshotImporter.vue  # 多图截图识别 + 智能合并 + 进度
│   │   ├── AdviceCard.vue          # AI 建议通用容器（loading / error / 未配 Key）
│   │   ├── AdviceMetaFooter.vue    # 模型 + 实时锚点 + 缓存时间
│   │   ├── InstallEntryCard.vue    # PWA 安装入口（Settings 顶部，4 种浏览器自适应引导）
│   │   ├── PWAInstallPrompt.vue    # 浮起 banner（Android 自动 / iOS 引导）
│   │   ├── Modal.vue / Field.vue / AssetIcon.vue   # 基础组件
│   ├── lib/                # 9 个工具/业务模块
│   │   ├── recognize.ts       # 截图识别（视觉模型 + MODEL_CHAIN + ANALYST_CHAIN 定义）
│   │   ├── advisor.ts         # 理财分析（持仓诊断 + 目标方案 + N=1/2/3 交叉验证 + 24h 缓存）
│   │   ├── quotes.ts          # 行情拉取（依赖 VITE_QUOTE_PROXY 即 CF Worker）
│   │   ├── market-data.ts     # 市场快照（汇率 + 黄金，多源 fallback，30min 缓存）
│   │   ├── asset-meta.ts      # 9 大资产类目元信息（label/icon/color）
│   │   ├── asset-calc.ts      # 派生计算（到期日 / 到期收益 / 持有天数 / 基金累计）
│   │   ├── asset-match.ts     # 智能合并（识别项 vs 现有资产，bigram dice + 阈值 0.55）
│   │   ├── pwa-install.ts     # PWA 安装单例（detect 12+ 浏览器/内嵌 + beforeinstallprompt）
│   │   └── format.ts          # 金额/百分比/日期格式化
│   ├── store/assets.ts        # Pinia 全局 store（资产 CRUD / bulkUpdate / refreshQuotes / hasApiKey / settings）
│   ├── db.ts                  # Dexie schema v2 + getOrInitSettings / updateSettings
│   ├── types.ts               # AssetCategory / TickerType / Asset / Snapshot / Goal / Settings
│   ├── router.ts              # 7 路由
│   ├── App.vue / main.ts / style.css
├── worker/
│   └── quotes-proxy.js     # CF Worker 行情代理模板（A 股/港股/美股 → 腾讯股票，国内基金 → 天天基金）
├── scripts/
│   ├── generate-icons.mjs  # 从 favicon.svg 生成 4 张 PNG（puppeteer-core + 系统 Chrome）
│   └── screenshots.mjs     # README 截图自动化（同上）
├── docs/screenshots/       # 7 张产品截图（README 引用）
├── .github/workflows/build.yml   # GitHub Actions：Node 20 + type check + build + PWA 产物检查
├── uno.config.ts           # UnoCSS 配置（含 icon safelist）
├── vite.config.ts          # Vite + VitePWA + Workbox runtime cache
├── index.html              # 入口（apple-touch-icon + theme-color）
├── package.json            # 注：build 脚本带 --experimental-global-webcrypto 兼容 Node 18
├── README.md / LICENSE / .nvmrc (=20) / .env.example
```

---

## 页面索引

| 页面 | 文件路径 | 页面名称 | 功能描述 | 状态 |
| ---- | -------- | -------- | -------- | ---- |
| Home | src/views/Home.vue | 总览 | 净值大数字 + 3 维度 KPI（本月/YTD/距目标）+ 7 月柱状图 + 9 类资产分组聚合 + 截图识别/手动添加入口 | 使用中 |
| Assets | src/views/Assets.vue | 资产 | 资产明细管理（按类型分组 + 顶部 sticky 锚点导航 + 双行紧凑卡 + 批量更新 + 截图识别 + 添加） | 使用中 |
| Trend | src/views/Trend.vue | 走势 | 净值折线图（7/30/90/全部）+ 资产构成饼图 + AI 持仓分析与建议（含 AdviceMetaFooter） | 使用中 |
| Goals | src/views/Goals.vue | 目标 | 财务目标进度条 + AI 整体增值方案（① 现有持仓优化 ② 新增配置中国+全球 ③ 分阶段行动） | 使用中 |
| Settings | src/views/Settings.vue | 设置 | PWA 安装入口 / 使用说明入口 / Qwen-VL API Key / 自动行情同步 / 理财分析模型链 + 交叉验证档位 / 隐私模式 / 数据备份 / 关于 | 使用中 |
| About | src/views/About.vue | 关于 Nestworth | Hero + 6 大核心价值 + 5 步上手 + 适合谁 + 我们对你的承诺 + 支持的浏览器矩阵 + 技术栈 | 使用中 |
| KeySetup | src/views/KeySetup.vue | 配置 AI | 4 步保姆级引导（打开百炼 → 开通 → 创建 API Key → 粘贴并真实调用 qwen-turbo 验证） | 使用中 |

---

## 业务术语

**公共业务术语**可见：https://alidocs.dingtalk.com/i/nodes/1OQX0akWmL9X3rKYFv1XAB2Z8GlDd3mE

**本仓库术语**

| 术语 | 含义 |
| ---- | ---- |
| Nestworth / 巢值 | 项目品牌名。Nest = 储蓄/老底（英文 Nest Egg），worth = 价值；中文「巢值」谐音"超值" |
| `MODEL_CHAIN` | 视觉模型链（`src/lib/recognize.ts`）— 7 个百炼 VL 模型，截图识别用，按性价比排序，失败自动 fallback |
| `ANALYST_CHAIN` | 文本/分析模型链（同文件）— 7 个推理/对话模型（DeepSeek-R1 → Qwen-Max → DeepSeek-V3 → ...），理财分析用 |
| 交叉验证 N=2/3 | 同一 prompt 并行调 N 个模型 → 第 N+1 次让最强模型综合，去除离群 |
| 已耗尽模型 | 调用返回 quota / 429 等错误的模型，自动加入 `Settings.exhaustedModels` 持久化，下次跳过 |
| 实时锚点 | `market-data.ts` 抓的汇率 + 黄金，喂给 advisor 的 prompt 让 AI 基于真实数据生成方案 |
| 智能合并 | `asset-match.ts` 把截图识别项跟现有资产做 bigram dice 相似度匹配，命中阈值 0.55 → 更新而非新建 |
| `wealth` 类目 | 固收类理财（银行理财 / 券商资管 / 信托），与 `deposit`（银行定期存款）严格区分 |
| 保姆级引导 | `/setup-key` 页面 — 用户首次未配 API Key 时全 app 触点都引导到这里，含真实调用 qwen-turbo 验证 Key |
| AdviceMetaFooter | 所有 AI 建议卡底部必带的元信息条 — 实时锚点 + 数据源 + 模型名 + 缓存时间，确保 AI 输出可审 |

---

## 项目启动方式

```bash
# 1. Node 20+（仓库根有 .nvmrc）
nvm use   # 自动切到 20

# 2. 安装依赖（必须 --ignore-scripts，绕过 esbuild postinstall 自检）
npm install --ignore-scripts

# 3. 配置 API Key（可选，也可在 app 设置页填）
cp .env.example .env.local
# 填入 VITE_DASHSCOPE_API_KEY=sk-xxx

# 4. 启动 dev server
npm run dev
# → http://localhost:5173
```

**生产构建**：

```bash
npm run build
# package.json 已带 --experimental-global-webcrypto 兼容 Node 18 fallback
```

**重新生成产物**（可选）：

```bash
node scripts/generate-icons.mjs   # 从 favicon.svg 生成 4 张 PWA PNG
node scripts/screenshots.mjs       # 重新生成 README 7 张截图（dev server 必须先起）
```

---

## 部署与运维

### 部署平台

**Cloudflare Pages**（已上线 https://nest.weilanshanshan.top）

| 字段 | 值 |
| ---- | ---- |
| GitHub 仓库 | https://github.com/weilan-shanshan/nest-worth |
| 主干分支 | `main` |
| Build command | `npm install --ignore-scripts && npm run build` |
| Build output | `dist` |
| Node 版本 | 环境变量 `NODE_VERSION=20` 必填 |
| 自定义域名 | `nest.weilanshanshan.top`（CNAME 到 `<project>.pages.dev`） |

### 可选：CF Worker 行情代理

启用 A 股 / 港股 / 美股 / 国内基金的自动行情同步（绕过 CORS）：

1. CF Dashboard → Workers & Pages → Create → Worker
2. 把 `worker/quotes-proxy.js` 整个粘进编辑器 → Deploy
3. CF Pages 项目 → Settings → Environment variables 加 `VITE_QUOTE_PROXY=<Worker URL>`
4. CF Pages → Deployments → Retry deployment

### 发布步骤

直接 push 到 main 即可触发 Cloudflare Pages 自动部署。

```bash
git push origin main
# CF Pages 检测到变更 → 自动 build → 约 1-2 分钟上线
```

GitHub Actions（`.github/workflows/build.yml`）会同时跑 type check + build + PWA 产物检查作为质量门禁。

### 监控

| 用途 | 链接 |
| ---- | ---- |
| 部署历史 | https://dash.cloudflare.com/?to=/:account/pages/view/nest-worth |
| CI 状态 | https://github.com/weilan-shanshan/nest-worth/actions |
| AI 用量 | 阿里云百炼控制台 → 资源管理 → 用量明细（用户自查） |
| 错误告警 | 待补充（当前无埋点，符合"零埋点"承诺；如需可以接 Sentry / Cloudflare Web Analytics） |

---

## 知识索引

| 地址 | 用途 | 何时阅读 |
| ---- | ---- | -------- |
| `.ai-wiki/decisions.md` | 技术决策记录 | 做技术方案时必读 |
| `.ai-wiki/experience/` | 踩坑与经验，按类型分文件 | 遇到对应问题时查阅 |
| `README.md` | 用户视角的产品介绍 + 部署步骤 + 技术栈 | 首次接手项目时读一遍 |
| `worker/quotes-proxy.js` | CF Worker 部署模板（含腾讯股票/天天基金接口注释） | 需启用 A 股 / 美股 / 基金自动行情时读 |
| https://bailian.console.aliyun.com/ | 阿里云百炼控制台（API Key + 用量） | 申请 Key / 排查模型额度时 |
| https://dash.cloudflare.com/ | Cloudflare Pages + Workers 部署面板 | 部署 / 排查 / 改 env var 时 |

---

## 关键约定（开发必读）

### 类型与字段

- `AssetCategory` 枚举：`cash | deposit | wealth | fund | stock | realestate | insurance | receivable | other`（**已去掉 `crypto`**，新增 `wealth` 与 `deposit` 严格分开）
- `Asset` schema 三组扩展字段：
  - 固收：`termMonths` / `interestRate` / `startDate` / `maturityDate` / `maturityValue`
  - 基金：`annualizedReturn` / `totalReturn`
  - 行情：`tickerSymbol` / `tickerType` / `shares` / `lastQuoteAt` / `lastQuotePrice`

### AI 调用规范

- 截图识别走 `MODEL_CHAIN`（视觉模型）；理财分析走 `ANALYST_CHAIN`（推理模型）
- 失败自动 fallback；遇 quota / 429 错误标记到 `Settings.exhaustedModels`，下次跳过
- 所有 AI 建议必须返回 `AdviceMeta`（含 `modelUsed` / `ensembleModels` / `marketSnapshot` / `cachedAt`），UI 用 `AdviceMetaFooter` 展示
- 24h IndexedDB 缓存（`db.advice` 表，按 fingerprint 包含 ensembleSize 区分档位）

### UI 设计规范

- **颜色**：brand `#2E9E60` / orange `#F5A623` / blue `#5C8FE0` / pos `#2E9E60` / neg `#E5604A` / ink `#1F2D26` / ink-muted `#8BAF96`
- **字体**：金额/品牌用 `font-brand`（Playfair Display 600/700），UI 用 Nunito 400/500/600/700
- **圆角 token**：`app=32 / card=24 / row=16 / nav=20 / navActive=14 / icon=12`
- **图标**：UnoCSS preset-icons + Phosphor。所有动态绑定的 `i-ph-xxx` 必须加到 `uno.config.ts` 的 `safelist`
- **资产类目颜色**（asset-meta.ts）：cash 蓝 / deposit 深蓝 / wealth 紫 / fund 草绿 / stock 翠绿 / realestate 橙 / insurance 灰绿 / receivable 灰绿 / other 灰绿

### 未配置 Key 引导链路

未配置 `Settings.apiKey` 时全 app 触点都跳到 `/setup-key`：
- `Home.vue` 顶部橙色 banner
- `ScreenshotImporter.vue` 弹窗整个换成引导
- `AdviceCard.vue`（Trend / Goals 页）渲染"立即配置" CTA 替代 loading
- `Settings.vue` API Key 卡片状态徽章（已配 ✓ / 未配 ⚠️）+ "看保姆级引导 →" 链接

判断逻辑：`useAppStore().hasApiKey` getter，统一标准（`apiKey?.startsWith('sk-')`）。

### 已知坑点

1. **必须 Node 20+**：vite-plugin-pwa → workbox-build → lru-cache 11 用了 `diagnostics_channel.tracingChannel`，Node 18 上 build 会失败
2. **npm install 必须加 `--ignore-scripts`**：esbuild postinstall 在 macOS 沙箱（Claude Code）和某些 Linux CI 上会因二进制权限/沙箱失败；二进制本身仍可正常 require + 运行
3. **CF Pages 必须设 `NODE_VERSION=20`** 环境变量
4. **`tickerType` 已去掉 `crypto`**：用户决定不要加密货币，相关字段已从 types/AssetEditor select/recognize prompt 全部移除
5. **`market-data.ts` 不再抓 BTC/ETH**：只保留汇率（多源 fallback）+ 黄金（CoinGecko PAXG 锚定）
6. **PWA Service Worker dev 不启用**（`devOptions.enabled: false`），避免缓存调试麻烦；prod build 自动注入
7. **HMR 偶尔失效**：改动 store 大跳动时，`location.reload()` 强制刷新更稳
