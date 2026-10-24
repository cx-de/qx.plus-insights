<template>
  <div class="flex w-full">
    <Card class="border-0 w-full shadow-lg rounded-lg bg-card text-card-foreground transition-all">
      <CardContent class="p-6">

        <Tabs class="flex flex-col md:flex-row w-full gap-6" default-value="subscription">
          <!-- Sidebar nav -->
          <aside class="md:w-60 md:border-r md:pr-4 shrink-0">
            <TabsList class="flex md:flex-col flex-row md:space-y-1 gap-1 bg-transparent w-full overflow-x-auto md:overflow-visible">
              <TabsTrigger
                v-for="tab in tabs"
                :key="tab.value"
                :value="tab.value"
                class="rounded-md text-sm font-medium h-9 px-3 py-2 w-auto md:w-full justify-start text-left text-primary data-[state=active]:bg-muted data-[state=active]:shadow-none hover:bg-muted dark:data-[state=active]:bg-muted dark:data-[state=active]:text-primary"
              >
                <span class="flex items-center gap-2 w-full min-w-0">
                  <component :is="tab.icon" class="h-4 w-4 shrink-0" />
                  <span class="truncate">{{ $t(tab.label) }}</span>
                  <!-- Save is disabled by errors on any tab, so mark where they are -->
                  <span v-if="tabHasError(tab.value)" class="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500"
                    :aria-label="$t('settings_page.tab_has_errors')" role="img"></span>
                </span>
              </TabsTrigger>
            </TabsList>
          </aside>

          <!-- Content -->
          <div class="flex-1 md:pl-2 min-w-0">

            <!-- Subscription & API Key -->
            <TabsContent value="subscription" class="mt-0">
              <SectionHeader
                :title="$t('subscription_and_api_key')"
                :description="$t('settings_page.desc_subscription')"
              />

              <!-- Panel first in DOM so narrow popups see usage under the header; wide ones get it as a side column -->
              <div class="grid gap-6 items-start lg:grid-cols-[minmax(0,28rem)_minmax(0,34rem)]">
                <ApiUsagePanel :api-key="savedApiKey" class="lg:order-2 lg:sticky lg:top-4" @usage="usage = $event" />

                <div class="max-w-md space-y-6 lg:order-1">
                  <Field
                    :label="$t('api_key')"
                    for-id="inputApikey"
                  >
                    <div class="relative">
                      <Input
                        v-model="apiKey"
                        :type="isHiddenApiKey ? 'password' : 'text'"
                        id="inputApikey"
                        :placeholder="$t('enter_api_key')"
                        class="pr-10"
                      />
                      <button
                        type="button"
                        class="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                        @click="isHiddenApiKey = !isHiddenApiKey"
                        :title="isHiddenApiKey ? $t('show') : $t('hide')"
                        :aria-label="isHiddenApiKey ? $t('show') : $t('hide')"
                        :aria-pressed="!isHiddenApiKey"
                      >
                        <component :is="isHiddenApiKey ? EyeOff : Eye" class="h-4 w-4" />
                      </button>
                    </div>
                    <div class="flex justify-end mt-2">
                      <Button
                        :disabled="isSendingApi || !apiKey"
                        @click="sendTestApiToken"
                        type="button"
                        variant="outline"
                        size="sm"
                      >
                        <Loader2 v-if="isSendingApi" class="w-4 h-4 animate-spin" />
                        <Send v-else class="w-4 h-4" />
                        {{ $t('test_api_key') }}
                      </Button>
                    </div>
                  </Field>

                  <Field
                    :label="$t('set_price_update_duration_in_minutes')"
                    for-id="price_duration"
                    :error="!formValidation.price_duration"
                    :error-message="$t('settings_page.err_positive_number')"
                  >
                    <Input
                      v-model="formFields.price_duration"
                      type="number"
                      id="price_duration"
                      placeholder="30"
                      min="1"
                      @input="validateForm"
                      :aria-invalid="!formValidation.price_duration"
                      aria-describedby="price_duration-error"
                      :class="{ 'border-destructive focus-visible:ring-destructive': !formValidation.price_duration }"
                    />
                    <p v-if="callEstimate" class="text-xs mt-1.5 tabular-nums" :class="callEstimate.over || callEstimate.rateOver ? 'text-warning' : 'text-muted-foreground'">
                      {{ $t('settings_page.usage_estimate', callEstimate) }}
                      <template v-if="callEstimate.over">{{ $t('settings_page.usage_estimate_over', { limit: callEstimate.limit }) }}</template>
                      <template v-if="callEstimate.rateOver">{{ $t('settings_page.usage_estimate_rate_over', { limit: callEstimate.rateLimit, minutes: callEstimate.rateMinutes }) }}</template>
                    </p>
                    <!-- Generic note only until the live estimate can say it with real numbers -->
                    <p v-else class="text-xs text-muted-foreground mt-1.5">
                      <span v-html="$t('price_duration_note')"></span>
                    </p>
                  </Field>

                  <SaveButton :disabled="isFormInvalid" :saving="isSaving" @click="saveSettings" />
                </div>
              </div>
            </TabsContent>

            <!-- Links -->
            <TabsContent value="links" class="mt-0">
              <SectionHeader
                :title="$t('links')"
                :description="$t('settings_page.desc_links')"
              />

              <div class="max-w-md space-y-6">
                <Field
                  :label="$t('wkn_link')"
                  for-id="wknLink"
                  :error="!formValidation.wkn_link"
                  :error-message="$t('settings_page.err_link', { token: '$WKN' })"
                >
                  <Input
                    v-model="formFields.wkn_link"
                    type="text"
                    id="wknLink"
                    :placeholder="$t('enter_wkn_link')"
                    @input="validateForm"
                    :aria-invalid="!formValidation.wkn_link"
                    aria-describedby="wknLink-error"
                    :class="{ 'border-destructive focus-visible:ring-destructive': !formValidation.wkn_link }"
                  />
                  <p v-if="formValidation.wkn_link" class="text-xs text-muted-foreground mt-1.5">
                    {{ $t('wkn_link_note') }}
                  </p>
                </Field>

                <Field
                  :label="$t('isin_link')"
                  for-id="isinLink"
                  :error="!formValidation.isin_link"
                  :error-message="$t('settings_page.err_link', { token: '$ISIN' })"
                >
                  <Input
                    v-model="formFields.isin_link"
                    type="text"
                    id="isinLink"
                    :placeholder="$t('enter_isin_link')"
                    @input="validateForm"
                    :aria-invalid="!formValidation.isin_link"
                    aria-describedby="isinLink-error"
                    :class="{ 'border-destructive focus-visible:ring-destructive': !formValidation.isin_link }"
                  />
                  <p v-if="formValidation.isin_link" class="text-xs text-muted-foreground mt-1.5">
                    {{ $t('isin_link_note') }}
                  </p>
                </Field>

                <SaveButton :disabled="isFormInvalid" :saving="isSaving" @click="saveSettings" />
              </div>
            </TabsContent>

            <!-- Backup -->
            <TabsContent value="backup" class="mt-0">
              <SectionHeader
                :title="$t('backup')"
                :description="$t('settings_page.desc_backup')"
              />

              <div class="max-w-md space-y-6">

                <!-- Export CSV settings -->
                <section class="rounded-lg border p-4">
                  <div class="flex items-start gap-3">
                    <FileSpreadsheet class="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div class="flex-1 min-w-0">
                      <h3 class="font-medium">{{ $t('export_csv_settings') }}</h3>
                      <p class="text-xs text-muted-foreground mt-0.5">{{ $t('settings_page.desc_csv') }}</p>
                    </div>
                  </div>
                  <Field
                    class="mt-4"
                    :label="$t('export_delimiter')"
                    for-id="export_delimiter"
                    :error="!formValidation.export_delimiter"
                    :error-message="$t('settings_page.err_delimiter')"
                  >
                    <Input
                      v-model="formFields.export_delimiter"
                      type="text"
                      id="export_delimiter"
                      maxlength="1"
                      :placeholder="';'"
                      @input="validateForm"
                      :aria-invalid="!formValidation.export_delimiter"
                      aria-describedby="export_delimiter-error"
                      :class="['max-w-[120px]', { 'border-destructive focus-visible:ring-destructive': !formValidation.export_delimiter }]"
                    />
                    <p class="text-xs text-muted-foreground mt-1.5">
                      <span v-html="$t('export_delimiter_note')"></span>
                    </p>
                  </Field>
                  <div class="mt-4">
                    <SaveButton :disabled="isFormInvalid" :saving="isSaving" @click="saveSettings" />
                  </div>
                </section>

                <!-- Import -->
                <section class="rounded-lg border p-4">
                  <div class="flex items-start gap-3">
                    <Upload class="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div class="flex-1 min-w-0">
                      <h3 class="font-medium">{{ $t('import') }}</h3>
                      <p class="text-xs text-muted-foreground mt-0.5">{{ $t('backup_data.import_title') }}</p>
                    </div>
                  </div>
                  <input
                    ref="fileInputRef"
                    type="file"
                    :aria-label="$t('backup_data.import_title')"
                    class="block w-full mt-4 text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:text-foreground file:text-sm file:font-medium file:hover:bg-muted cursor-pointer"
                    accept="application/json"
                    @change="handleImportFileChange"
                  />
                  <p class="text-xs text-muted-foreground mt-2">{{ $t('backup_data.import_note') }}</p>
                  <p v-if="importPreview" class="text-xs mt-2" :class="importPreview.valid ? 'text-foreground' : 'text-destructive'">
                    {{ importPreview.valid ? $t('backup_data.summary', importPreview.summary) : $t('backup_data.import_validating') }}
                  </p>
                  <div class="mt-4">
                    <Button @click="handleImport" :disabled="!selectedFile || isImporting">
                      <Loader2 v-if="isImporting" class="w-4 h-4 animate-spin" />
                      <Upload v-else class="w-4 h-4" />
                      {{ $t('backup_data.import_button') }}
                    </Button>
                  </div>
                </section>

                <!-- Export -->
                <section class="rounded-lg border p-4">
                  <div class="flex items-start gap-3">
                    <Download class="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div class="flex-1 min-w-0">
                      <h3 class="font-medium">{{ $t('export') }}</h3>
                      <p class="text-xs text-muted-foreground mt-0.5">{{ $t('backup_data.export_title') }}</p>
                    </div>
                  </div>
                  <p class="text-xs text-muted-foreground mt-3">{{ $t('backup_data.contents') }}</p>
                  <p class="text-xs text-muted-foreground mt-2">{{ $t('backup_data.export_note') }}</p>
                  <div class="mt-4">
                    <Button @click="handleExport" variant="outline" :disabled="isExportingBackup">
                      <Loader2 v-if="isExportingBackup" class="w-4 h-4 animate-spin" />
                      <Download v-else class="w-4 h-4" />
                      {{ $t('backup_data.export_button') }}
                    </Button>
                  </div>
                </section>

              </div>
            </TabsContent>

            <!-- Language & Theme -->
            <TabsContent value="general" class="mt-0">
              <SectionHeader
                :title="$t('language_and_theme')"
                :description="$t('settings_page.desc_general')"
              />

              <div class="max-w-2xl space-y-8">
                <div>
                  <h3 id="theme_heading" class="block text-sm font-medium mb-1">{{ $t('theme') }}</h3>
                  <p class="text-xs text-muted-foreground mb-3">{{ $t('theme_description') }}</p>
                  <div class="grid grid-cols-2 gap-3 max-w-md" role="radiogroup" aria-labelledby="theme_heading">
                    <button
                      type="button"
                      @click="theme = 'light'; saveTheme()"
                      role="radio"
                      :aria-checked="theme === 'light'"
                      :class="[
                        'group cursor-pointer border-2 rounded-lg p-3 text-left transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        theme === 'light' ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/40'
                      ]"
                    >
                      <div class="aspect-video rounded-md bg-linear-to-br from-gray-50 to-gray-200 mb-2 flex items-center justify-center border">
                        <Sun class="h-6 w-6 text-amber-500" />
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-medium">{{ $t('light') }}</span>
                        <Check v-if="theme === 'light'" class="h-4 w-4 text-primary" />
                      </div>
                    </button>
                    <button
                      type="button"
                      @click="theme = 'dark'; saveTheme()"
                      role="radio"
                      :aria-checked="theme === 'dark'"
                      :class="[
                        'group cursor-pointer border-2 rounded-lg p-3 text-left transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        theme === 'dark' ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/40'
                      ]"
                    >
                      <div class="aspect-video rounded-md bg-linear-to-br from-gray-800 to-gray-950 mb-2 flex items-center justify-center border border-gray-700">
                        <Moon class="h-6 w-6 text-slate-200" />
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-sm font-medium">{{ $t('dark') }}</span>
                        <Check v-if="theme === 'dark'" class="h-4 w-4 text-primary" />
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <Label for="language_select" class="block text-sm font-medium mb-1">{{ $t('settings_page.language') }}</Label>
                  <p class="text-xs text-muted-foreground mb-3">{{ $t('settings_page.language_description') }}</p>
                  <Select v-model="$i18n.locale" @update:modelValue="onLanguageChange($event as any)">
                    <SelectTrigger id="language_select" class="w-full max-w-[280px]">
                      <Languages class="h-4 w-4 mr-2 shrink-0" />
                      <SelectValue :placeholder="$t('select_a_language')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem v-for="lang in langaugeOptions" :key="lang.id" :value="lang.id">
                          {{ lang.name }}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <p class="text-xs text-muted-foreground">{{ $t('settings_page.applies_instantly') }}</p>
              </div>
            </TabsContent>

            <!-- Alerting -->
            <TabsContent value="alerting" class="mt-0">
              <SectionHeader
                :title="$t('alerting')"
                :description="$t('settings_page.desc_alerting')"
              />

              <div class="max-w-md">
                <section class="rounded-lg border p-4">
                  <div class="flex items-start justify-between gap-2 mb-4">
                    <div class="flex items-center gap-2">
                      <Bot class="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                      <h3 class="text-sm font-medium">{{ $t('telegram_bot') }}</h3>
                    </div>
                    <Dialog>
                      <DialogTrigger as-child>
                        <button type="button" class="text-xs text-primary hover:underline inline-flex items-center gap-1 rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                          <HelpCircle class="h-3.5 w-3.5" />
                          {{ $t('how_to_set_up_telegram') }}
                        </button>
                      </DialogTrigger>
                      <DialogContent class="max-w-xl">
                        <DialogHeader>
                          <DialogTitle>{{ $t('set_up_rtelegram_alerts') }}</DialogTitle>
                          <DialogDescription class="text-sm text-muted-foreground">
                            {{ $t('follow_these_steps_to_connect_your_telegram_bot_and_channel') }}
                          </DialogDescription>
                        </DialogHeader>
                        <div class="space-y-5 mt-2 text-sm leading-relaxed">
                          <!-- code tokens go through slots so translators never touch them -->
                          <div>
                            <h4 class="font-semibold mb-1">1. {{ $t('telegram_guide.step1_title') }}</h4>
                            <ul class="list-disc list-inside text-muted-foreground space-y-0.5">
                              <li>{{ $t('telegram_guide.step1_open') }}</li>
                              <i18n-t keypath="telegram_guide.step1_search" tag="li"><template #name><code class="text-foreground">@BotFather</code></template></i18n-t>
                              <i18n-t keypath="telegram_guide.step1_send" tag="li"><template #cmd><code class="text-foreground">/newbot</code></template></i18n-t>
                              <li>{{ $t('telegram_guide.step1_copy') }}</li>
                            </ul>
                          </div>
                          <div>
                            <h4 class="font-semibold mb-1">2. {{ $t('telegram_guide.step2_title') }}</h4>
                            <ul class="list-disc list-inside text-muted-foreground space-y-0.5">
                              <li>{{ $t('telegram_guide.step2_new') }}</li>
                              <li>{{ $t('telegram_guide.step2_name') }}</li>
                            </ul>
                          </div>
                          <div>
                            <h4 class="font-semibold mb-1">3. {{ $t('telegram_guide.step3_title') }}</h4>
                            <ul class="list-disc list-inside text-muted-foreground space-y-0.5">
                              <li>{{ $t('telegram_guide.step3_open') }}</li>
                              <i18n-t keypath="telegram_guide.step3_add" tag="li"><template #bot><code class="text-foreground">@MyAlertBot</code></template></i18n-t>
                              <li>{{ $t('telegram_guide.step3_permission') }}</li>
                            </ul>
                          </div>
                          <div>
                            <h4 class="font-semibold mb-1">4. {{ $t('telegram_guide.step4_title') }}</h4>
                            <ul class="list-disc list-inside text-muted-foreground space-y-0.5">
                              <i18n-t keypath="telegram_guide.step4_open" tag="li"><template #bot><a href="https://t.me/RawDataBot" target="_blank" rel="noopener noreferrer" class="text-primary underline">RawDataBot</a></template></i18n-t>
                              <li>{{ $t('telegram_guide.step4_forward') }}</li>
                              <i18n-t keypath="telegram_guide.step4_reply" tag="li"><template #id><code class="text-foreground">-1001234567890</code></template></i18n-t>
                              <li>{{ $t('telegram_guide.step4_use') }}</li>
                            </ul>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div class="space-y-4">
                    <Field
                      :label="$t('telegram_bot_token')"
                      for-id="teleBotToken"
                      :error="!formValidation.telegram_bot_token"
                      :error-message="$t('settings_page.err_bot_token')"
                    >
                      <div class="relative">
                        <Input
                          v-model="formFields.telegram_bot_token"
                          :type="isTelegramBotTokenHidden ? 'password' : 'text'"
                          @input="validateForm"
                          id="teleBotToken"
                          :aria-invalid="!formValidation.telegram_bot_token"
                          aria-describedby="teleBotToken-error"
                          placeholder="123456789:AAE7Nn9rZx3p7r23Ld8fF_ExampleTokenHere"
                          :class="['pr-10', { 'border-destructive focus-visible:ring-destructive': !formValidation.telegram_bot_token }]"
                        />
                        <button
                          type="button"
                          class="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                          @click="isTelegramBotTokenHidden = !isTelegramBotTokenHidden"
                          :title="isTelegramBotTokenHidden ? $t('show') : $t('hide')"
                          :aria-label="isTelegramBotTokenHidden ? $t('show') : $t('hide')"
                          :aria-pressed="!isTelegramBotTokenHidden"
                        >
                          <component :is="isTelegramBotTokenHidden ? EyeOff : Eye" class="h-4 w-4" />
                        </button>
                      </div>
                    </Field>

                    <Field
                      :label="$t('telegram_channel_id')"
                      for-id="teleChannel"
                      :error="!formValidation.telegram_channel_id"
                      :error-message="$t('settings_page.err_channel_id')"
                    >
                      <!-- channel ID is not a secret; masking it only hid typos -->
                      <Input
                        v-model="formFields.telegram_channel_id"
                        type="text"
                        @input="validateForm"
                        id="teleChannel"
                        placeholder="@myAlert"
                        :aria-invalid="!formValidation.telegram_channel_id"
                        aria-describedby="teleChannel-error"
                        :class="{ 'border-destructive focus-visible:ring-destructive': !formValidation.telegram_channel_id }"
                      />
                    </Field>

                    <div class="flex justify-end">
                      <Button
                        :disabled="isSending || !formFields.telegram_bot_token || !formFields.telegram_channel_id"
                        @click="sendTestMessage"
                        type="button"
                        variant="outline"
                        size="sm"
                      >
                        <Loader2 v-if="isSending" class="w-4 h-4 animate-spin" />
                        <Send v-else class="w-4 h-4" />
                        {{ $t('sent_test_message') }}
                      </Button>
                    </div>
                  </div>
                </section>

                <div class="mt-6">
                  <SaveButton :disabled="isFormInvalid" :saving="isSaving" @click="saveSettings" />
                </div>
              </div>
            </TabsContent>

            <!-- Danger Zone -->
            <TabsContent value="danger" class="mt-0">
              <SectionHeader
                :title="$t('danger')"
                :description="$t('settings_page.desc_danger')"
              />

              <div class="max-w-2xl">
                <div class="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <div class="flex items-start justify-between gap-4">
                    <div class="flex items-start gap-3 min-w-0">
                      <AlertTriangle class="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div class="min-w-0">
                        <h3 class="text-sm font-medium">{{ $t('clear_data') }}</h3>
                        <p class="text-sm text-muted-foreground mt-1">{{ $t('clear_data_note') }}</p>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger as-child>
                        <Button variant="destructive" class="shrink-0">
                          <Trash2 class="h-4 w-4" />
                          {{ $t('clear') }}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{{ $t('clear_data') }}?</AlertDialogTitle>
                          <AlertDialogDescription>{{ $t('clear_data_note') }}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{{ $t('cancel') }}</AlertDialogCancel>
                          <AlertDialogAction
                            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            @click="clearData"
                          >
                            {{ $t('clear') }}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </TabsContent>

          </div>
        </Tabs>

      </CardContent>
    </Card>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onMounted, h, defineComponent } from 'vue';


