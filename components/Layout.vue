<template>
   <div>
      <Toaster />
      <SupportWidget />
      <div class="flex min-h-screen w-full flex-col bg-muted/40">
        <div class="flex flex-col sm:gap-4 sm:py-1 sm:pl-14">

      <aside class="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
        <TooltipProvider>
        <nav class="flex flex-col items-center gap-4 px-2 py-4">
  
          <template v-for="item in menuItems" :key="item.label">
            <Tooltip>
              <TooltipTrigger as-child>
                <router-link :to="item.items[0]?.to"
                  class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  :class="checkActiveRoute(item.items[0]) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
                  :aria-current="checkActiveRoute(item.items[0]) ? 'page' : undefined">

                  <component :is="item.items[0].icon" class="h-5 w-5" />
                  <span class="sr-only">{{item.label}}</span>

                </router-link>
              </TooltipTrigger>
              <TooltipContent side="right">
                {{item.label}}
              </TooltipContent>
            </Tooltip>
          </template>
        </nav>
        </TooltipProvider>
        </aside>

        <!-- Aside is hidden below sm, which left narrow windows with no navigation at all -->
        <header class="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background px-3 sm:hidden">
          <Sheet v-model:open="isMobileNavOpen">
            <SheetTrigger as-child>
              <Button size="icon" variant="ghost" class="h-9 w-9" :aria-label="$t('menu')">
                <Menu class="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" class="w-64 p-4">
              <nav class="mt-6 flex flex-col gap-1">
                <router-link v-for="item in menuItems" :key="item.label" :to="item.items[0]?.to"
                  class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  :class="checkActiveRoute(item.items[0]) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
                  :aria-current="checkActiveRoute(item.items[0]) ? 'page' : undefined"
                  @click="isMobileNavOpen = false">
                  <component :is="item.items[0].icon" class="h-5 w-5" />
                  {{ item.label }}
                </router-link>
              </nav>
            </SheetContent>
          </Sheet>
          <span class="text-sm font-semibold">QX+ Insights</span>
        </header>

        <main class="grid flex-1 items-start gap-4 sm:py-0 md:gap-8">
          <div class="p-3 sm:p-5">
            <ApiKeyNotice />
            <slot />
          </div>
        </main>

        </div>
        </div>
   </div>
  </template>
  <script setup lang="ts">
  import {computed, ref} from "vue";
  
  import { applyTheme, getApiKey, saveDailyTotal, todayIso } from '~/utils/helper'
  import ApiKeyNotice from '~/components/ApiKeyNotice.vue'
  import SupportWidget from '~/components/SupportWidget.vue'
  
  import {
    Tooltip, TooltipContent,
    TooltipProvider, TooltipTrigger
  } from "~/components/ui/tooltip";
  
  import {Button} from "~/components/ui/button";
  import {Sheet, SheetContent, SheetTrigger} from "~/components/ui/sheet";
  import { Toaster } from '@/components/ui/toast'
  
  
  import {
    Home,
    Settings,
    List,
    ChartNoAxesColumnIncreasing,
    CircleHelp,
    Menu,
  } from "lucide-vue-next";

  const isMobileNavOpen = ref(false);

  import { useRoute } from 'vue-router';

  const route = useRoute();

  const checkActiveRoute = (item:any) => {
    return route.path === item.to || route.path === item;
  };
  
  import {useI18n} from "vue-i18n";

  const { t } = useI18n();
  
  
  applyTheme();
  const darkScheme = matchMedia('(prefers-color-scheme: dark)');
  // Re-reads the stored choice, so only 'system' reacts to the OS switch.
  const onSchemeChange = () => applyTheme();
  const menuItems = computed(() => {
    let items:any[] = [];

    items.push({ label: t('home'),
      items: [ {label: 'home', icon: Home, to: '/'},],
    });
    
    
    items.push({ label: t('list'),
      items: [ {label: 'list', icon: List, to: '/list'},],
    });

    items.push({ label: t('forecast'),
      items: [ {label: 'forecast', icon: ChartNoAxesColumnIncreasing, to: '/forecast'},],
    });

    items.push({ label: t('settings'),
      items: [ {label: 'settings', icon: Settings, to: '/settings'},],
    });

    items.push({ label: t('help'),
      items: [ {label: 'help', icon: CircleHelp, to: '/help'},],
    });

    
    return reactive(items);
  });
  
