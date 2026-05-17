<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue';
import { useAppStore } from '../store/assets';
import Modal from '../components/Modal.vue';
import Field from '../components/Field.vue';
import AdviceCard from '../components/AdviceCard.vue';
import { formatMoney } from '../lib/format';
import type { Goal } from '../types';
import { adviseGoal, clearAdviceCache, type GoalAdvice, type AdviceMeta } from '../lib/advisor';
import AdviceMetaFooter from '../components/AdviceMetaFooter.vue';
import { trackCta } from '../lib/analytics';

const store = useAppStore();
const open = ref(false);
const editing = ref<Goal | null>(null);

const form = reactive({
  name: '',
  target: 0,
  current: 0,
  deadline: ''
});

const goalsWithProgress = computed(() => store.goals.map(g => ({
  ...g,
  pct: g.target > 0 ? Math.min(100, Math.max(0, (Math.max(g.current, store.totalNetWorth) / g.target) * 100)) : 0
})));

function openNew() {
  editing.value = null;
  Object.assign(form, { name: '', target: 0, current: store.totalNetWorth, deadline: '' });
  open.value = true;
}

function openEdit(g: Goal) {
  editing.value = g;
  Object.assign(form, { name: g.name, target: g.target, current: g.current, deadline: g.deadline || '' });
  open.value = true;
}

async function save() {
  if (!form.name.trim() || !form.target) return;
  const payload = {
    name: form.name.trim(),
    target: Number(form.target),
    current: Number(form.current) || 0,
    deadline: form.deadline || undefined
  };
  if (editing.value?.id) {
    await store.updateGoal(editing.value.id, payload);
  } else {
    await store.addGoal(payload);
    trackCta('add_goal');
  }
  open.value = false;
}

async function remove() {
  if (editing.value?.id) {
    await store.deleteGoal(editing.value.id);
    open.value = false;
  }
}

function daysLeft(d?: string) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

// AI 目标建议（每个 goal 一份）
const adviceMap = ref<Record<number, GoalAdvice>>({});
const adviceMetaMap = ref<Record<number, AdviceMeta>>({});
const adviceLoading = ref<Record<number, boolean>>({});
const adviceError = ref<Record<number, string | null>>({});

async function loadAdvice(goal: Goal, force = false) {
  if (!goal.id) return;
  adviceLoading.value = { ...adviceLoading.value, [goal.id]: true };
  adviceError.value = { ...adviceError.value, [goal.id]: null };
  try {
    if (force) await clearAdviceCache(`goal-${goal.id}`);
    const { advice, meta } = await adviseGoal(goal, store.assets, store.totalNetWorth);
    adviceMap.value = { ...adviceMap.value, [goal.id]: advice };
    adviceMetaMap.value = { ...adviceMetaMap.value, [goal.id]: meta };
  } catch (e: any) {
    adviceError.value = { ...adviceError.value, [goal.id]: e.message || '建议获取失败' };
  } finally {
    adviceLoading.value = { ...adviceLoading.value, [goal.id]: false };
  }
}

onMounted(() => {
  store.goals.forEach(g => loadAdvice(g));
});

watch(() => store.goals.map(g => g.id).join(','), () => {
  store.goals.forEach(g => {
    if (!adviceMap.value[g.id!]) loadAdvice(g);
  });
});
</script>

