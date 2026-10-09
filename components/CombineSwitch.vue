<template>
  <div v-if="hasSharedBroker || (anyAccounts && accountCount > 1)" class="flex items-center gap-2">
    <Switch id="combine-accounts" :model-value="accountViewCombined"
      @update:model-value="set" />
    <Label for="combine-accounts" class="text-sm font-normal cursor-pointer whitespace-nowrap">
      {{ accountViewCombined ? $t('merge_accounts') : $t('separate_accounts') }}
    </Label>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import Label from '@/components/ui/label/Label.vue';
import { Switch } from '@/components/ui/switch';

// Rows already scoped by the account filter, so the switch follows the current selection.
const props = defineProps({
  rows: { type: Array, default: () => [] },
  // Forecast merges across brokers too, so its switch must show for any two accounts or Merge gets stuck on.
  anyAccounts: { type: Boolean, default: false },
});

// The page owns its own reload; this component only owns the preference, like AccountFilter.
const emit = defineEmits(['change']);

// Read from the rows in view, not the account registry: combining only merges accounts of
// one broker, so it means nothing unless two of them are on screen right now.
const hasSharedBroker = computed(() => {
  const accountsByBroker:any = {};
  for (const row of props.rows as any[]) {
    if (!row?.broker) continue;
    (accountsByBroker[row.broker] ||= new Set()).add(accountKeyOf(row));
  }
  return Object.values(accountsByBroker).some((keys:any) => keys.size > 1);
});

const accountCount = computed(() =>
  new Set((props.rows as any[]).filter((row:any) => row?.broker).map((row:any) => accountKeyOf(row))).size);

const set = (value:any) => {
  console.log("CombineSwitch set", value);
  accountViewCombined.value = !!value;
  accountViewCombinedSave();
  emit('change');
};
</script>
