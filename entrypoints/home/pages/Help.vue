<template>
  <div>

    <Card class="border-0 w-full max-w-lg shadow-lg rounded-lg p-6 bg-card text-card-foreground transition-all">
      <!-- header was commented out, leaving the page with no heading at all -->
      <CardHeader class="px-0 pt-0">
        <h1 class="text-2xl font-semibold leading-none tracking-tight">
          {{  $t('help_and_support') }}
        </h1>
        <CardDescription>
          {{  $t('need_assistance_we_are_here_to_help') }}
        </CardDescription>
      </CardHeader>
      <CardContent class="px-0 pb-0 text-sm text-muted-foreground">
        <dl class="space-y-4">
          <div class="flex justify-between gap-4">
            <dt class="font-medium text-foreground">{{ $t('version') }}</dt>
            <dd class="font-mono text-foreground">v{{ version }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="font-medium text-foreground">{{ $t('email') }}</dt>
            <dd>
              <a href="mailto:insights@qx.plus" class="rounded-sm text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">insights@qx.plus</a>
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="font-medium text-foreground">{{ $t('feedback' )}}</dt>
            <dd>
              <a href="https://vote.qx.plus" target="_blank" rel="noopener noreferrer" class="rounded-sm text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">vote.qx.plus</a>
            </dd>
          </div>
        </dl>

        <div class="flex justify-center mt-6">
          <Button variant="outline" @click="restartTour()">{{ $t('tour.restart') }}</Button>
        </div>

        <div class="flex justify-center mt-8">
          <a href="https://github.com/cx-de/qx.plus-insights" target="_blank" rel="noopener noreferrer"
             aria-label="GitHub" title="GitHub"
             class="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            <svg xmlns="http://www.w3.org/2000/svg"
              width="30" height="30" 
              viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 0C5.373 0 0 5.373 0 12a12 12 0 0 0 8.205 11.385c.6.111.82-.261.82-.58 0-.287-.01-1.04-.015-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.082-.73.082-.73 1.205.085 1.84 1.236 1.84 1.236 1.07 1.834 2.808 1.304 3.495.996.108-.776.418-1.305.76-1.605-2.665-.3-5.467-1.332-5.467-5.931 0-1.31.468-2.38 1.235-3.22-.125-.303-.535-1.523.115-3.176 0 0 1.005-.322 3.3 1.23a11.49 11.49 0 0 1 3.005-.405c1.02.005 2.045.137 3.005.405 2.28-1.552 3.285-1.23 3.285-1.23.655 1.653.245 2.873.12 3.176.77.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.37.815 1.1.815 2.22 0 1.604-.015 2.896-.015 3.286 0 .32.21.697.825.578A12.005 12.005 0 0 0 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
          </a>
        </div>

      </CardContent>
    </Card>

  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import pkg from '@/package.json'

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';


const { t } = useI18n();

// WelcomeDialog in App.vue watches TOUR and opens on 'choose'.
async function restartTour() {
  await chrome.storage.local.remove('TOUR_DISMISSED');
  await chrome.storage.local.set({ TOUR: { broker: null, step: 'choose' } });
}
document.title = t('help');
const version = ref(pkg.version); 
onMounted( async() => {
  
});

</script>

<style scoped>
</style>