import { sendTelegramMessage, sendTestApi, clearAllStockData, apiKey as globalApiKey, setApiAuthFailed, numberToGerman, todayIso } from '~/utils/helper'
import { storage } from '#imports';
import { useI18n } from "vue-i18n";

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { exportAll, importAll, previewBackup } from '@/lib/storage-utils';
import ApiUsagePanel from '@/components/ApiUsagePanel.vue';

import {
  Sun, Moon, Bot, Send, EyeOff, Eye, Loader2, Upload, Download,
  KeyRound, Link2, Archive, Palette, Bell, AlertTriangle, Trash2,
  Languages, Check, HelpCircle, FileSpreadsheet,
} from "lucide-vue-next";

const { toast } = useToast()
const { t } = useI18n();
document.title = t('settings');

// --- Tab definition (single source of truth) ---
const tabs = [
  { value: 'subscription', label: 'subscription_and_api_key', icon: KeyRound },
  { value: 'links',        label: 'links',                    icon: Link2 },
  { value: 'backup',       label: 'backup',                   icon: Archive },
  { value: 'general',      label: 'language_and_theme',       icon: Palette },
  { value: 'alerting',     label: 'alerting',                 icon: Bell },
  { value: 'danger',       label: 'danger',                   icon: AlertTriangle },
];

