<template>
  <div>
    <div class="mx-auto grid 1max-w-[59rem] flex-1 auto-rows-max gap-4">
      
      <div class="w-full overflow-auto shadow-lg rounded-lg">
      
        <Card class="block w-full  p-6 bg-white dark:bg-gray-900 transition-all">
          <CardContent>
            

            <div class="w-full lg:w-auto flex items-center justify-center">
              
                <div  class="relative w-[400px] h-[400px]">
              
                  <template v-if="isLoading">
                    <Skeleton class="h-full rounded-xl" />
                  </template>
                  <template v-else>
                    
                    <div v-if="chartData.datasets[0].data.length">
                        <Doughnut :data="chartData" :options="chartOptions" ref="chartRef" />
                        <div v-html="centerText"
                        class="absolute inset-0 flex items-center justify-center text-xl font-bold pointer-events-none w-52 ml-24 max-w-60 text-center">
                        </div>
                    </div>
                    <div v-else>
                      <Empty />
                    </div>
                  </template>

                </div>
              </div>
          
            </CardContent>
         </Card>
        
        </div>
      </div>
</div>
      
      
</template>

<script lang="ts" setup>
import { ref } from 'vue';

document.title = "Aggregate";

import { numberToGerman } from '~/utils/helper';
import { Doughnut } from 'vue-chartjs'
import { Skeleton } from '@/components/ui/skeleton'
import Empty from '~/components/Empty.vue'


import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, ArcElement)


const listData = ref([]);

const customColors = [
  '#3B5B84',
  '#A03F78', 
  '#98BD4A', 
  '#CA9B4F', 

  '#294D7B', 
  '#952968', 
  '#86AF30', 
  '#BB8733', 

  '#1D406D', 
  '#841A58', 
  '#749C1F', 
  '#A77321', 

  '#113461', 
  '#760C4A', 
  '#638B0E', 
  '#94610E', 

  '#072954',
  '#66003C',
  '#517800',
  '#804F00'
];

const centerText = ref('')
const chartData = ref({
  labels: [],
  datasets: [
    {
      label: 'Positions',
      data: [],
      backgroundColor: [],
      borderWidth: 0,
    }
  ]
})

const chartOptions = ref({
  responsive: true,
  cutout: '60%',
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false },
  },
  onHover(event, elements, chart) {
    const el = elements?.[0];
    if (el) {
      const dataset = chart.data.datasets?.[0];
      
      const total = (dataset?.data as number[]).reduce((acc, val) => acc + val, 0);
      const value = (dataset?.data as number[])[el.index];
      const percentage = ((value / total) * 100).toFixed(1);
      // scraped stock names land in v-html; escape so a name with markup cannot inject it
      const label = String(chart.data.labels?.[el.index] ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      
      centerText.value = `${label}<br>${numberToGerman(percentage)}%<br>€ ${numberToGerman(value)}`;
    } else {
      centerText.value = `${numberToGerman(100)}%<br>€ ${totalAmount.value}`;
    }
  }
});


const totalAmount = ref(0);
const updateChartData = () => {
  const map = new Map<string, number>()

  for (const item of listData.value) {
    const name = item.stock_name
    const value = item.total_entry_value || 0

    console.log(`📊 ${name}:`, value)

    if (!name || isNaN(value)) continue
    map.set(name, (map.get(name) || 0) + value)
  }

  let sorted = Array.from(map.entries())
    .map(([name, y]) => ({ name, y }))
    .sort((a, b) => {
      // Move "cash" to the end
      if (a.name.toLowerCase() === 'cash') return 1
      if (b.name.toLowerCase() === 'cash') return -1
      return b.y - a.y
    })

  if (sorted.length === 0) {
    console.log('No valid chart data after processing')
    return
  }

  chartData.value.labels = sorted.map(i => i.name);
  chartData.value.datasets[0].data = sorted.map(i => i.y);
  chartData.value.datasets[0].backgroundColor = sorted.map((_, i) => _.name== "Cash" ? '#fe4d4d' : customColors[i % customColors.length]);

  totalAmount.value = listData.value.reduce((sum, item) => sum + item.total_entry_value, 0);
  totalAmount.value = numberToGerman(totalAmount.value);
  centerText.value = `${numberToGerman(100)}%<br>€ ${totalAmount.value}`;
}

const isLoading = ref(true);
onMounted( async() => {
  const konto = await storage.getItem('local:KONTO_FLATEX');
  if(konto){
    listData.value = konto;
    updateChartData();
  }
  isLoading.value = false;
  console.log("list konto",listData);
});
</script>

<style scoped>
</style>
