<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

// 5 个核心价值：每个都用"以前痛点 → 现在方案"的反差结构
const values = [
  {
    icon: 'i-ph-squares-four-duotone',
    color: '#2E9E60',
    tag: '一屏总览',
    title: '关掉那 8 个 App',
    before: '算月底净值，要轮流打开支付宝 / 招行 / 富途 / 蚂蚁财富 / 加密钱包 / 房产估价工具 …',
    after: '在 Nestworth 一屏看完：总净值、月增、年增 (YTD)、距目标进度，加上 9 大类资产的占比可视化。',
  },
  {
    icon: 'i-ph-camera-duotone',
    color: '#5C8FE0',
    tag: '截图入账',
    title: '别再手抄余额',
    before: '账单截了一堆，得对着图一笔笔输入 App，输错还得返工。',
    after: '上传一张支付宝/银行/券商截图 → AI 1 秒识别金额、平台、类型、涨跌幅 → 一键勾选导入。\n7 个免费视觉模型自动 fallback，免费额度可识别 3500+ 张。',
  },
  {
    icon: 'i-ph-brain-duotone',
    color: '#E5604A',
    tag: '推理 AI',
    title: '不是模板顾问，是会思考的顾问',
    before: '市面上的 AI 理财大多是"通用模板配置 6:3:1"。',
    after: '我们用 DeepSeek-R1 推理模型 + 实时市场数据。\n• 走势页：诊断每一项资产 → 给出止盈/止损/调仓的具体动作\n• 目标页：基于实际缺口算出整体增值方案 → 现有持仓优化 + 中国/全球新增配置 + 分阶段时间表',
  },
  {
    icon: 'i-ph-shuffle-duotone',
    color: '#F5A623',
    tag: '交叉验证',
    title: '怕 AI 一家之言？让 N 个模型先开个会',
    before: '单模型回答总有"幻觉风险"，敢直接照做？',
    after: '设置里打开 N=2 或 N=3：DeepSeek-R1 + Qwen-Max + DeepSeek-V3 多个顶级模型并行回答，再让最强者综合 — 去掉离群、保留共识。\n相当于找了一组独立顾问开会，给你一个稳的方案。',
  },
  {
    icon: 'i-ph-broadcast-duotone',
    color: '#8B5CF6',
    tag: '实时锚点',
    title: 'AI 给的"年化 5-8%"不是瞎编',
    before: '某些 AI 顾问的年化预期是从训练数据里"拍脑袋"出来的。',
    after: 'Nestworth 实时拉 USD/CNY 汇率、BTC/ETH 行情、黄金价格，把这些"市场锚点"喂给模型再分析。\n每张建议卡底部明示：基于哪些数据、几点几分抓取、哪个模型生成。',
  },
  {
    icon: 'i-ph-lock-key-duotone',
    color: '#0EA5E9',
    tag: '本地优先',
    title: '你的资产数据，永远不离开你的设备',
    before: '记账类 SaaS 都要你注册账号，把账户密码、所有持仓上传到他们服务器。',
    after: '我们没有服务器、没有账号、没有埋点。\n所有数据存在你浏览器的 IndexedDB 里，跟你的 Cookie 一样属于你自己。\n截图也只在识别那 1 秒上传给阿里云 OCR，处理完即弃。',
  }
];

const steps = [
  {
    n: 1,
    title: '申请一个免费 API Key',
    detail: '阿里云百炼控制台注册（5 分钟）— 7 个视觉模型每个送 100 万 token，约够识别 3500 张截图。',
    cta: '前往申请 →',
    href: 'https://bailian.console.aliyun.com/'
  },
  {
    n: 2,
    title: '把 Key 粘贴到这里',
    detail: '在「设置 → Qwen-VL API Key」输入框粘贴保存。Key 加密存在你浏览器，离开浏览器就消失。'
  },
  {
    n: 3,
    title: '把分散的资产汇集进来',
    detail: '总览页两个大按钮：「截图识别」适合从 App 截图批量入账，「手动添加」适合定存、房产这类不变动的资产。'
  },
  {
    n: 4,
    title: '设个目标，听 AI 给方案',
    detail: '在「目标」页加一个目标（比如"年底总净值 600 万"）— AI 立刻给出整体增值方案：现有优化 + 新增配置 + 时间表。'
  },
  {
    n: 5,
    title: '隔几天导出一次备份',
    detail: '「设置 → 导出备份」生成 JSON 文件 → 存到 iCloud Drive / 网盘 / 邮箱。换设备直接导回。'
  }
];

