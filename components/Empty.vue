<template>
    <div class="flex flex-col items-center justify-center" :class="compact ? 'py-8 gap-3' : 'h-[50vh] gap-6'">
      <div class="flex items-center justify-center bg-muted rounded-full" :class="compact ? 'w-12 h-12' : 'w-20 h-20'">
        <Inbox class="text-muted-foreground" :class="compact ? 'w-6 h-6' : 'w-10 h-10'" aria-hidden="true" />
      </div>
      <div class="space-y-2 text-center">
        <h2 class="font-bold tracking-tight" :class="compact ? 'text-base' : 'text-2xl'">{{ $t(message) }}</h2>
        <p class="text-muted-foreground" :class="compact ? 'text-sm' : ''">
          {{ $t(description) }}
        </p>
      </div>
    </div>
  </template>

  <script setup>
  import { Inbox } from 'lucide-vue-next'

  defineProps({
    message: {
      type: String,
      default: 'no_data_available'
    },
    description: {
      type: String,
      default: "it_looks_like_there_is_no_data_available_yet"
    },
    // h-[50vh] + text-2xl overwhelmed table rows and dialogs
    compact: {
      type: Boolean,
      default: false
    }
  })
  </script>