// --- Small inline components, scoped to this page ---
const SectionHeader = defineComponent({
  props: { title: { type: String, required: true }, description: String },
  setup(props) {
    return () => h('div', { class: 'mb-6' }, [
      h('h2', { class: 'text-2xl font-semibold tracking-tight' }, props.title),
      props.description ? h('p', { class: 'text-sm text-muted-foreground mt-1' }, props.description) : null,
    ]);
  },
});

const Field = defineComponent({
  props: {
    label: { type: String, required: true },
    forId: String,
    error: Boolean,
    errorMessage: String,
  },
  setup(props, { slots }) {
    return () => h('div', [
      h(Label, { for: props.forId, class: 'block text-sm font-medium text-foreground mb-1.5' }, () => props.label),
      slots.default?.(),
      // id matches the input's aria-describedby so screen readers read the error
      props.error && props.errorMessage
        ? h('p', { id: `${props.forId}-error`, class: 'text-xs text-red-600 dark:text-red-400 mt-1.5' }, props.errorMessage)
        : null,
    ]);
  },
});

const SaveButton = defineComponent({
  props: { disabled: Boolean, saving: Boolean },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h(Button, {
      type: 'button',
      disabled: props.disabled || props.saving,
      onClick: () => emit('click'),
    }, () => [
      props.saving ? h(Loader2, { class: 'w-4 h-4 animate-spin' }) : null,
      t('save_changes'),
    ]);
  },
});