<template>
  <div class="px-5 pt-12 flex flex-col gap-4">
    <header class="flex items-center justify-between">
      <h1 class="font-brand font-600 text-2xl">目标</h1>
      <button class="tap w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center"
              @click="openNew">
        <span class="i-ph-plus-bold text-lg" />
      </button>
    </header>

    <div class="flex flex-col gap-3">
      <template v-for="g in goalsWithProgress" :key="g.id">
        <!-- 目标卡片 -->
        <div class="card-base tap" @click="openEdit(g)">
          <div class="flex items-start justify-between">
            <div>
              <div class="font-700 text-[15px]">{{ g.name }}</div>
              <div class="text-[11px] text-ink-muted mt-0.5">
                <template v-if="g.deadline">距 {{ g.deadline }} {{ daysLeft(g.deadline) }} 天</template>
                <template v-else>无截止</template>
              </div>
            </div>
            <div class="text-right">
              <div class="font-brand text-xl font-600"
                   :class="g.pct >= 80 ? 'text-brand' : 'text-orange'">{{ g.pct.toFixed(0) }}%</div>
            </div>
          </div>
          <div class="mt-3 h-2 bg-brand/10 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all"
                 :class="g.pct >= 80 ? 'bg-brand' : 'bg-orange'"
                 :style="{ width: g.pct + '%' }" />
          </div>
          <div class="mt-2 flex items-center justify-between text-[11px] text-ink-muted">
            <span>当前 ¥{{ formatMoney(Math.max(g.current, store.totalNetWorth), { decimals: 0 }) }}</span>
            <span>目标 ¥{{ formatMoney(g.target, { decimals: 0 }) }}</span>
          </div>
        </div>

        <!-- AI 整体增值方案 -->
        <AdviceCard
          title="整体增值方案"
          icon="i-ph-lightbulb-duotone"
          :loading="adviceLoading[g.id!]"
          :error="adviceError[g.id!]"
          :empty="!adviceLoading[g.id!] && !adviceMap[g.id!]"
          empty-text="点右上刷新生成 AI 建议"
          @refresh="loadAdvice(g, true)"
        >
          <div v-if="adviceMap[g.id!]" class="flex flex-col gap-3">
            <!-- 总判断 -->
            <div class="text-[12px] leading-relaxed bg-brand/10 text-ink px-3 py-2.5 rounded-icon border-l-2 border-brand">
              {{ adviceMap[g.id!].summary }}
            </div>

            <!-- 现有持仓优化 -->
            <div v-if="adviceMap[g.id!].currentOptimization.length" class="flex flex-col gap-1.5">
              <div class="flex items-center gap-1.5 text-[11px] text-ink-muted font-700">
                <span class="i-ph-arrows-clockwise-bold text-brand" />
                <span>① 现有持仓优化</span>
              </div>
              <div v-for="(s, i) in adviceMap[g.id!].currentOptimization" :key="i"
                   class="flex gap-2.5 px-2.5 py-2 rounded-icon bg-bg/60">
                <div class="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center text-[10px] font-700 shrink-0">{{ i + 1 }}</div>
                <div class="flex-1 min-w-0">
                  <div class="font-700 text-[13px]">{{ s.title }}</div>
                  <div class="text-[11px] text-ink-muted leading-relaxed mt-0.5">{{ s.detail }}</div>
                  <div class="text-[10px] text-pos font-600 mt-0.5 flex items-center gap-1">
                    <span class="i-ph-check-circle-duotone" />预期：{{ s.impact }}
                  </div>
                </div>
              </div>
            </div>

            <!-- 新增配置（中国 + 全球） -->
            <div v-if="adviceMap[g.id!].newAllocations.length" class="flex flex-col gap-1.5">
              <div class="flex items-center gap-1.5 text-[11px] text-ink-muted font-700">
                <span class="i-ph-globe-hemisphere-east-duotone text-orange" />
                <span>② 新增配置（中国 + 全球市场）</span>
              </div>
              <div v-for="(s, i) in adviceMap[g.id!].newAllocations" :key="i"
                   class="px-2.5 py-2 rounded-icon bg-bg/60 flex gap-2.5">
                <div class="w-5 h-5 rounded-full bg-orange text-white flex items-center justify-center text-[10px] font-700 shrink-0">{{ i + 1 }}</div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-700 text-[13px]">{{ s.title }}</span>
                    <span class="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-700"
                          :class="s.market === 'china' ? 'bg-neg/15 text-neg' : (s.market === 'global' ? 'bg-blue/15 text-blue' : 'bg-brand/15 text-brand')">
                      {{ s.market === 'china' ? '🇨🇳 中国' : s.market === 'global' ? '🌐 全球' : '🌏 全球+中国' }}
                    </span>
                    <span class="px-1.5 h-4 inline-flex items-center rounded text-[9px] font-700"
                          :class="s.risk === 'low' ? 'bg-pos/15 text-pos' : s.risk === 'high' ? 'bg-neg/15 text-neg' : 'bg-orange/15 text-orange'">
                      {{ s.risk === 'low' ? '低风险' : s.risk === 'high' ? '高风险' : '中风险' }}
                    </span>
                  </div>
                  <div class="text-[10px] text-ink-muted mt-0.5 font-mono">{{ s.type }}</div>
                  <div class="text-[11px] text-ink leading-relaxed mt-1">{{ s.detail }}</div>
                  <div class="text-[10px] text-pos font-600 mt-0.5 flex items-center gap-1">
                    <span class="i-ph-trend-up-duotone" />预期：{{ s.expectedReturn }}
                  </div>
                </div>
              </div>
            </div>

            <!-- 行动时间表 -->
            <div v-if="adviceMap[g.id!].actionPlan.length" class="flex flex-col gap-1.5">
              <div class="flex items-center gap-1.5 text-[11px] text-ink-muted font-700">
                <span class="i-ph-calendar-check-duotone text-brand" />
                <span>③ 分阶段行动</span>
              </div>
              <div class="bg-bg/60 rounded-icon px-2.5 py-2">
                <div v-for="(s, i) in adviceMap[g.id!].actionPlan" :key="i"
                     class="flex gap-2.5 py-1.5 border-b border-border/50 last:border-b-0">
                  <div class="text-[10px] font-700 text-brand w-16 shrink-0 pt-0.5">{{ s.phase }}</div>
                  <div class="text-[11px] text-ink leading-relaxed flex-1">{{ s.action }}</div>
                </div>
              </div>
            </div>
          </div>
          <AdviceMetaFooter v-if="adviceMetaMap[g.id!]" :meta="adviceMetaMap[g.id!]" />
        </AdviceCard>
      </template>

      <div v-if="store.goals.length === 0" class="text-center text-ink-muted text-sm py-12">
        点右上 + 添加你的第一个财务目标
      </div>
    </div>
  </div>

  <Modal :open="open" :title="editing ? '编辑目标' : '添加目标'" @close="open = false">
    <div class="flex flex-col gap-4">
      <Field label="目标名称">
        <input v-model="form.name" placeholder="例如：年底总净值 600 万" class="g-input" />
      </Field>
      <Field label="目标金额 (CNY)">
        <input v-model.number="form.target" type="number" class="g-input" />
      </Field>
      <Field label="当前金额 (默认按总净值跟随)">
        <input v-model.number="form.current" type="number" class="g-input" />
      </Field>
      <Field label="截止日期 (可选)">
        <input v-model="form.deadline" type="date" class="g-input" />
      </Field>
      <div class="flex gap-3 mt-2">
        <button v-if="editing" class="tap flex-1 h-12 rounded-icon border border-neg text-neg font-600" @click="remove">删除</button>
        <button class="tap flex-1 h-12 rounded-icon bg-brand text-white font-700" @click="save">保存</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.g-input {
  width: 100%; height: 44px;
  background: #F5FAF6; border: 1px solid #E0EFE6;
  border-radius: 12px; padding: 0 14px; font-size: 15px;
  outline: none; transition: border-color 0.15s;
}
.g-input:focus { border-color: #2E9E60; background: #fff; }
</style>
