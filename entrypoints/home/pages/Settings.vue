<template>
  <div class="w-full">
    <h1 class="sr-only">{{ $t('settings') }}</h1>
    <Card class="w-full">
      <CardContent class="p-4 sm:p-6">

        <Tabs v-model="activeTab" class="flex flex-col md:flex-row w-full gap-6">
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
                  <span v-if="tabHasError(tab.value)" class="ml-auto h-2 w-2 shrink-0 rounded-full bg-destructive"
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
                      <Button
                        type="button" variant="ghost" size="icon"
                        class="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                        @click="isHiddenApiKey = !isHiddenApiKey"
                        :title="isHiddenApiKey ? $t('show') : $t('hide')"
                        :aria-label="isHiddenApiKey ? $t('show') : $t('hide')"
                        :aria-pressed="!isHiddenApiKey"
                      >
                        <component :is="isHiddenApiKey ? EyeOff : Eye" class="h-4 w-4" />
                      </Button>
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
                      aria-describedby="price_duration-error price_duration-hint"
                      :class="{ 'border-destructive focus-visible:ring-destructive': !formValidation.price_duration }"
                    />
                    <p v-if="callEstimate" id="price_duration-hint" class="text-xs mt-1.5 tabular-nums" :class="callEstimate.over || callEstimate.rateOver ? 'text-warning' : 'text-muted-foreground'">
                      {{ $t('settings_page.usage_estimate', callEstimate) }}
                      <template v-if="callEstimate.over">{{ $t('settings_page.usage_estimate_over', { limit: callEstimate.limit }) }}</template>
                      <template v-if="callEstimate.rateOver">{{ $t('settings_page.usage_estimate_rate_over', { limit: callEstimate.rateLimit, minutes: callEstimate.rateMinutes }) }}</template>
                    </p>
                    <!-- Generic note only until the live estimate can say it with real numbers -->
                    <p v-else id="price_duration-hint" class="text-xs text-muted-foreground mt-1.5">
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
                    aria-describedby="wknLink-error wknLink-hint"
                    :class="{ 'border-destructive focus-visible:ring-destructive': !formValidation.wkn_link }"
                  />
                  <p v-if="formValidation.wkn_link" id="wknLink-hint" class="text-xs text-muted-foreground mt-1.5">
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
                    aria-describedby="isinLink-error isinLink-hint"
                    :class="{ 'border-destructive focus-visible:ring-destructive': !formValidation.isin_link }"
                  />
                  <p v-if="formValidation.isin_link" id="isinLink-hint" class="text-xs text-muted-foreground mt-1.5">
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

              <div class="max-w-2xl space-y-6">

                <section aria-labelledby="backup_export_heading">
                  <h3 id="backup_export_heading" class="text-sm font-medium text-muted-foreground mb-2">{{ $t('export') }}</h3>
                  <div class="rounded-lg border divide-y">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4">
                      <div class="min-w-0">
                        <p class="text-sm font-medium">{{ $t('backup_data.download_title') }}</p>
                        <p class="text-sm text-muted-foreground mt-0.5">{{ $t('backup_data.contents') }}</p>
                      </div>
                      <Button @click="handleExport" variant="outline" class="shrink-0 self-start sm:self-center" :disabled="isExportingBackup">
                        <Loader2 v-if="isExportingBackup" class="w-4 h-4 animate-spin" />
                        <Download v-else class="w-4 h-4" />
                        {{ $t('backup_data.export_button') }}
                      </Button>
                    </div>

                    <div class="p-4">
                      <div class="flex items-baseline justify-between gap-3">
                        <p id="export_delimiter_label" class="text-sm font-medium">{{ $t('export_delimiter') }}</p>
                        <!-- live region: confirms the auto-save -->
                        <span aria-live="polite" class="text-xs text-muted-foreground flex items-center gap-1 min-h-4">
                          <template v-if="delimiterSaved"><Check class="h-3.5 w-3.5 text-success" aria-hidden="true" />{{ $t('backup_data.delimiter_saved') }}</template>
                        </span>
                      </div>
                      <p class="text-sm text-muted-foreground mt-0.5">{{ $t('settings_page.desc_csv') }}</p>
                      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div role="group" aria-labelledby="export_delimiter_label" class="inline-flex rounded-lg bg-muted p-1">
                          <button
                            v-for="d in DELIMITER_PRESETS"
                            :key="d"
                            type="button"
                            :aria-pressed="formFields.export_delimiter === d"
                            :class="['h-7 w-9 rounded-md font-mono text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              formFields.export_delimiter === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground']"
                            @click="pickDelimiter(d)"
                          >{{ d }}</button>
                        </div>
                        <div class="flex items-center gap-2">
                          <Label for="export_delimiter" class="text-sm text-muted-foreground font-normal">{{ $t('backup_data.delimiter_other') }}</Label>
                          <Input
                            v-model="otherDelimiter"
                            type="text"
                            id="export_delimiter"
                            maxlength="1"
                            :aria-invalid="!formValidation.export_delimiter"
                            aria-describedby="export_delimiter-error export_delimiter-hint"
                            :class="['h-9 w-11 px-0 text-center font-mono', { 'border-destructive focus-visible:ring-destructive': !formValidation.export_delimiter }]"
                          />
                        </div>
                      </div>
                      <p v-if="!formValidation.export_delimiter" id="export_delimiter-error" class="text-xs text-destructive mt-2">
                        {{ $t('settings_page.err_delimiter') }}
                      </p>
                      <p id="export_delimiter-hint" class="text-xs text-muted-foreground mt-3">
                        {{ $t('backup_data.delimiter_sample') }}
                        <code class="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-foreground whitespace-pre">{{ delimiterSample }}</code>
                      </p>
                    </div>
                  </div>
                </section>

                <!-- Import -->
                <section aria-labelledby="backup_import_heading">
                  <h3 id="backup_import_heading" class="text-sm font-medium text-muted-foreground mb-2">{{ $t('import') }}</h3>
                  <div class="rounded-lg border p-4">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-medium">{{ $t('backup_data.restore_title') }}</p>
                        <p class="text-sm text-muted-foreground mt-0.5 flex items-start gap-1.5">
                          <AlertTriangle class="h-4 w-4 shrink-0 mt-0.5 text-warning" aria-hidden="true" />
                          {{ $t('backup_data.import_note') }}
                        </p>
                      </div>
                      <input ref="fileInputRef" type="file" class="sr-only" tabindex="-1" aria-hidden="true"
                        accept="application/json" @change="handleImportFileChange" />
                      <Button variant="outline" class="shrink-0 self-start sm:self-center" @click="fileInputRef?.click()">
                        <FileUp class="w-4 h-4" />
                        {{ selectedFile ? $t('backup_data.choose_other') : $t('backup_data.choose_file') }}
                      </Button>
                    </div>

                    <!-- show what the file holds before anything is replaced -->
                    <div v-if="selectedFile" class="mt-4 rounded-md border p-3"
                      :class="importPreview && !importPreview.valid ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40'">
                      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                        <FileJson class="hidden sm:block h-8 w-8 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div class="min-w-0 flex-1">
                          <p class="text-sm font-medium truncate">{{ selectedFile.name }}</p>
                          <p v-if="!importPreview" class="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <Loader2 class="h-3 w-3 animate-spin" aria-hidden="true" />{{ $t('backup_data.checking') }}
                          </p>
                          <p v-else-if="importPreview.valid" class="text-xs text-muted-foreground mt-0.5">
                            <span v-if="backupDate">{{ $t('backup_data.created', { date: backupDate }) }} · </span>{{ $t('backup_data.summary', importPreview.summary) }}
                          </p>
                          <p v-else class="text-xs text-destructive mt-0.5">{{ $t('backup_data.import_validating') }}</p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger as-child>
                            <Button variant="destructive" class="shrink-0 self-start sm:self-center" :disabled="!importPreview?.valid || isImporting">
                              <Loader2 v-if="isImporting" class="w-4 h-4 animate-spin" />
                              <Upload v-else class="w-4 h-4" />
                              {{ $t('backup_data.import_button') }}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{{ $t('backup_data.confirm_title') }}</AlertDialogTitle>
                              <AlertDialogDescription>{{ $t('backup_data.import_note') }}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{{ $t('cancel') }}</AlertDialogCancel>
                              <AlertDialogAction :class="buttonVariants({ variant: 'destructive' })" @click="handleImport">
                                {{ $t('backup_data.import_button') }}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
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

              <div class="max-w-2xl rounded-lg border divide-y">
                <div class="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div class="min-w-0">
                    <p id="theme_heading" class="text-sm font-medium">{{ $t('theme') }}</p>
                    <p class="text-sm text-muted-foreground mt-0.5">{{ $t('theme_description') }}</p>
                  </div>
                  <div role="radiogroup" aria-labelledby="theme_heading" class="inline-flex self-start sm:self-center shrink-0 rounded-lg bg-muted p-1">
                    <button
                      v-for="opt in THEME_OPTIONS"
                      :key="opt.value"
                      type="button"
                      role="radio"
                      :aria-checked="theme === opt.value"
                      :tabindex="theme === opt.value ? 0 : -1"
                      :class="['h-7 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        theme === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground']"
                      @click="selectTheme(opt.value)"
                      @keydown="radioKeydown($event, THEME_OPTIONS.map(o => o.value), theme, selectTheme)"
                    >
                      <component :is="opt.icon" class="h-4 w-4" aria-hidden="true" />
                      {{ $t(opt.label) }}
                    </button>
                  </div>
                </div>

                <div class="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div class="min-w-0">
                    <p id="language_heading" class="text-sm font-medium">{{ $t('settings_page.language') }}</p>
                    <p class="text-sm text-muted-foreground mt-0.5">{{ $t('settings_page.language_description') }}</p>
                  </div>
                  <div role="radiogroup" aria-labelledby="language_heading" class="inline-flex self-start sm:self-center shrink-0 rounded-lg bg-muted p-1">
                    <button
                      v-for="lang in languageOptions"
                      :key="lang.id"
                      type="button"
                      role="radio"
                      :lang="lang.id"
                      :aria-checked="$i18n.locale === lang.id"
                      :tabindex="$i18n.locale === lang.id ? 0 : -1"
                      :class="['h-7 px-3 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        $i18n.locale === lang.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground']"
                      @click="setLanguage(lang.id)"
                      @keydown="radioKeydown($event, languageOptions.map(l => l.id), $i18n.locale, setLanguage)"
                    >{{ lang.name }}</button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <!-- Alerting -->
            <TabsContent value="alerting" class="mt-0">
              <SectionHeader
                :title="$t('alerting')"
                :description="$t('settings_page.desc_alerting')"
              />

              <!-- Guide sits beside the form, not in a modal: users copy from Telegram and paste here step by step -->
              <!-- Guide column capped near 75ch so step text stays readable on wide screens -->
              <div class="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,36rem)] lg:items-start">
                <section class="rounded-lg border p-4">
                  <div class="flex items-center justify-between gap-2 mb-4">
                    <div class="flex items-center gap-2">
                      <Bot class="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                      <h3 class="text-sm font-medium">{{ $t('telegram_bot') }}</h3>
                    </div>
                    <Badge :variant="telegramStatus === 'tested' ? 'success' : telegramStatus === 'set' ? 'secondary' : 'outline'" aria-live="polite">
                      <Check v-if="telegramStatus === 'tested'" class="w-3 h-3" aria-hidden="true" />
                      {{ $t(`telegram_guide.status_${telegramStatus}`) }}
                    </Badge>
                  </div>

                  <div class="space-y-4">
                    <Field
                      :label="$t('telegram_bot_token')"
                      for-id="teleBotToken"
                      :hint="$t('telegram_guide.hint_token')"
                      :error="!formValidation.telegram_bot_token"
                      :error-message="$t('settings_page.err_bot_token')"
                    >
                      <div class="relative">
                        <Input
                          v-model="formFields.telegram_bot_token"
                          :type="isTelegramBotTokenHidden ? 'password' : 'text'"
                          @input="validateForm"
                          id="teleBotToken"
                          autocomplete="off"
                          spellcheck="false"
                          :aria-invalid="!formValidation.telegram_bot_token"
                          aria-describedby="teleBotToken-error teleBotToken-hint"
                          placeholder="123456789:AAE…"
                          :class="['pr-10 font-mono', { 'border-destructive focus-visible:ring-destructive': !formValidation.telegram_bot_token }]"
                        />
                        <Button
                          type="button" variant="ghost" size="icon"
                          class="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                          @click="isTelegramBotTokenHidden = !isTelegramBotTokenHidden"
                          :title="isTelegramBotTokenHidden ? $t('show') : $t('hide')"
                          :aria-label="isTelegramBotTokenHidden ? $t('show') : $t('hide')"
                          :aria-pressed="!isTelegramBotTokenHidden"
                        >
                          <component :is="isTelegramBotTokenHidden ? EyeOff : Eye" class="h-4 w-4" />
                        </Button>
                      </div>
                    </Field>

                    <Field
                      :label="$t('telegram_channel_id')"
                      for-id="teleChannel"
                      :hint="$t('telegram_guide.hint_channel')"
                      :error="!formValidation.telegram_channel_id"
                      :error-message="$t('settings_page.err_channel_id')"
                    >
                      <!-- channel ID is not a secret; masking it only hid typos -->
                      <Input
                        v-model="formFields.telegram_channel_id"
                        type="text"
                        @input="validateForm"
                        id="teleChannel"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="-1001234567890"
                        :aria-invalid="!formValidation.telegram_channel_id"
                        aria-describedby="teleChannel-error teleChannel-hint"
                        :class="['font-mono', { 'border-destructive focus-visible:ring-destructive': !formValidation.telegram_channel_id }]"
                      />
                    </Field>

                    <!-- Save lives with the form it commits; below the tall guide it drifted off screen. Order matches step 5: test, then save. -->
                    <div class="border-t pt-4">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <Button
                          :disabled="isSending || !formFields.telegram_bot_token || !formFields.telegram_channel_id"
                          @click="sendTestMessage"
                          type="button"
                          variant="outline"
                        >
                          <Loader2 v-if="isSending" class="w-4 h-4 animate-spin" />
                          <Send v-else class="w-4 h-4" />
                          {{ $t('sent_test_message') }}
                        </Button>
                        <SaveButton :disabled="isFormInvalid" :saving="isSaving" @click="saveSettings" />
                      </div>
                      <p v-if="!formFields.telegram_bot_token || !formFields.telegram_channel_id" class="mt-2 text-xs text-muted-foreground">
                        {{ $t('telegram_guide.test_disabled') }}
                      </p>
                    </div>
                  </div>
                </section>

                <section class="rounded-lg border bg-muted/40 p-4" :aria-label="$t('telegram_guide.title')">
                  <!-- Collapsible only below lg; on wide screens the guide is always shown -->
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-2 text-left text-sm font-medium lg:hidden"
                    :aria-expanded="isGuideOpen"
                    aria-controls="teleGuide"
                    @click="guideToggled = !isGuideOpen"
                  >
                    {{ $t('telegram_guide.title') }}
                    <ChevronDown :class="['w-4 h-4 text-muted-foreground transition-transform', { 'rotate-180': isGuideOpen }]" aria-hidden="true" />
                  </button>
                  <h3 class="hidden lg:block text-sm font-medium">{{ $t('telegram_guide.title') }}</h3>

                  <div id="teleGuide" :class="['mt-4', { 'hidden lg:block': !isGuideOpen }]">
                    <ol class="space-y-5">
                      <li v-for="(step, i) in TELEGRAM_STEPS" :key="step.n" class="relative flex gap-3">
                        <span v-if="i < TELEGRAM_STEPS.length - 1" class="absolute left-3 top-7 -bottom-4 w-px bg-border" aria-hidden="true" />
                        <span
                          :class="['relative flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
                                   telegramStepDone(step.n) ? 'border-primary bg-primary text-primary-foreground' : 'bg-background']"
                        >
                          <Check v-if="telegramStepDone(step.n)" class="w-3.5 h-3.5" aria-hidden="true" />
                          <template v-else>{{ step.n }}</template>
                          <span v-if="telegramStepDone(step.n)" class="sr-only">{{ $t('telegram_guide.step_done', { n: step.n }) }}</span>
                        </span>
                        <div class="min-w-0 pt-0.5">
                          <p class="text-sm font-medium leading-6">{{ $t(`telegram_guide.step${step.n}_title`) }}</p>
                          <!-- code tokens go through slots so translators never touch them -->
                          <i18n-t :keypath="`telegram_guide.step${step.n}_body`" tag="p" class="mt-0.5 text-sm leading-relaxed text-foreground/80">
                            <template #bot>
                              <a :href="`https://t.me/${step.bot}`" target="_blank" rel="noopener noreferrer" class="font-mono text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">@{{ step.bot }}</a>
                            </template>
                            <template #cmd><code class="rounded border bg-background px-1 font-mono text-[0.9em] text-foreground">/newbot</code></template>
                            <template #id><code class="rounded border bg-background px-1 font-mono text-[0.9em] text-foreground">-1001234567890</code></template>
                          </i18n-t>
                          <Button
                            v-if="step.fill"
                            type="button" variant="outline" size="xs"
                            class="mt-2 h-7 text-xs"
                            @click="focusField(step.fill)"
                          >
                            <CornerDownLeft class="w-3.5 h-3.5" aria-hidden="true" />
                            {{ $t(step.fill === 'teleBotToken' ? 'telegram_guide.fill_token' : 'telegram_guide.fill_channel') }}
                          </Button>
                        </div>
                      </li>
                    </ol>

                    <i18n-t keypath="telegram_guide.list_note" tag="p" class="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                      <template #list>
                        <router-link to="/list" class="font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground">{{ $t('list') }}</router-link>
                      </template>
                    </i18n-t>
                  </div>
                </section>
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
                            :class="buttonVariants({ variant: 'destructive' })"
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
import { ref, reactive, computed, onMounted, h, defineComponent, watch } from 'vue';


