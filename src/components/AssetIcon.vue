<script setup lang="ts">
import { computed } from 'vue';
import type { AssetCategory } from '../types';
import { CATEGORY_MAP } from '../lib/asset-meta';

const props = defineProps<{ category: AssetCategory; size?: number }>();

const meta = computed(() => CATEGORY_MAP[props.category] ?? CATEGORY_MAP.other);
const size = computed(() => props.size ?? 40);
</script>

<template>
  <div
    class="rounded-icon flex items-center justify-center shrink-0"
    :style="{
      width: size + 'px',
      height: size + 'px',
      background: meta.color + '1A',
      color: meta.color
    }"
  >
    <span :class="meta.icon" :style="{ fontSize: (size * 0.55) + 'px' }" />
  </div>
</template>
