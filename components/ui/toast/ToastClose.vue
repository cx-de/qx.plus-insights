<script setup lang="ts">
import { cn } from '@/lib/utils'
import { X } from 'lucide-vue-next'
import { ToastClose, type ToastCloseProps } from 'reka-ui'
import { computed, type HTMLAttributes } from 'vue'

const props = defineProps<ToastCloseProps & {
  class?: HTMLAttributes['class']
}>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})
</script>

<template>
  <ToastClose v-bind="delegatedProps" :class="cn('absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-hidden focus:ring-1 group-hover:opacity-100 group-[.destructive]:text-destructive-foreground/70 hover:group-[.destructive]:text-destructive-foreground focus:group-[.destructive]:ring-destructive-foreground/50 focus:group-[.destructive]:ring-offset-destructive', props.class)">
    <X class="h-4 w-4" />
  </ToastClose>
</template>