const fits = [
  { ok: true, text: '同时管理 5 个以上金融账户，想集中查看的人' },
  { ok: true, text: '关心隐私、不愿把账户密码或资产明细交给陌生 SaaS 的人' },
  { ok: true, text: '愿意每月花 5 分钟更新数据、想要一个 AI 提醒哪里能优化的人' },
  { ok: true, text: '前端开发者 / 喜欢"自己能修"的工具的人（开源）' },
  { ok: false, text: '想要专业级量化分析或税务规划（请找认证理财师）' },
  { ok: false, text: '想要直接下单买卖（这是只读看板，不是交易工具）' }
];

const promises = [
  { icon: 'i-ph-database-duotone', title: '资产数据 100% 在你设备', body: '全部存在浏览器 IndexedDB 里，没有服务器，永远不上传。换设备靠你自己导出 JSON 迁移。' },
  { icon: 'i-ph-image-square-duotone', title: '截图识别完即弃', body: '截图只在识别瞬间传给阿里云 OCR，结构化结果回到你设备后原图就消失，我们这边没有任何留存。' },
  { icon: 'i-ph-key-duotone', title: 'API Key 在你浏览器加密', body: '不用注册账号，Key 跟你的 Cookie 一样属于你。可随时在设置页清除。' },
  { icon: 'i-ph-broadcast-duotone', title: 'AI 调用都标注来源', body: '每张建议卡底部明示用了哪个模型、抓了哪些实时数据、何时生成。可以审，可以核。' },
  { icon: 'i-ph-globe-duotone', title: '部署在 Cloudflare Pages', body: '纯静态前端，没有后端进程，没有埋点 SDK，没有第三方分析。' }
];
</script>

