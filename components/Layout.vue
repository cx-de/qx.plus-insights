<template>
   <div>
      <Toaster />
      <SupportWidget />
      <div class="flex min-h-screen w-full flex-col bg-muted/40">
        <!-- <div class="flex flex-col sm:gap-4 sm:py-4 sm:pl-14"> -->
        <div class="flex flex-col sm:gap-4 sm:py-1 sm:pl-14">

      <aside class="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
        <TooltipProvider>
        <nav class="flex flex-col items-center gap-4 px-2 py-4">
  <!--        <a href="#" class="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base">
            <Package2 class="h-4 w-4 transition-all group-hover:scale-110" />
            <span class="sr-only">Acme Inc</span>
          </a>-->
  
          <template v-for="(item, i) in menuItems" :key="item">
            
            <!-- Search -->
            <!-- <TooltipProvider v-if="i==1">
              <Tooltip>
                <TooltipTrigger as-child>
                  <div @click="isSearchModal=true" class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground md:h-8 md:w-8">
                    <Search class="h-5 w-5" />
                    <span class="sr-only">{{ $t('search') }}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{{ $t('search') }}</TooltipContent>
              </Tooltip>
            </TooltipProvider> -->
  
            <!-- Menus -->
            <Tooltip>
              <TooltipTrigger as-child>
                <router-link :to="item.items[0]?.to"
                  class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  //import Autocomplete from "~/components/Autocomplete.vue";
  
  import { getApiKey,apiKey,saveDailyTotal } from '~/utils/helper'
  import ApiKeyNotice from '~/components/ApiKeyNotice.vue'
  import SupportWidget from '~/components/SupportWidget.vue'
  import { reloadPriceData } from '~/utils/price-data-utils'
  
  import {
    Tooltip, TooltipContent,
    TooltipProvider, TooltipTrigger
  } from "~/components/ui/tooltip";
  
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger
  } from "~/components/ui/dropdown-menu";

  import {Button} from "~/components/ui/button";
  import {Sheet, SheetContent, SheetTrigger} from "~/components/ui/sheet";
  import {Input} from "~/components/ui/input";
  import { Toaster } from '@/components/ui/toast'
  import { Skeleton } from '@/components/ui/skeleton'
  
  
  import {
    Home,
    Settings,
    List,
    ChartPie,
    ChartNoAxesColumnIncreasing,
    CircleHelp,
    Menu,
  } from "lucide-vue-next";

  const isMobileNavOpen = ref(false);

  //import {usePermissionStore} from "~/store/permissions";
  import { useRoute } from 'vue-router';

  const route = useRoute();

  const checkActiveRoute = (item) => {
    return route.path === item.to || route.path === item;
  };
  
  //const router = useRouter();
  //const { $sanctumAuth } = useNuxtApp()
  // 
  import {useI18n} from "vue-i18n";

  const { t,locale } = useI18n();
  
  
  //const { locale, availableLocales } = useI18n();
  //const currentLang = ref(localStorage.getItem('lang') || locale);
  
  
  const onLanguageChange = async (lang) => {
    console.log("onLanguageChange",lang)
    
    setLocale(lang);
    localStorage.setItem('lang', lang)
  }
  const langaugeOptions = [
    {id: 'de', name: "DE"},
    {id: 'en', name: "EN"},
  ];
  
  
  const theme = ref(localStorage.getItem('theme') || 'light');
  const setTheme = (themeName) => {
    /*const themeId = 'prime-theme-link'
    let themeLink = document.getElementById(themeId)
  
    if (themeLink) {
      themeLink.href = themeName === 'light'
          ? '/themes/soho-light/theme.css'
          : '/themes/soho-dark/theme.css'
    } else {
      // Create a new link element for the selected theme
      themeLink = document.createElement('link')
      themeLink.id = themeId
      themeLink.rel = 'stylesheet'
      themeLink.href = themeName === 'light'
          ? '/themes/soho-light/theme.css'
          : '/themes/soho-dark/theme.css'
      document.head.appendChild(themeLink)
    }*/
  
    if(themeName==="light"){
      document.documentElement.classList.remove('dark');
    }else{
      document.documentElement.classList.add('dark');
    }
    //document.documentElement.classList.toggle('dark');
  }
  
  setTheme(theme.value);
  // Theme toggle function
  const toggleTheme = () => {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    setTheme(theme.value)
    localStorage.setItem('theme', theme.value)
  }
  
  //const store = usePermissionStore()
  const menuItems = computed(() => {
    let items = [];

    items.push({ label: t('home'),
      items: [ {label: 'home', icon: Home, to: '/'},],
    });
    
    /*
    items.push({ label: t('aggregate'),
      items: [ {label: 'aggregate', icon: ChartPie, to: '/aggregate'},],
    });
    */
    
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

    // items.push({ label: t('home'),
    //   items: [ {label: t('dashboard'), icon: 'Home', to: '/'},],
    // });
    
    //console.log("items : ",items)
    return reactive(items);
  });
  
  const logout = async () => {
    await $sanctumAuth.logout((data) => {
      setTheme('dark');
      router.push('/auth/login');
      setTimeout(()=>{
        localStorage.clear();
      },1000);
    });
  }
  
  //const {$apiFetch} = useNuxtApp();
  
  const horses = ref([]);
  const getHorses = async () => {
    isLoading.value = true;
    const horsesData = await $apiFetch(`horses`, {
      headers: {'Team-Id': localStorage.getItem('team_id'),},
    });
    console.log("getHorses horsesData: ",horsesData)
    horses.value = horsesData;
    isLoading.value = false;
  }
  
  const isLoading = ref(false);
  //const selectedSearch = ref(localStorage.getItem('selectedSearch') ? localStorage.getItem('selectedSearch') : '' );
  const selectedSearch = ref('');
  const searchData = ref([]);
  
  
  
  const changeSearch = (event) => {
    console.log("changeSearch:", event)
    selectedSearch.value = event;
    if(event.id){
      setTimeout(()=>{
        localStorage.setItem('selectedSearch',selectedSearch.value);
        navigateTo("/horses/"+event.id+"/edit");
      },500);
    }
  }
  
  //import debounce from 'lodash/debounce';
  
  const isSearchModal = ref(false);
  const searchTerm = ref('');
  
  