// --- Theme ---
const theme = ref(localStorage.getItem('theme') || 'light');

const applyTheme = (themeName: string) => {
  document.documentElement.classList.toggle('dark', themeName === 'dark');
};

applyTheme(theme.value);

const saveTheme = () => {
  applyTheme(theme.value);
  localStorage.setItem('theme', theme.value);
};

// --- Language ---
const langaugeOptions = [
  { id: 'de', name: "Deutsch" },
  { id: 'en', name: "English" },
];

const onLanguageChange = async (lang: string) => {
  localStorage.setItem('lang', lang);
};

// --- API key ---
const apiKey = ref('');
// The usage panel follows the stored key, not the input, so typing doesn't fire a request per keystroke.
const savedApiKey = ref('');
const usage = ref<any>(null);
const pricedPositions = ref(0);

// One refresh (reloadPriceData) spends a position per unique stock ISIN, other WKN and underlying ISIN, plus one per currency chunk.
const countPricedPositions = (rows: any[]) => {
  const isins = new Set(rows.filter((r: any) => r.type === 'stock' && r.isin).map((r: any) => r.isin));
  const wkns = new Set(rows.filter((r: any) => r.type !== 'stock' && r.wkn).map((r: any) => r.wkn));
  const underlyings = new Set(rows.filter((r: any) => r.underlying_isin).map((r: any) => r.underlying_isin));
  const currencies = new Set(rows.filter((r: any) => r.currency).map((r: any) => r.currency));
  return isins.size + wkns.size + underlyings.size + Math.ceil(currencies.size / globalPriceState.chunkSize);
};

