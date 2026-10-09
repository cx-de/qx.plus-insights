<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <tr :class="cn('border-b transition-colors hover:bg-gray-300 dark:hover:bg-gray-700 data-[state=selected]:bg-muted odd:bg-gray-200 even:bg-gray-100 dark:odd:bg-gray-900 dark:even:bg-gray-800', props.class)">
    <slot />
  </tr>
</template>
