<template>
  <div v-if="accounts.length > 1" class="flex items-center gap-2">
    <template v-if="!compact">
      <Filter class="h-4 w-4 text-zinc-500" />
      <Label class="text-sm font-medium text-zinc-600">{{ $t('account') }}:</Label>
    </template>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="outline" :class="triggerClass"
          class="flex items-center justify-between font-normal">
          <Filter v-if="compact" class="h-3.5 w-3.5 mr-2 shrink-0 opacity-70" />
          <!-- Button's base class centres its content; the value has to read left. -->
          <span class="truncate text-left flex-1">{{ summary }}</span>
          <ChevronDown class="h-3.5 w-3.5 ml-2 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-56">
        <DropdownMenuCheckboxItem :model-value="accountViewIsAll()"
          @select="(e) => e.preventDefault()"
          @update:model-value="selectAll()">
          {{ $t('all_accounts') }}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem v-for="account in accounts" :key="account.key"
          :model-value="isChecked(account.key)"
          @select="(e) => e.preventDefault()"
          @update:model-value="(value) => toggle(account.key, value)">
          {{ account.label }}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, watch } from 'vue';
import Label from '@/components/ui/label/Label.vue';
import { Button } from '@/components/ui/button';
import { Filter, ChevronDown } from 'lucide-vue-next';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useI18n } from 'vue-i18n';

defineProps({
  triggerClass: { type: String, default: 'h-8 w-[220px]' },
  // Toolbar variant: no outside label, and the summary carries the icon instead.
  compact: { type: Boolean, default: false },
});

// The page owns its own reload; this component only owns the preference.
const emit = defineEmits(['change']);

const { t } = useI18n();
const accounts = ref<any[]>([]);

const summary = computed(() => {
  if (accountViewIsAll()) return t('all_accounts');
  if (accountViewSelected.value.length === 1) {
    const only = accounts.value.find((a:any) => a.key === accountViewSelected.value[0]);
    return only ? only.label : t('all_accounts');
  }
  return t('accounts_selected', { count: accountViewSelected.value.length });
});

const isChecked = (key:any) => accountViewSelected.value.includes(key);

// Empty selection IS "all", so clearing is the whole implementation.
const selectAll = () => {
  if (accountViewIsAll()) return;
  accountViewSelected.value = [];
  commit();
};

const toggle = (key:any, checked:any) => {
  const next = accountViewSelected.value.filter((k:any) => k !== key);
  if (checked) next.push(key);
  // No empty-selection case to handle: unticking the last one leaves [], which is "all".
  accountViewSelected.value = next;
  commit();
};

const commit = () => {
  accountViewSave();
  emit('change');
};

const loadAccounts = async () => {
  // Heals drift between the registry and the ids actually stamped on rows, which
  // otherwise makes a selection match nothing.
  const repaired = await accountReconcile();
  const rows = await accountList();
  accounts.value = rows.map((r:any) => ({ key: accountKeyOf(r), label: r.label }));
  // A deleted account left in the selection would filter the portfolio down to nothing.
  const pruned = accountViewPrune(accounts.value.map((a:any) => a.key));
  if (repaired || pruned) emit('change');
};

onMounted(loadAccounts);
watch(accountsVersion, loadAccounts);
</script>