const callEstimate = computed(() => {
  const minutes = Number(formFields.price_duration);
  if (!pricedPositions.value || !(minutes > 0)) return null;
  const w = usage.value?.service_window;
  const serviceMinutes = w ? (w.end_hour - w.start_hour) * 60 : 14 * 60;
  const calls = pricedPositions.value * Math.floor(serviceMinutes / minutes);
  const limit = usage.value?.today?.limit || 0;
  // A refresh fires one call per position at once, so a short window can be blown even when the day isn't.
  const win = usage.value?.window;
  const perWindow = win?.seconds ? pricedPositions.value * Math.max(1, Math.ceil(win.seconds / (minutes * 60))) : 0;
  return {
    positions: pricedPositions.value,
    minutes,
    raw: calls,
    calls: numberToGerman(calls, true),
    limit: numberToGerman(limit, true),
    over: limit > 0 && calls > limit,
    rateOver: !!win?.limit && perWindow > win.limit,
    rateLimit: numberToGerman(win?.limit || 0, true),
    rateMinutes: Math.max(1, Math.round((win?.seconds || 60) / 60)),
  };
});
const isHiddenApiKey = ref(true);

const saveApiKey = async () => {
  const previous = await storage.getItem('local:api_key');
  await storage.setItem('local:api_key', apiKey.value);
  savedApiKey.value = apiKey.value;
  // This page shadows the helper's apiKey ref, so the running SPA needs it pushed across.
  globalApiKey.value = apiKey.value;
  // Only a changed key earns a fresh chance; saving an unrelated setting must not clear the latch.
  if (previous !== apiKey.value) await setApiAuthFailed(false);
};

