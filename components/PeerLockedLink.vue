<template>
  <!-- Peer data comes from the feed; without a subscription each cell shows a plain notice instead. -->
  <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
    <Lock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    {{ $t('peer_members_needs_subscription') }}
  </span>
</template>

<script setup lang="ts">
import { Lock } from 'lucide-vue-next';
</script>