<template>
  <div class="px-5 pt-10 pb-6 flex flex-col gap-4">
    <!-- 顶栏 -->
    <header class="flex items-center gap-3">
      <button class="tap w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center text-ink-muted"
              @click="router.back()">
        <span class="i-ph-caret-left-bold text-base" />
      </button>
      <h1 class="font-brand font-600 text-2xl">关于 Nestworth</h1>
    </header>

    <!-- Hero -->
    <section class="rounded-card bg-gradient-to-br from-brand to-brand-600 text-white p-5 shadow-[0_12px_32px_rgba(46,158,96,0.25)]">
      <div class="flex items-baseline gap-0.5 font-brand mb-2">
        <span class="text-2xl font-700">Nest</span>
        <span class="text-2xl font-700 opacity-70">worth</span>
        <span class="ml-2 text-[11px] font-600 px-1.5 py-0.5 rounded bg-white/20">巢值</span>
      </div>
      <h2 class="text-[19px] font-700 leading-snug">
        一切关乎"你值多少"的事，<br/>
        现在只在一个画面里完成。
      </h2>
      <p class="text-[12px] opacity-85 mt-2.5 leading-relaxed">
        不必登录 · 不必交账户密码 · 不必再开 8 个 App<br/>
        本地存储 · 推理 AI · 多模型交叉 · 实时市场锚点
      </p>
    </section>

    <!-- 6 个核心价值（以前 vs 现在）-->
    <section class="flex flex-col gap-2.5">
      <div class="flex items-center gap-1.5 px-1 mb-1">
        <span class="i-ph-sparkle-duotone text-orange text-base" />
        <h3 class="font-700 text-[14px]">为什么是 Nestworth</h3>
      </div>
      <div v-for="v in values" :key="v.title"
           class="card-base !p-4">
        <div class="flex items-center gap-2.5 mb-2.5">
          <div class="w-9 h-9 rounded-icon flex items-center justify-center shrink-0"
               :style="{ background: v.color + '1A', color: v.color }">
            <span :class="v.icon" class="text-lg" />
          </div>
          <span class="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-700"
                :style="{ background: v.color + '22', color: v.color }">{{ v.tag }}</span>
          <h4 class="font-700 text-[14px] leading-tight flex-1">{{ v.title }}</h4>
        </div>

        <div class="bg-bg/60 rounded-icon px-2.5 py-2 mb-1.5 flex gap-2">
          <span class="text-[10px] font-700 text-ink-muted shrink-0 mt-0.5">以前</span>
          <p class="text-[11px] text-ink-muted leading-relaxed">{{ v.before }}</p>
        </div>
        <div class="rounded-icon px-2.5 py-2 flex gap-2"
             :style="{ background: v.color + '14' }">
          <span class="text-[10px] font-700 shrink-0 mt-0.5"
                :style="{ color: v.color }">现在</span>
          <p class="text-[11px] leading-relaxed whitespace-pre-line"
             :style="{ color: '#1F2D26' }">{{ v.after }}</p>
        </div>
      </div>
    </section>

    <!-- 5 步上手 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-3">
        <span class="i-ph-rocket-launch-duotone text-orange text-lg" />
        <h3 class="font-700 text-[15px]">5 步开始用</h3>
      </div>
      <div class="flex flex-col gap-3">
        <div v-for="s in steps" :key="s.n" class="flex gap-2.5">
          <div class="w-6 h-6 rounded-full bg-orange text-white flex items-center justify-center text-[10px] font-700 shrink-0 mt-0.5">
            {{ s.n }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-700 text-[13px]">{{ s.title }}</div>
            <div class="text-[11px] text-ink-muted leading-relaxed mt-0.5">{{ s.detail }}</div>
            <a v-if="s.href" :href="s.href" target="_blank" rel="noopener"
               class="text-[11px] text-brand font-600 mt-0.5 inline-block">
              {{ s.cta }}
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- 适合谁 / 不适合谁 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-3">
        <span class="i-ph-users-three-duotone text-blue text-lg" />
        <h3 class="font-700 text-[15px]">这个工具适合谁</h3>
      </div>
      <div class="flex flex-col gap-2">
        <div v-for="(f, i) in fits" :key="i" class="flex items-start gap-2 py-1">
          <span :class="f.ok ? 'i-ph-check-circle-duotone text-pos' : 'i-ph-x-circle-duotone text-ink-muted'"
                class="text-base mt-0.5 shrink-0" />
          <div class="text-[12px] leading-relaxed"
               :class="f.ok ? 'text-ink' : 'text-ink-muted'">{{ f.text }}</div>
        </div>
      </div>
    </section>

    <!-- 安全承诺（不是清单，是承诺）-->
    <section class="card-base bg-gradient-to-b from-pos/8 to-card border-pos/30">
      <div class="flex items-center gap-2 mb-3">
        <span class="i-ph-shield-check-duotone text-pos text-lg" />
        <h3 class="font-700 text-[15px]">我们对你的承诺</h3>
      </div>
      <p class="text-[11px] text-ink-muted leading-relaxed mb-3 italic">
        不是隐私政策模板，是我们能力范围内做到的事 —— 因为这个产品根本没有服务器，所以我们就算想"出卖"你也做不到。
      </p>
      <div class="flex flex-col gap-2.5">
        <div v-for="p in promises" :key="p.title" class="flex gap-2.5">
          <span :class="p.icon" class="text-pos text-base shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <div class="font-700 text-[12px]">{{ p.title }}</div>
            <div class="text-[11px] text-ink-muted leading-relaxed mt-0.5">{{ p.body }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 技术与开源 -->
    <section class="card-base">
      <div class="flex items-center gap-2 mb-2">
        <span class="i-ph-code-duotone text-blue text-lg" />
        <h3 class="font-700 text-[15px]">技术与开源</h3>
      </div>
      <p class="text-[11px] text-ink-muted leading-relaxed">
        前端：Vue 3 + TypeScript + Vite + UnoCSS + ECharts + Dexie<br/>
        AI：阿里云百炼（Qwen-VL Plus/Max · Qwen2.5-VL · QVQ · DeepSeek-R1 · DeepSeek-V3 · Qwen-Max）<br/>
        市场数据：CoinGecko · open.er-api.com · Frankfurter (ECB)<br/>
        部署：Cloudflare Pages — 纯静态、零后端、无埋点
      </p>
    </section>

    <!-- 版本 -->
    <div class="text-center text-[11px] text-ink-muted py-2 leading-relaxed">
      Nestworth · 巢值 v0.2.0<br/>
      <span class="opacity-70">为想认真看清自己资产的人而做</span>
    </div>
  </div>
</template>