// --- Telegram visibility toggles ---
const isTelegramBotTokenHidden = ref(true);

// --- Form state ---
const formFields = reactive({
  wkn_link: "",
  isin_link: "",
  telegram_bot_token: "",
  telegram_channel_id: "",
  export_delimiter: ";",
  price_duration: 30,
});

const formValidation = reactive({
  wkn_link: true,
  isin_link: true,
  telegram_bot_token: true,
  telegram_channel_id: true,
  export_delimiter: true,
  price_duration: true,
});

const validateLink = (field: string, match: string) => {
  try {
    const url = new URL(field);
    return field.includes(match) && !!url.hostname;
  } catch {
    return false;
  }
};

const isFormInvalid = computed(() =>
  Object.values(formValidation).some(v => v === false)
);

const TAB_FIELDS: Record<string, string[]> = {
  subscription: ['price_duration'],
  links: ['wkn_link', 'isin_link'],
  backup: ['export_delimiter'],
  alerting: ['telegram_bot_token', 'telegram_channel_id'],
};
const tabHasError = (tab: string) => (TAB_FIELDS[tab] || []).some(k => (formValidation as any)[k] === false);

const validateForm = () => {
  (Object.keys(formValidation) as Array<keyof typeof formValidation>).forEach(k => {
    formValidation[k] = true;
  });

  if (formFields.wkn_link.length > 0) {
    formValidation.wkn_link = validateLink(formFields.wkn_link, '$WKN');
  }
  if (formFields.isin_link.length > 0) {
    formValidation.isin_link = validateLink(formFields.isin_link, '$ISIN');
  }
  if (formFields.telegram_bot_token.length > 0) {
    formValidation.telegram_bot_token = /^(\d+):[A-Za-z0-9_-]{35,40}$/.test(formFields.telegram_bot_token);
  }
  if (formFields.telegram_channel_id.length > 0) {
    formValidation.telegram_channel_id = formFields.telegram_channel_id.length > 2;
  }
  if (formFields.export_delimiter.length > 0) {
    const d = formFields.export_delimiter;
    const regex = /^[^\x00-\x1F\x7F0-9a-zA-Z]$/;
    formValidation.export_delimiter =
      typeof d === 'string' && d.length === 1 && regex.test(d) && d.charCodeAt(0) !== 31;
  }
  formValidation.price_duration = Number(formFields.price_duration) > 0;
};