async function savePortfolioHistory() {
    console.log("savePortfolioHistory");
    
    const maxDays = 30;
    const history:any = (await storage.getItem('local:portfolio_history')) || [];
    const allList:any = (await storage.getItem('local:MAIN_LIST')) || [];
    
    const now = new Date();
    const today = todayIso();
    const index = history.findIndex((entry: { date: string }) => entry.date === today);
    
    const positions:any = allList.filter((item:any) => item.stock_name !== "Cash");

    const byIsin = new Map();
    positions.forEach((item: { isin:string; stocks_owned:number, buy_price:string, total_value:number, stock_name:string }) => {
      const existing = byIsin.get(item.isin);
      if (existing) {
        // Weighted, not first-wins: a summed quantity beside one account's entry
        // price would describe a position that never existed.
        const qtyA = Number(existing.stocks_owned) || 0;
        const qtyB = Number(item.stocks_owned) || 0;
        const costA = qtyA * (Number(existing.buy_price) || 0);
        const costB = qtyB * (Number(item.buy_price) || 0);
        existing.stocks_owned = qtyA + qtyB;
        existing.total_value = (Number(existing.total_value) || 0) + (Number(item.total_value) || 0);
        existing.buy_price = existing.stocks_owned ? (costA + costB) / existing.stocks_owned : 0;
        return;
      }
      byIsin.set(item.isin, {
        name: item.stock_name,
        isin: item.isin,
        stocks_owned: Number(item.stocks_owned) || 0,
        buy_price: Number(item.buy_price) || 0,
        total_value: Number(item.total_value) || 0,
      });
    });
    const listData = Array.from(byIsin.values());

    // Kept beside the merged fold, not instead of it: the fold is what the 30-day
    // series needs, but Home cannot scope gainers to one account without this.
    const accountData = positions.map((item:any) => ({
        name: item.stock_name,
        isin: item.isin,
        broker: item.broker,
        account_id: item.account_id,
        // Consors folds several depots into one account_id, and accountRowKey splits on this.
        deposite_number: item.deposite_number,
        stocks_owned: Number(item.stocks_owned) || 0,
        buy_price: Number(item.buy_price) || 0,
        total_value: Number(item.total_value) || 0,
      }));

    if (listData.length > 0) {
      if (index !== -1) {
        history[index].data = listData;
        history[index].accounts = accountData;
        history[index].updated_at = now.toISOString();
      } else {
        history.push({
          date: today,
          data: listData,
          accounts: accountData,
          updated_at: now.toISOString()
        });
      }

      // Keep only last N days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxDays);
      const filteredHistory = history.filter((entry: { date: string }) => {
        return new Date(entry.date) >= cutoffDate;
      });

      // Save updated history
      await storage.setItem('local:portfolio_history', filteredHistory);
    }
}


let historyInterval:any = null;
let authInterval:any = null;
onMounted( async() => {
  // Before the await, or an unmount during it would leave the listener behind.
  darkScheme.addEventListener('change', onSchemeChange);
  await getApiKey()

  //history
  savePortfolioHistory();
  const MINUTE = 60 * 1000;
  historyInterval = setInterval(savePortfolioHistory, MINUTE * 2);
  // getApiKey re-checks a rejected key once its cooldown passes, so an open dashboard heals without a reload.
  authInterval = setInterval(getApiKey, MINUTE * 2);

  //daily total
  saveDailyTotal();
});

onUnmounted(() => {
  clearInterval(historyInterval);
  clearInterval(authInterval);
  darkScheme.removeEventListener('change', onSchemeChange);
});
  
  </script>