<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { inject } from 'vue'
import { cn } from '@/lib/utils'
import { commandFilterKey } from '.'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const filter = inject(commandFilterKey)!
</script>

<template>
  <div v-if="filter.visibleCount.value === 0" :class="cn('py-6 text-center text-sm text-muted-foreground', props.class)">
    <slot />
  </div>
</template>