// --- Save / actions ---
const isSaving = ref(false);
// Call before any other await: the browser only shows the prompt inside the click's user gesture.
const requestTelegramPermission = async () => {
  if (!formFields.telegram_bot_token || !formFields.telegram_channel_id) return false;
  return browser.permissions.request({ origins: ['https://api.telegram.org/*'] })
    .catch(() => /* denied or unsupported: saving settings must not fail over it */ false);
};

const saveSettings = async () => {
  void requestTelegramPermission();
  isSaving.value = true;
  validateForm();
  if (isFormInvalid.value) {
    isSaving.value = false;
    toast({
      title: t('settings_page.fix_highlighted_fields'),
      variant: 'destructive',
    });
    return;
  }
  await storage.setItem('local:settings', { ...formFields });
  saveTheme();
  await saveApiKey();
  isSaving.value = false;
  toast({ title: t('settings_saved_successfully') });
};

const clearData = async () => {
  await clearAllStockData();
  await storage.setItem('local:scenarios', []);
  await storage.setItem('local:SCENARIO_VIRTUAL_PUTS', []);
  const keepTheme = localStorage.getItem('theme');
  const keepLang = localStorage.getItem('lang');
  localStorage.clear();
  if (keepTheme) localStorage.setItem('theme', keepTheme);
  if (keepLang) localStorage.setItem('lang', keepLang);
  toast({ title: t('data_cleared_successfully'), description: t('settings_page.reloading') });
  // pages kept showing the cleared data until a manual reload
  setTimeout(() => { location.reload(); }, 1500);
};