import { sendTelegramMessage, sendTestApi, clearAllStockData, apiKey as globalApiKey, setApiAuthFailed, numberToGerman, todayIso, applyTheme, themeStored, type ThemeChoice } from '~/utils/helper'
import { storage } from '#imports';
import { useI18n } from "vue-i18n";
import { i18n } from '../i18n';
import { useRoute, useRouter } from "vue-router";

import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { exportAll, importAll, previewBackup } from '@/lib/storage-utils';
import ApiUsagePanel from '@/components/ApiUsagePanel.vue';

import {
  Sun, Moon, Monitor, Bot, Send, EyeOff, Eye, Loader2, Upload, Download,
  KeyRound, Link2, Archive, Palette, Bell, AlertTriangle, Trash2,
  Check, FileUp, FileJson, ChevronDown, CornerDownLeft,
} from "lucide-vue-next";

const { toast } = useToast()
const { t, locale } = useI18n();
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

// Open tab lives in the URL (#/settings?tab=backup) so a refresh or shared link keeps it
const route = useRoute();
const router = useRouter();
const activeTab = computed({
  get: () => {
    const q = route.query.tab;
    return typeof q === 'string' && tabs.some(tab => tab.value === q) ? q : 'subscription';
  },
  set: (tab: string | number) => {
    router.replace({ query: { ...route.query, tab: String(tab) } });
  },
});