//   const debouncedSearch = debounce((term) => {
//     fetchResults(term);
//   }, 300);
  
  
  const fetchResults = async (event) => {
    console.log("fetchResults event", event)
    console.log("fetchResults event", event.srcElement.value)
    
    //console.log("searchHorse horses", horses.value)
    if(isLoading.value){
      console.log("fetchResults already searching --->")
      return false;
    }
  
    isLoading.value = true;
    let q = event.srcElement.value.trim();
    searchTerm.value = q;
    const horsesData = await $apiFetch(`search?search=${q}`, {
      headers: {'Team-Id': localStorage.getItem('team_id'),},
    });
    console.log("getHorses horsesData: ", horsesData)
    searchData.value = horsesData.data;
    isLoading.value = false;
  }
  
  
  const highlightText = (text)=> {
    if (!searchTerm.value) return text;
    const escapedTerm = searchTerm.value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // Escape special characters
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    return text ? text.replace(regex, '<span class="text-green-600">$1</span>') : '';
  }
  
  const getColorBySex = (sex_id) => {
    console.log("getColorBySex sex_id", sex_id)
    if (sex_id === 1) {
      return "#964B00";
    } else if (sex_id === 2) {
      return "#000";
    } else if (sex_id === 3) {
      return "#FFF";
    } else {
      return "#964B00";
    }
  }


async function savePortfolioHistory() {
    console.log("savePortfolioHistory");
    
    const maxDays = 30;
    const history:any = (await storage.getItem('local:portfolio_history')) || [];
    const allList:any = (await storage.getItem('local:MAIN_LIST')) || [];
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
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
let priceInterval:any =null;
onMounted( async() => {
  await getApiKey()
  //console.log("layout onMounted apiKey",apiKey.value);
  
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
});
  
  </script>