const isSending = ref(false);
const sendTestMessage = async () => {
  // Awaited here so the test message is not sent while the prompt is still open.
  await requestTelegramPermission();
  isSending.value = true;
  const testMessage = `<b>TEST</b>\n${t('settings_page.telegram_test_message')}`;
  const sendData = await sendTelegramMessage(
    formFields.telegram_bot_token,
    formFields.telegram_channel_id,
    testMessage,
  );
  isSending.value = false;
  if (sendData?.ok) {
    toast({ title: t('test_message_sent_successfully') });
  } else {
    toast({
      title: t('failed_to_send_the_test_message_please_verify_your_settings_and_try_again'),
      variant: 'destructive',
    });
  }
};

const isSendingApi = ref(false);
const sendTestApiToken = async () => {
  isSendingApi.value = true;
  const sendData = await sendTestApi(apiKey.value);
  isSendingApi.value = false;
  if (sendData) {
    // A green test is the recovery signal, so persist the key that passed before clearing the latch.
    await storage.setItem('local:api_key', apiKey.value);
    savedApiKey.value = apiKey.value;
    globalApiKey.value = apiKey.value;
    await setApiAuthFailed(false);
    toast({ title: t('api_key_tested_successfully') });
  } else {
    toast({
      title: t('failed_to_test_api_key_please_verify_your_key_and_try_again'),
      variant: 'destructive',
    });
  }
};

// --- Backup ---
const selectedFile = ref<File | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImporting = ref(false);
const isExportingBackup = ref(false);
const importPreview = ref<any>(null);
async function handleImportFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
  importPreview.value = null;
  if (!selectedFile.value) return;
  try {
    importPreview.value = await previewBackup(selectedFile.value);
  } catch (err) {
    /* unreadable JSON: show it as invalid instead of failing at import time */
    console.error('handleImportFileChange error:', err);
    importPreview.value = { valid: false };
  }
}

async function handleImport() {
  isImporting.value = true;
  try {
    const { summary } = await importAll(selectedFile.value as File);
    toast({ title: t('backup_data.import_success'), description: `${t('backup_data.summary', summary)} ${t('settings_page.reloading')}` });
    selectedFile.value = null;
    importPreview.value = null;
    // the input kept showing the old file name after a successful import
    if (fileInputRef.value) fileInputRef.value.value = '';
    setTimeout(() => { location.reload(); }, 1500);
  } catch (err) {
    console.error('Import failed', err);
    toast({ title: t('backup_data.import_validating'), variant: 'destructive' });
  } finally {
    isImporting.value = false;
  }
}

async function handleExport() {
  isExportingBackup.value = true;
  try {
    const today = todayIso();
    const summary = await exportAll(`backup_${today}.json`);
    toast({ title: t('backup_data.export_success'), description: t('backup_data.summary', summary) });
  } catch (err) {
    // a failed export used to be silent
    console.error('handleExport error:', err);
    toast({ title: t('settings_page.export_failed'), variant: 'destructive' });
  } finally {
    isExportingBackup.value = false;
  }
}

onMounted(async () => {
  apiKey.value = (await storage.getItem('local:api_key')) as string ?? '';
  savedApiKey.value = apiKey.value;
  pricedPositions.value = countPricedPositions(((await storage.getItem('local:MAIN_LIST')) as any[]) || []);
  const settings = await storage.getItem('local:settings');
  if (settings) Object.assign(formFields, settings);
});
</script>
