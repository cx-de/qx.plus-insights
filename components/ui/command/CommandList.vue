<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ListboxContent } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ListboxContent :class="cn('max-h-[300px] overflow-y-auto overflow-x-hidden p-1', props.class)">
    <slot />
  </ListboxContent>
</template>