// --- Small inline components, scoped to this page ---
const SectionHeader = defineComponent({
  props: { title: { type: String, required: true }, description: String },
  setup(props) {
    return () => h('div', { class: 'mb-6' }, [
      h('h2', { class: 'text-lg font-semibold tracking-tight' }, props.title),
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
    hint: String,
  },
  setup(props, { slots }) {
    return () => h('div', [
      h(Label, { for: props.forId, class: 'block text-sm font-medium text-foreground mb-1.5' }, () => props.label),
      slots.default?.(),
      // id matches the input's aria-describedby so screen readers read the error
      props.error && props.errorMessage
        ? h('p', { id: `${props.forId}-error`, class: 'text-xs text-destructive mt-1.5' }, props.errorMessage)
        : props.hint
          ? h('p', { id: `${props.forId}-hint`, class: 'text-xs text-muted-foreground mt-1.5' }, props.hint)
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
const theme = ref<ThemeChoice>(themeStored());

const saveTheme = () => {
  applyTheme(theme.value);
  localStorage.setItem('theme', theme.value);
};

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'light', icon: Sun },
  { value: 'dark', label: 'dark', icon: Moon },
  { value: 'system', label: 'system', icon: Monitor },
];
const selectTheme = (value: ThemeChoice) => {
  theme.value = value;
  saveTheme();
};

// --- Language ---
const languageOptions = [
  { id: 'de', name: "Deutsch" },
  { id: 'en', name: "English" },
];

const setLanguage = (lang: string) => {
  i18n.global.locale = lang as typeof i18n.global.locale;
  localStorage.setItem('lang', lang);
};

// Arrow keys move and select inside a radiogroup; only the checked option is a tab stop.
const radioKeydown = <T,>(e: KeyboardEvent, values: T[], current: T, select: (v: T) => void) => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const next = (values.indexOf(current) + step + values.length) % values.length;
  select(values[next] as T);
  const radios = (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[next]?.focus();
};

// --- API key ---
const apiKey = ref('');
// The usage panel follows the stored key, not the input, so typing doesn't fire a request per keystroke.
// null until storage answers, so the panel shows its skeleton instead of flashing "no key".
const savedApiKey = ref<string | null>(null);
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

// Empty passes; saveDelimiter never stores it.
const isValidDelimiter = (d: string) => !d || /^[^\x00-\x1F\x7F0-9a-zA-Z]$/.test(d);

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
  formValidation.export_delimiter = isValidDelimiter(formFields.export_delimiter);
  formValidation.price_duration = Number(formFields.price_duration) > 0;
};

// --- CSV delimiter picker ---
// Saves on pick: one setting needs no Save button.
const DELIMITER_PRESETS = [';', ',', '|', '~', '^'];
const delimiterSaved = ref(false);
let delimiterSavedTimer: ReturnType<typeof setTimeout> | undefined;
const saveDelimiter = async () => {
  // this field only: validateForm would flag half-typed fields on other tabs
  formValidation.export_delimiter = isValidDelimiter(formFields.export_delimiter);
  if (!formValidation.export_delimiter || !formFields.export_delimiter) return;
  // merge into stored settings, so unsaved edits on other tabs stay unsaved
  const stored = ((await storage.getItem('local:settings')) as Record<string, unknown> | null) ?? {};
  await storage.setItem('local:settings', { ...stored, export_delimiter: formFields.export_delimiter });
  delimiterSaved.value = true;
  clearTimeout(delimiterSavedTimer);
  delimiterSavedTimer = setTimeout(() => { delimiterSaved.value = false; }, 2000);
};
const pickDelimiter = (d: string) => {
  formFields.export_delimiter = d;
  void saveDelimiter();
};
// "Other" shows only a custom char; clearing it falls back to ';'
const otherDelimiter = computed({
  get: () => (DELIMITER_PRESETS.includes(formFields.export_delimiter) ? '' : formFields.export_delimiter),
  set: (v: string) => {
    formFields.export_delimiter = v || ';';
    void saveDelimiter();
  },
});
const delimiterSample = computed(() => ['ISIN', 'WKN', 'Name'].join(formFields.export_delimiter));

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
  // A half-done guide or the sample flag would otherwise reopen against data that no longer exists.
  await storage.removeItems(['local:TOUR', 'local:TOUR_CELEBRATED', 'local:SAMPLE_DATA']);
  const keepTheme = localStorage.getItem('theme');
  const keepLang = localStorage.getItem('lang');
  localStorage.clear();
  if (keepTheme) localStorage.setItem('theme', keepTheme);
  if (keepLang) localStorage.setItem('lang', keepLang);
  toast({ title: t('data_cleared_successfully'), description: t('settings_page.reloading') });
  // pages kept showing the cleared data until a manual reload
  setTimeout(() => { location.reload(); }, 1500);
};

// --- Telegram setup status (session only: a passed test is not stored) ---
const telegramTestPassed = ref(false);
watch(() => [formFields.telegram_bot_token, formFields.telegram_channel_id], () => { telegramTestPassed.value = false; });
const telegramTokenOk = computed(() => !!formFields.telegram_bot_token && formValidation.telegram_bot_token);
const telegramChannelOk = computed(() => !!formFields.telegram_channel_id && formValidation.telegram_channel_id);
const telegramStatus = computed<'none' | 'set' | 'tested'>(() =>
  telegramTestPassed.value ? 'tested' : telegramTokenOk.value && telegramChannelOk.value ? 'set' : 'none');

const TELEGRAM_STEPS: { n: number; bot?: string; fill?: 'teleBotToken' | 'teleChannel' }[] = [
  { n: 1, bot: 'BotFather', fill: 'teleBotToken' },
  { n: 2 },
  { n: 3 },
  { n: 4, bot: 'RawDataBot', fill: 'teleChannel' },
  { n: 5 },
];
// Steps 2 and 3 leave no trace here; a channel ID implies they are done.
const telegramStepDone = (n: number) =>
  n === 1 ? telegramTokenOk.value : n <= 4 ? telegramChannelOk.value : telegramTestPassed.value;

// Guide starts open until both fields are filled; below lg the user can toggle it.
// Closed until settings load, so a configured user never sees it open and then collapse.
const settingsLoaded = ref(false);
const guideToggled = ref<boolean | null>(null);
const isGuideOpen = computed(() => guideToggled.value ?? (settingsLoaded.value && telegramStatus.value === 'none'));

const focusField = (id: string) => {
  const el = document.getElementById(id);
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el?.focus({ preventScroll: true });
};

const isSending = ref(false);
const sendTestMessage = async () => {
  // Awaited here so the test message is not sent while the prompt is still open.
  await requestTelegramPermission();
  isSending.value = true;
  const testMessage = `<b>TEST</b>\n${t('settings_page.telegram_test_message')}`;
  // Snapshot: an edit during the request must not be marked as tested.
  const token = formFields.telegram_bot_token;
  const channel = formFields.telegram_channel_id;
  const sendData = await sendTelegramMessage(token, channel, testMessage);
  isSending.value = false;
  if (sendData?.ok) {
    telegramTestPassed.value = token === formFields.telegram_bot_token && channel === formFields.telegram_channel_id;
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
const backupDate = computed(() => {
  const raw = importPreview.value?.created_at;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(locale.value, { dateStyle: 'medium' }) : '';
});
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
  settingsLoaded.value = true;
});
</script>
