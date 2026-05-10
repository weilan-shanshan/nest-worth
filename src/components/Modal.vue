<script setup lang="ts">
defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" @click.self="emit('close')">
        <Transition name="slide-up" appear>
          <div class="w-full sm:max-w-[400px] bg-card rounded-t-card sm:rounded-card max-h-[85dvh] overflow-y-auto scroll-hide">
            <div v-if="title || $slots.header" class="sticky top-0 z-1 bg-card flex items-center justify-between px-5 pt-5 pb-3">
              <slot name="header">
                <h3 class="font-700 text-lg">{{ title }}</h3>
              </slot>
              <button class="tap text-ink-muted i-ph-x-bold text-xl" @click="emit('close')" />
            </div>
            <div class="px-5 pb-6">
              <slot />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
