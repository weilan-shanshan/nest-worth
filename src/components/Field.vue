<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
  <label class="block">
    <span class="text-xs text-ink-muted font-600 mb-1.5 block">{{ label }}</span>
    <slot />
  </label>
</template>
