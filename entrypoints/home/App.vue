<template>
  <Layout>
    <RouterView />

    <!-- new account -->
    <AlertDialog v-model:open="isNewAccount">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ $t('account_switch.title') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('account_switch.text', {
              broker: pendingAccount?.broker,
              account: pendingAccount?.account_id
            }) }}
            <span class="mt-2 block font-medium text-destructive">
              {{ $t('account_switch.replace_warning', { broker: pendingAccount?.broker }) }}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="cancelAccountSwitch()">{{ $t('cancel') }}</AlertDialogCancel>
          <Button variant="destructive" @click="replaceNewAccount()">{{ $t('account_switch.replace_account') }}</Button>
          <AlertDialogAction @click="addNewAccount()">{{ $t('account_switch.add_account') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <UpdateDialog :blocked="isNewAccount" />
  </Layout>

</template>

<script lang="ts" setup>
import Layout from '@/components/Layout.vue';
import UpdateDialog from '@/components/UpdateDialog.vue';
import { todayIso } from "~/utils/helper";

import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


const isNewAccount = ref(false);
// A plain `let` here was never reactive; the dialog only appeared to update because
// the template re-read it when isNewAccount flipped.
const pendingAccount = ref<any>(null);

// Cancel keeps this broker frozen on purpose - only the dialog is snoozed.
const cancelAccountSwitch = async () => {
  isNewAccount.value = false;
  const account = pendingAccount.value;
  if (account) await accountSnooze(account.broker, account.account_id);
  console.log('cancelAccountSwitch, isNewAccount:', isNewAccount.value);
  await detectAccountChange();
}

const addNewAccount = async () => {
  isNewAccount.value = false;
  const account = pendingAccount.value;
  if (!account) return;
  console.log('addNewAccount', account.broker, account.account_id);
  await accountAccept(account.broker, account.account_id);
  await detectAccountChange();
}

const replaceNewAccount = async () => {
  isNewAccount.value = false;
  const account = pendingAccount.value;
  if (!account) return;
  console.log('replaceNewAccount', account.broker, account.account_id);

  // Only this broker's other accounts go; clearAllStockData() wiped all four brokers.
  const existing = (await accountList()).filter((r:any) => r.broker === account.broker
    && r.account_id !== account.account_id);
  for (const old of existing) {
    await accountClearData(account.broker, old.account_id);
  }

  await accountAccept(account.broker, account.account_id);

  if (account.broker === 'Flatex') {
    // Keys carry the account now, but Replace has just cleared every other flatex
    // account above, so nothing in this store still belongs to anyone.
    await storage.removeItem('local:FLATEX_PURCHASE_DATES');
    await storage.setItem('local:CUR_FLATEXID', account.account_id);
    const today = todayIso();
    await storage.setItem('local:flatexUserSync',today);
  }
  if (account.broker === 'justTRADE') {
    // Its ISIN/WKN entries went with accountClearData; point the id at the kept account.
    await storage.setItem('local:CUR_JUSTTRADEID', account.account_id);
  }
  await detectAccountChange();
}

const detectAccountChange = async () =>{
  const next = await accountNextPrompt();
  pendingAccount.value = next;
  isNewAccount.value = !!next;
  console.log('detectAccountChange pendingAccount:', next);
}

onMounted(async () => {

  // Popup may open before any broker page has run; migrate here too, it is idempotent.
  await accountMigrate();

  await detectAccountChange();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.NEW_ACCOUNTS) {
      console.log('appp mounted onChange NEW_ACCOUNTS:', changes.NEW_ACCOUNTS.newValue);
      detectAccountChange();
    }
    // A content script adopting an account cannot bump the popup's module ref.
    // Compare membership: scrapers rewrite this key on a last_seen touch too, and
    // reloading every page for that would fight the 10s scrape tick.
    if (changes.ACCOUNTS) {
      const keyset = (rows:any) => (Array.isArray(rows) ? rows : [])
        .map((r:any) => `${r.broker}::${r.account_id}`).sort().join('|');
      if (keyset(changes.ACCOUNTS.oldValue) !== keyset(changes.ACCOUNTS.newValue)) {
        console.log('appp mounted onChange ACCOUNTS');
        accountsVersion.value++;
      }
    }
  });

});
</script>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #54bc4ae0);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
