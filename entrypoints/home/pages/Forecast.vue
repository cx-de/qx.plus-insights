<template>
  <div>
    <div class="mx-auto grid flex-1 auto-rows-max gap-4">
      
      <div class="w-full overflow-auto shadow-lg rounded-lg">

        <Card class="border-0 shadow-none rounded-lg block w-full p-6 bg-card text-card-foreground transition-all">
          <CardContent class="p-0">
            <div class="w-full lg:w-auto flex items-center justify-center">
              
              <!-- w-full: inside the centering flex parent the skeleton collapsed to zero width -->
              <div v-if="isLoading" class="w-full">
                <div class="w-full flex items-center justify-center">
                  <!-- Fixed 1200x700 overflowed the popup at anything but full width. -->
                  <Skeleton class="w-full min-h-[320px] rounded-md" :class="chartHeightClass" />  
                </div>
              </div>
              
              <!-- Flex column: the canvas has maintainAspectRatio:false so it fills its
                   parent, and as a sibling of the toolbar it overflowed this fixed box.
                   Height comes from chartHeightClass, which accounts for the API-key banner. -->
              <div v-else class="relative w-full flex flex-col min-h-[320px]" :class="chartHeightClass">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <div class="flex flex-wrap items-center gap-3">
                    <AccountFilter @change="loadForecast()" />
                    <CombineSwitch :rows="listData" any-accounts @change="onCombineChange()" />
                    <!-- Prognose only covers the next 12 months, so past-looking ranges do not apply there. -->
                    <div v-if="selectedType !== 'forecast'" class="flex flex-wrap gap-1">
                      <Button v-for="range in rangeOptions" :key="range" size="sm"
                        :variant="selectedRange !== range ? 'secondary' : 'default' "
                        :aria-pressed="selectedRange === range"
                        @click="selectRange(range)">
                        {{ $t(`range_${range}`) }}
                      </Button>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <Button v-for="option in options" :key="option.value" size="sm"
                      :variant="selectedType !== option.value ? 'secondary' : 'default' "
                      :aria-pressed="selectedType === option.value"
                      @click="updateChartData(option.value)">
                      {{ option.label }}
                    </Button>
                  </div>
                </div>
                <!-- min-h-0 so flex-1 may shrink below the canvas's intrinsic size. -->
                <!-- One panel per account when separate: on a shared axis a 1k account flattened to 0 under 1M ones. -->
                <div class="relative flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
                  <!-- The bottom panel's 70px basis is its date axis, so every plot area gets the same height. -->
                  <div v-for="(panel, i) in chartPanels" :key="panel.key ?? 'all'"
                    class="flex flex-col"
                    :class="chartPanels.length <= 1 ? 'flex-1 min-h-0'
                      : i === chartPanels.length - 1 ? 'flex-[1_1_70px] min-h-[210px]' : 'flex-[1_1_0px] min-h-[140px]'">
                    <div v-if="chartPanels.length > 1" class="text-xs font-medium"
                      :class="panel.key ? 'text-muted-foreground' : 'text-foreground'">{{ panel.label }}</div>
                    <div class="relative flex-1 min-h-0">
                      <Line :key="`${chartKey}-${i}`" :ref="(el:any) => setPanelChart(i, el)"
                        :data="panel.data" :options="panel.options" :plugins="[lineEndLabels, syncCrosshair]" />
                    </div>
                  </div>
                  <!-- blank axes gave no hint why nothing was drawn -->
                  <div v-if="isChartEmpty" class="absolute inset-0 bg-card">
                    <Empty compact />
                  </div>
                </div>
              </div>

            </div>
          </CardContent>
         </Card>

        
         <template v-if="selectedType === 'forecast'">
            <!-- Scenarios  -->
            <Button @click="isScenarioSheet = true"
              :aria-label="$t('scenarios.title')" :title="$t('scenarios.title')"
              class="fixed top-[20%] right-0 z-50 shadow-lg rounded-l-full rounded-tr-none rounded-br-none p-2">
              <SlidersHorizontal class="w-4 h-4" />
              <!-- exclusions change every scenario line, so they must be noticeable with the sheet closed -->
              <span v-if="excludedWkns.length" class="absolute -top-1 -left-1 min-w-4 h-4 px-1 rounded-full bg-background text-foreground border text-[10px] leading-[14px] tabular-nums"
                :title="$t('scenarios.exclude_summary', excludedWkns.length)">{{ excludedWkns.length }}</span>
            </Button>

            <Sheet v-model:open="isScenarioSheet">
              <!-- light overlay: the chart behind must stay readable so scenario edits show their effect -->
              <SheetContent side="right" overlay-class="bg-black/20" class="w-full sm:max-w-md p-6 flex flex-col">
                <SheetHeader>
                  <SheetTitle>{{ $t('scenarios.title') }}</SheetTitle>
                  <SheetDescription>
                    {{ $t('scenarios.description') }}
                  </SheetDescription>
                </SheetHeader>

                <!-- One job per tab: stacked collapsibles hid puts and exclusions below a long scenario list -->
                <Tabs v-model="scenarioTab" class="mt-3 flex flex-col flex-1 min-h-0">
                  <!-- sized by label: equal thirds cut off the long German "Ausgeschlossen" -->
                  <TabsList class="flex w-full">
                    <TabsTrigger value="scenarios" class="flex-auto px-2">
                      {{ $t('scenarios.tab_scenarios') }} <span class="ml-1 text-xs tabular-nums text-muted-foreground">{{ scenarios.length }}</span>
                    </TabsTrigger>
                    <TabsTrigger value="puts" class="flex-auto px-2">
                      {{ $t('scenarios.tab_puts') }} <span class="ml-1 text-xs tabular-nums text-muted-foreground">{{ virtualPuts.length }}</span>
                    </TabsTrigger>
                    <TabsTrigger value="excluded" class="flex-auto px-2">
                      {{ $t('scenarios.tab_excluded') }} <span class="ml-1 text-xs tabular-nums text-muted-foreground">{{ excludedWkns.length }}</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="scenarios" class="mt-3 flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden">
                    <!-- Collapsed by default so the list leads; the form opens in place of the button -->
                    <Button v-if="!isScenarioFormOpen" type="button" variant="outline"
                      class="w-full h-10 border-dashed text-muted-foreground hover:text-foreground"
                      id="scenario-add-button" @click="openScenarioForm">
                      <Plus class="w-4 h-4 mr-1" />
                      {{ $t('scenarios.add') }}
                    </Button>

                    <form v-else @submit.prevent="saveScenario" class="rounded-lg border bg-muted/40 p-4 space-y-4">
                      <h3 class="text-sm font-semibold">{{ editingIndex !== null ? $t('scenarios.form_edit') : $t('scenarios.form_new') }}</h3>

                      <div class="space-y-1.5">
                        <Label for="market" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.market_change') }}</Label>
                        <div class="flex gap-2">
                          <div class="relative w-28 shrink-0">
                            <Input v-model="form.market"
                              id="market" type="number"
                              placeholder="0"
                              step=".01"
                              class="pr-7 bg-background tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              required />
                            <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                          </div>
                          <div class="flex flex-1 gap-1" role="group" :aria-label="$t('scenarios.presets')">
                            <Button v-for="preset in marketPresets" :key="preset" type="button" variant="outline"
                              :class="['flex-1 px-0 text-xs tabular-nums bg-background', Number(form.market) === preset ? 'border-primary text-foreground' : 'text-muted-foreground']"
                              :aria-pressed="Number(form.market) === preset"
                              @click="form.market = preset">
                              {{ preset > 0 ? `+${preset}` : `−${Math.abs(preset)}` }}
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div class="space-y-1.5">
                        <Label class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.date_range') }}</Label>
                        <DateRangePicker v-model="form.timeframe"
                          :minValue="minDate"
                          :key="scenariosKeys" />
                      </div>

                      <div class="flex justify-end gap-2 border-t pt-3">
                        <Button type="button" size="sm" variant="ghost" @click="resetForm()">{{ $t('cancel') }}</Button>
                        <!-- one key per action: "Add" + "Scenario" glued words broke German grammar -->
                        <Button type="submit" size="sm">
                          {{ editingIndex !== null ? $t('scenarios.update') : $t('scenarios.add') }}
                        </Button>
                      </div>
                    </form>

                    <!-- Scenario List -->
                    <div class="mt-5 flex flex-col flex-1 min-h-0">
                      <div v-if="scenarios.length>0" class="flex items-center justify-between pb-2 border-b">
                        <span class="text-sm font-medium">{{ $t('scenarios.count', scenarios.length) }}</span>
                        <Button @click="clearAllScenarios" size="sm" variant="ghost" class="h-8 px-2 text-muted-foreground hover:text-destructive">
                          <Trash2 class="w-4 h-4 mr-1" />
                          {{ $t('scenarios.clear_all') }}
                        </Button>
                      </div>

                      <div v-if="scenarios.length === 0" class="flex flex-col items-center text-center gap-2 py-10 text-sm text-muted-foreground">
                        <SlidersHorizontal class="w-5 h-5" />
                        <p class="max-w-[16rem]">{{ $t('scenarios.empty') }}</p>
                      </div>

                      <ul v-else class="flex-1 min-h-0 overflow-y-auto divide-y">
                        <li v-for="(scenario, index) in scenarios" :key="index"
                          :class="[
                            'flex items-center gap-3 py-3 px-2 transition-colors',
                            editingIndex === index ? 'bg-muted shadow-[inset_2px_0_0_hsl(var(--primary))]' : '',
                            !scenario.active ? 'opacity-50' : ''
                          ]">
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-3">
                              <span :class="['text-lg font-semibold tabular-nums w-20', marketTone(scenario.market)]">
                                {{ formatMarket(scenario.market) }}
                              </span>
                              <!-- diverging bar: length is relative to the largest scenario so the fan reads like the chart -->
                              <span class="relative w-16 h-1.5 rounded-full bg-muted" aria-hidden="true">
                                <span class="absolute left-1/2 top-[-3px] w-px h-3 bg-border"></span>
                                <span :class="['absolute top-0 h-full', Number(scenario.market) >= 0 ? 'left-1/2 rounded-r-full bg-emerald-500' : 'right-1/2 rounded-l-full bg-rose-500']"
                                  :style="{ width: `${marketBarWidth(scenario.market)}%` }"></span>
                              </span>
                            </div>
                            <p class="mt-0.5 text-xs text-muted-foreground truncate">
                              {{ $t('scenarios.timeframe_range', { start: formatDate(scenario.timeframe.start), end: formatDate(scenario.timeframe.end) }) }}
                              · {{ $t('scenarios.days', scenarioDays(scenario)) }}
                            </p>
                            <!-- the client's question is how much the put saves, so it is answered here, not only on chart hover -->
                            <p v-if="Number.isFinite(scenarioHedgeEffects[index])"
                              :class="['mt-0.5 flex items-center gap-1 text-xs font-medium tabular-nums', marketTone(scenarioHedgeEffects[index])]">
                              <ShieldCheck class="w-3.5 h-3.5" aria-hidden="true" />
                              {{ $t('scenarios.virtual_puts.row_effect', { value: formatSigned(scenarioHedgeEffects[index]) }) }}
                            </p>
                          </div>

                          <div class="flex gap-0.5 shrink-0">
                            <Button @click="toggleScenarioStatus(index)" size="icon" variant="ghost" class="h-8 w-8 text-muted-foreground"
                              :aria-pressed="!!scenario.active" :aria-label="$t('scenarios.show_in_chart')" :title="$t('scenarios.show_in_chart')">
                              <Eye v-if="scenario.active" class="w-4 h-4" />
                              <EyeOff v-else class="w-4 h-4" />
                            </Button>
                            <Button @click="editSenario(index)" size="icon" variant="ghost" class="h-8 w-8 text-muted-foreground"
                              :aria-label="$t('edit')" :title="$t('edit')">
                              <Pencil class="w-4 h-4" />
                            </Button>
                            <Button @click="removeSenario(index)" size="icon" variant="ghost" class="h-8 w-8 text-muted-foreground hover:text-destructive"
                              :aria-label="$t('delete')" :title="$t('delete')">
                              <Trash class="w-4 h-4" />
                            </Button>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </TabsContent>

                  <!-- Same layout as Scenarios: add box on top, then count + bulk action, then the list -->
                  <TabsContent value="puts" class="mt-3 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
                    <!-- Collapsed by default, same as the scenario form -->
                    <Button v-if="!isVirtualPutFormOpen" type="button" variant="outline"
                      class="w-full h-10 border-dashed text-muted-foreground hover:text-foreground"
                      id="vp-add-button" @click="openVirtualPutForm">
                      <Plus class="w-4 h-4 mr-1" />
                      {{ $t('scenarios.virtual_puts.add') }}
                    </Button>

                    <form v-else @submit.prevent="addVirtualPut" class="rounded-lg border bg-muted/40 p-4 space-y-4">
                      <h3 class="text-sm font-semibold">{{ editingPutId ? $t('scenarios.virtual_puts.form_edit') : $t('scenarios.virtual_puts.form_new') }}</h3>

                      <div class="-mt-2 text-xs text-muted-foreground">
                        <p>{{ $t('scenarios.virtual_puts.hint') }}</p>
                        <details class="mt-1">
                          <summary class="cursor-pointer w-fit rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {{ $t('scenarios.virtual_puts.limits_title') }}
                          </summary>
                          <p class="mt-1">{{ $t('scenarios.virtual_puts.limits') }}</p>
                        </details>
                      </div>

                      <fieldset class="grid grid-cols-2 gap-x-2 gap-y-3">
                        <legend class="mb-2 text-xs font-semibold">{{ $t('scenarios.virtual_puts.group_underlying') }}</legend>
                        <div class="space-y-1.5">
                          <Label for="vp-underlying" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.virtual_puts.underlying_name') }}</Label>
                          <Input v-model="virtualPutForm.underlying_name" id="vp-underlying" maxlength="40" placeholder="DAX"
                            class="bg-background" required />
                        </div>
                        <div class="space-y-1.5">
                          <Label for="vp-underlying-price" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.virtual_puts.underlying_price') }}</Label>
                          <Input v-model="virtualPutForm.underlying_price" id="vp-underlying-price" type="number" min="0" step="any" class="bg-background tabular-nums" required />
                        </div>
                      </fieldset>

                      <fieldset class="grid grid-cols-2 gap-x-2 gap-y-3">
                        <legend class="mb-2 text-xs font-semibold">{{ $t('scenarios.virtual_puts.group_put') }}</legend>
                        <div class="space-y-1.5">
                          <Label for="vp-strike" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.virtual_puts.strike') }}</Label>
                          <Input v-model="virtualPutForm.strike" id="vp-strike" type="number" min="0" step="any" class="bg-background tabular-nums" required />
                        </div>
                        <div class="space-y-1.5">
                          <Label for="vp-maturity" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.virtual_puts.maturity') }}</Label>
                          <Input v-model="virtualPutForm.maturity" id="vp-maturity" type="date" :min="tomorrowIso" class="bg-background" required />
                        </div>
                        <div class="space-y-1.5">
                          <Label for="vp-ratio" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.virtual_puts.ratio') }}</Label>
                          <Input v-model="virtualPutForm.ratio" id="vp-ratio" type="number" min="0" step="any" class="bg-background tabular-nums" aria-describedby="vp-ratio-hint" required />
                          <p id="vp-ratio-hint" class="text-xs text-muted-foreground">{{ $t('scenarios.virtual_puts.ratio_hint') }}</p>
                        </div>
                        <div v-if="virtualPutForm.iv_manual" class="space-y-1.5">
                          <Label for="vp-iv" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.virtual_puts.iv') }}</Label>
                          <div class="relative">
                            <Input v-model="virtualPutForm.implied_volatility" id="vp-iv" type="number" min="0" step="any" class="pr-7 bg-background tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" required />
                            <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                          </div>
                        </div>
                      </fieldset>

                      <fieldset class="grid grid-cols-2 gap-x-2 gap-y-3">
                        <legend class="mb-2 text-xs font-semibold">{{ $t('scenarios.virtual_puts.group_purchase') }}</legend>
                        <div class="space-y-1.5">
                          <Label for="vp-quantity" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.virtual_puts.quantity') }}</Label>
                          <Input v-model="virtualPutForm.quantity" id="vp-quantity" type="number" min="1" step="1" class="bg-background tabular-nums" required />
                        </div>
                        <div class="space-y-1.5">
                          <Label for="vp-price" class="text-xs font-medium text-muted-foreground">{{ $t('scenarios.virtual_puts.price') }}</Label>
                          <div class="relative">
                            <Input v-model="virtualPutForm.price" id="vp-price" type="number" min="0" step="any" class="pr-7 bg-background tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" required />
                            <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">€</span>
                          </div>
                        </div>
                      </fieldset>

                      <!-- strike distance catches a strike typed in a different unit than the underlying price -->
                      <div class="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-md bg-background px-3 py-2 text-xs tabular-nums" aria-live="polite">
                        <span>{{ $t('scenarios.virtual_puts.premium') }} <strong class="font-semibold">{{ virtualPutPreview.premium ? `${formatChartNumber(virtualPutPreview.premium, 2)} €` : '–' }}</strong></span>
                        <span class="text-muted-foreground">{{ virtualPutDistanceText }}</span>
                        <span v-if="virtualPutPreview.iv" class="w-full text-muted-foreground">{{ $t('scenarios.virtual_puts.iv_preview', { value: formatChartNumber(virtualPutPreview.iv, 1) }) }}</span>
                        <span v-if="virtualPutIvWarning" class="w-full font-medium text-amber-700 dark:text-amber-400">{{ virtualPutIvWarning }}</span>
                      </div>

                      <div class="flex justify-end gap-2 border-t pt-3">
                        <Button type="button" size="sm" variant="ghost" @click="closeVirtualPutForm">{{ $t('cancel') }}</Button>
                        <Button type="submit" size="sm" :disabled="isVirtualPutSaving">{{ editingPutId ? $t('scenarios.virtual_puts.update') : $t('scenarios.virtual_puts.add') }}</Button>
                      </div>
                    </form>

                    <!-- Put List -->
                    <div class="mt-5 flex flex-col">
                      <div v-if="virtualPuts.length" class="flex items-center justify-between pb-2 border-b">
                        <span class="text-sm font-medium tabular-nums">{{ $t('scenarios.virtual_puts.count', virtualPuts.length) }}</span>
                        <Button size="sm" variant="ghost" class="h-8 px-2 text-muted-foreground hover:text-destructive" @click="clearVirtualPuts">
                          <Trash2 class="w-4 h-4 mr-1" />
                          {{ $t('scenarios.clear_all') }}
                        </Button>
                      </div>

                      <div v-if="!virtualPuts.length" class="flex flex-col items-center text-center gap-2 py-10 text-sm text-muted-foreground">
                        <ShieldCheck class="w-5 h-5" />
                        <p class="max-w-[16rem]">{{ $t('scenarios.virtual_puts.empty') }}</p>
                      </div>

                      <ul v-else class="divide-y">
                        <li v-for="put in virtualPuts" :key="put.id"
                          :class="[
                            'flex items-center gap-3 py-3 px-2 transition-colors',
                            editingPutId === put.id ? 'bg-muted shadow-[inset_2px_0_0_hsl(var(--primary))]' : '',
                            !put.active || isVirtualPutExpired(put) ? 'opacity-50' : ''
                          ]">
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold truncate tabular-nums" :title="put.underlying_name">
                              {{ formatChartNumber(put.quantity) }} × Put {{ put.underlying_name }}
                              <span v-if="isVirtualPutExpired(put)" class="text-xs font-normal text-muted-foreground">· {{ $t('scenarios.virtual_puts.expired') }}</span>
                            </p>
                            <p class="mt-0.5 text-xs text-muted-foreground truncate tabular-nums">
                              {{ $t('scenarios.virtual_puts.strike') }} {{ formatStrike(put.strike) }} · {{ formatDate(put.maturity) }}
                            </p>
                            <p class="text-xs text-muted-foreground tabular-nums">
                              {{ $t('scenarios.virtual_puts.premium') }} {{ formatChartNumber(put.price * put.quantity, 2) }} €
                            </p>
                          </div>
                          <div class="flex gap-0.5 shrink-0">
                            <Button @click="toggleVirtualPut(put.id)" size="icon" variant="ghost" class="h-8 w-8 text-muted-foreground"
                              :aria-pressed="!!put.active" :aria-label="$t('scenarios.show_in_chart')" :title="$t('scenarios.show_in_chart')">
                              <Eye v-if="put.active" class="w-4 h-4" />
                              <EyeOff v-else class="w-4 h-4" />
                            </Button>
                            <Button @click="editVirtualPut(put.id)" size="icon" variant="ghost" class="h-8 w-8 text-muted-foreground"
                              :aria-label="$t('edit')" :title="$t('edit')">
                              <Pencil class="w-4 h-4" />
                            </Button>
                            <Button @click="removeVirtualPut(put.id)" size="icon" variant="ghost" class="h-8 w-8 text-muted-foreground hover:text-destructive"
                              :aria-label="$t('delete')" :title="$t('delete')">
                              <Trash class="w-4 h-4" />
                            </Button>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </TabsContent>

                  <!-- Excluded positions: market % is not applied to these WKNs in any scenario -->
                  <TabsContent value="excluded" class="mt-3 flex flex-col flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
                    <div class="rounded-lg border bg-muted/40 p-3 space-y-2">
                      <p class="text-xs text-muted-foreground">{{ $t('scenarios.exclude_hint') }}</p>
                      <div class="relative">
                        <Input v-model="excludeSearch" :placeholder="$t('scenarios.exclude_search')" class="h-8 bg-background text-sm"
                          role="combobox" :aria-expanded="isExcludeListOpen && excludeSuggestions.length > 0" aria-controls="exclude-suggestions"
                          @focus="isExcludeListOpen = true" @blur="isExcludeListOpen = false" @input="isExcludeListOpen = true"
                          @keydown.down.prevent="moveActiveSuggestion(1)" @keydown.up.prevent="moveActiveSuggestion(-1)"
                          @keydown.enter.prevent="addExcludedFromInput" @keydown.esc="excludeSearch = ''; isExcludeListOpen = false" />
                        <!-- opens downward: the search sits at the top of its own tab, with room below -->
                        <ul v-if="isExcludeListOpen && excludeSuggestions.length" id="exclude-suggestions" role="listbox"
                          class="absolute z-10 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
                          <li v-for="(position, i) in excludeSuggestions" :key="position.wkn" role="option" :aria-selected="i === activeSuggestion">
                            <!-- mousedown: a click would lose the race against the input's blur -->
                            <button type="button" tabindex="-1"
                              :class="['flex w-full items-center gap-2 px-2 py-1.5 text-sm text-left hover:bg-muted', i === activeSuggestion ? 'bg-muted' : '']"
                              @mouseenter="activeSuggestion = i" @mousedown.prevent="addExcludedWkn(position)">
                              <span class="flex-1 min-w-0 truncate" :title="position.name">{{ position.name }}</span>
                              <span class="text-xs text-muted-foreground tabular-nums">{{ position.wkn }}</span>
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <!-- Excluded List -->
                    <div class="mt-5 flex flex-col">
                      <div v-if="excludedWkns.length" class="flex items-center justify-between pb-2 border-b">
                        <span class="text-sm font-medium tabular-nums">{{ $t('scenarios.exclude_summary', excludedWkns.length) }}</span>
                        <Button size="sm" variant="ghost" class="h-8 px-2 text-muted-foreground hover:text-destructive" @click="clearExcludedWkns">
                          <Trash2 class="w-4 h-4 mr-1" />
                          {{ $t('scenarios.exclude_clear') }}
                        </Button>
                      </div>

                      <div v-if="!excludedWkns.length" class="flex flex-col items-center text-center gap-2 py-10 text-sm text-muted-foreground">
                        <CircleSlash class="w-5 h-5" />
                        <p class="max-w-[16rem]">{{ $t('scenarios.exclude_empty') }}</p>
                      </div>

                      <ul v-else class="divide-y">
                        <li v-for="wkn in excludedWkns" :key="wkn"
                          :class="['flex items-center gap-3 py-3 px-2', portfolioPositions.has(wkn) ? '' : 'opacity-50']">
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold truncate" :title="portfolioPositions.get(wkn) || wkn">{{ portfolioPositions.get(wkn) || wkn }}</p>
                            <p class="mt-0.5 text-xs text-muted-foreground tabular-nums">{{ wkn }}</p>
                          </div>
                          <Button size="icon" variant="ghost" class="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            :aria-label="$t('scenarios.exclude_remove', { wkn })" :title="$t('scenarios.exclude_remove', { wkn })"
                            @click="removeExcludedWkn(wkn)">
                            <Trash class="w-4 h-4" />
                          </Button>
                        </li>
                      </ul>
                    </div>
                  </TabsContent>
                </Tabs>

              </SheetContent>
            </Sheet>
        
              <!-- Export  -->
              <Button @click="openForecastTableData()"
                :aria-label="$t('forecast_export.title')" :title="$t('forecast_export.title')"
                class="fixed top-[30%] right-0 z-50 shadow-lg rounded-l-full rounded-tr-none rounded-br-none p-2">
                <Table2 class="w-4 h-4" />
              </Button>
              
              <Sheet v-model:open="isExportSheet">
                <SheetContent side="right" class="w-[90%] sm:max-w-[90%] p-6">
                  <SheetHeader>
                    <SheetTitle>{{ $t('forecast_export.title') }}</SheetTitle>
                    <SheetDescription>
                      {{ $t('forecast_export.description') }}
                    </SheetDescription>
                  </SheetHeader>
                  <div class="mt-4">
                    <div class="flex flex-wrap items-end gap-2">
                      <div class="grid gap-1.5">
                        <Label for="export_date">{{ $t('date') }}</Label>
                        <!-- min needs a YYYY-MM-DD string; the Date object it got was ignored -->
                        <Input id="export_date" v-model="exportDate" type="date" class="w-44"
                          required :min="defaultExportDate" />
                      </div>
                      <Button @click="loadForecastData()" :disabled="isTableLoading">
                        <Calculator class="w-4 h-4 mr-2" /> {{ $t('calculate') }}
                      </Button>
                      <Button @click="exportForecast()" variant="outline" :disabled="isExporting">
                        <Download class="w-4 h-4 mr-2" /> {{ $t('export') }}
                      </Button>
                    </div>

                    <div class="mt-5 w-full min-w-0 max-h-[calc(100dvh-200px)] overflow-auto rounded-md border">
                      <Table v-if="table">
                        <TableHeader>
                          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                            <TableHead v-for="header in headerGroup.headers" :key="header.id"
                            class="sticky top-0 z-30 bg-primary text-primary-foreground">
                              <FlexRender v-if="!header.isPlaceholder" :render="header.column.columnDef.header" :props="header.getContext()" />
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <template v-if="table.getRowModel().rows?.length">
                            <template v-for="row in table.getRowModel().rows" :key="row.id">
                              <TableRow class="">
                                <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                                  <template v-if="cell.column.id === 'type'">
                                    {{ $t(row.original.type) }}
                                  </template>
                                  <template v-else-if="forecastTableNonPriceFields.includes(cell.column.id)">
                                      {{ row.original[cell.column.id] }}
                                  </template>
                                  <template v-else>
                                    {{ row.original[cell.column.id] != null && row.original[cell.column.id] !== '' ? numberToGerman(row.original[cell.column.id]) : '' }}
                                  </template>
                                </TableCell>
                              </TableRow>

                             
                            </template>
                            <TableRow class="sticky bottom-0 bg-muted! font-semibold z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.1)]">
                              <TableCell v-for="col in table.getAllLeafColumns()" :key="col.id">
                                <template v-if="col.id === 'type'">
                                  {{  $t('total') }}
                                </template>

                                <template v-else-if="forecastTableNonPriceFields.includes(col.id)">
                                  <!-- leave empty -->
                                </template>

                                <template v-else>
                                  {{ getColumnTotal(col.id) }}
                                </template>
                              </TableCell>
                            </TableRow>
                          </template>
                          <TableRow v-else class="hover:bg-transparent">
                            <TableCell :colspan="columns.length">
                              <Skeleton v-if="isTableLoading" class="h-24 w-full rounded-md" />
                              <Empty v-else compact />
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                  </div>
                </SheetContent>
              </Sheet>

          </template>

          <AlertDialog :open="!!confirmState" @update:open="(open) => { if (!open) confirmState = null }">
            <!-- z-60: confirm opens from the Szenarien sheet (z-50), whose overlay would otherwise cover it -->
            <AlertDialogContent class="z-60">
              <AlertDialogHeader>
                <AlertDialogTitle>{{ confirmState?.title }}</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{{ $t('cancel') }}</AlertDialogCancel>
                <AlertDialogAction class="bg-destructive text-destructive-foreground hover:bg-destructive/90" @click="runConfirm()">
                  {{ $t('delete') }}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        </div>
      </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, nextTick } from 'vue';
import Empty from '~/components/Empty.vue'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { BlackScholes } from '@uqee/black-scholes'
import { downloadXlsx } from "~/utils/export-utils";

import {useI18n} from "vue-i18n";
import { storage } from '#imports'
import { Line } from 'vue-chartjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import DateRangePicker  from '@/components/DateRangePicker.vue'
import AccountFilter from '~/components/AccountFilter.vue'
import CombineSwitch from '~/components/CombineSwitch.vue'
import { getLocalTimeZone, today, CalendarDate } from '@internationalized/date';
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast';


import { FlexRender, getCoreRowModel, getExpandedRowModel, getFilteredRowModel, getSortedRowModel, useVueTable } from "@tanstack/vue-table";
import { sortableHeader } from '~/utils/table-utils';

import { valueUpdater } from '~/lib/utils'



import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  formatDateToYMD,
  formatDate,
  deepCloneReactiveData,
  calculateFutureTotalValue,
  todayIso,
} from '~/utils/helper'
import { virtualPutRow, virtualPutSigma, virtualPutValidate } from '~/utils/virtual-put-utils'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  Chart as ChartJS,
  CategoryScale,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

import 'chartjs-adapter-date-fns';
ChartJS.register(
  TimeScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

import { Pencil, Trash, Trash2, Eye, EyeOff, Download, SlidersHorizontal, Table2, Calculator, CircleSlash, ShieldCheck, Plus } from 'lucide-vue-next';

const { t,locale } = useI18n();
document.title = t('forecast');

// native confirm()/alert() were English-only and blocked the page
const confirmState = ref<any>(null);
// Kept outside confirmState: AlertDialogAction closes the dialog (clearing confirmState) before its @click runs.
let pendingConfirm: (() => any) | null = null;
const askConfirm = (title: string, action: () => any) => { pendingConfirm = action; confirmState.value = { title }; };
const runConfirm = async () => {
  const action = pendingConfirm;
  pendingConfirm = null;
  confirmState.value = null;
  if (action) await action();
};
const notifyError = (title: string) => toast({ title, variant: 'destructive' });

// Chart.js defaults (#666 text, dark grid) had poor contrast on the dark card
const themeColor = (name: string, alpha = 1) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `hsl(${value} / ${alpha})` : undefined;
};
const axisTextColor = themeColor('--muted-foreground');
const gridColor = themeColor('--border');
const customColors = [
  '#3B5B84', '#A03F78', '#98BD4A', '#CA9B4F',
  '#294D7B', '#952968', '#86AF30', '#BB8733',
  '#1D406D', '#841A58', '#749C1F', '#A77321',
  '#113461', '#760C4A', '#638B0E', '#94610E',
  '#072954', '#66003C', '#517800', '#804F00'
];

const options = [
  { label: t('history'), value: 'history' },
  { label: t('forecast'), value: 'forecast' },
  { label: t('history')+" + "+t('forecast'), value: 'multi' },
]
const selectedType = ref(readForecastType());

function readForecastType() {
  try {
    const saved = localStorage.getItem('forecastType');
    // Validated: a stale or hand-edited value would leave no chart mode selected.
    return options.some((o) => o.value === saved) ? saved : 'history';
  } catch (err) {
    // A view preference is not worth failing the chart over.
    console.error('readForecastType error:', err);
    return 'history';
  }
}

const rangeOptions:any[] = ['1d', '1w', '1m', '3m', '6m', '1y', '3y', '5y', 'max'];
const selectedRange = ref(readForecastRange());

function readForecastRange() {
  try {
    const saved = localStorage.getItem('forecastRange');
    return rangeOptions.includes(saved) ? saved : 'max';
  } catch (err) {
    // A view preference is not worth failing the chart over.
    console.error('readForecastRange error:', err);
    return 'max';
  }
}

function selectRange(range:any) {
  console.log("selectRange", range);
  selectedRange.value = range;
  try {
    localStorage.setItem('forecastRange', range);
  } catch (err) {
    // Only the remembered choice is lost; the chart still switches.
    console.error('selectRange error:', err);
  }
  recalculateDatapoints();
}

// UTC like the DAILY_TOTAL dates; day is clamped so a month back from 31.03 does not overflow into March.
function rangeStartStr(range:any) {
  if (range === 'max') return null;
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let day = now.getUTCDate();
  switch (range) {
    case '1d': day -= 1; break;
    case '1w': day -= 7; break;
    case '1m': month -= 1; break;
    case '3m': month -= 3; break;
    case '6m': month -= 6; break;
    case '1y': year -= 1; break;
    case '3y': year -= 3; break;
    case '5y': year -= 5; break;
  }
  if (range !== '1d' && range !== '1w') {
    day = Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  }
  return new Date(Date.UTC(year, month, day)).toISOString().split('T')[0];
}

const listData = ref([]);

let allDates = [];
const startDate = new Date();

for (let i = 0; i < 12; i++) {
  // Calculate year and month considering rollover
  const year = startDate.getFullYear() + Math.floor((startDate.getMonth() + i) / 12);
  const month = (startDate.getMonth() + i) % 12;

  // Get the number of days in this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    allDates.push(new Date(year, month, day));
  }
}

const todayDate = new Date();
const minDate = new CalendarDate(todayDate.getFullYear(), todayDate.getMonth() + 1, todayDate.getDate());

let dates = [];
for (let i = 0; i < 12; i++) {
  const year = todayDate.getFullYear();
  const month = todayDate.getMonth() + i + 1;
  
  // Handle year rollover when month exceeds 12
  const adjustedYear = year + Math.floor((month - 1) / 12);
  const adjustedMonth = ((month - 1) % 12) + 1;
  
  const lastDay = new Date(adjustedYear, adjustedMonth, 0);
  lastDay.setHours(0, 0, 0, 0); //new
  dates.push(lastDay);
}


const datapoints = ref([]);
const defaultDataSets = [
  {
    label: 'Portfolio Forecast',
    data: [],
    fill: false,
    tension: 0.4,
    borderColor: customColors[0],
    backgroundColor: customColors[0],
    cubicInterpolationMode: 'monotone',
  }
];

const chartData = ref({
  labels: allDates,
  datasets: defaultDataSets
});


// numberToGerman ignores the UI language, which put "3.042.133" next to a "3,050,000" axis.
const formatChartNumber = (value:any, decimals = 0) => {
  if (!Number.isFinite(Number(value))) return '';
  return new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(Number(value));
};

function lastFiniteIndex(data:any) {
  for (let i = data.length - 1; i >= 0; i--) {
    if (Number.isFinite(data[i])) return i;
  }
  return -1;
}

function endLabelText(dataset:any, last:any) {
  const value = dataset.data[last];
  const base = dataset.baseData?.[last];
  // Effect vs the forecast, so a put-hedged portfolio rising in a falling market reads as intended.
  let effect = Number.isFinite(base) && base ? (value / base - 1) * 100 : null;
  // Rounds to zero either way; "-0.0%" read as a loss.
  if (effect !== null && Math.abs(effect) < 0.05) effect = 0;
  const effectText = effect === null ? '' : ` (${effect > 0 ? '+' : ''}${formatChartNumber(effect, 1)}%)`;
  return `${dataset.endLabel} · ${formatChartNumber(value)}${effectText}`;
}

let measureContext:any = null;
// Only labels on the last date need the margin; one value for all panels keeps their plot areas aligned.
function endLabelPadding(datasets:any, labelCount:any) {
  measureContext ||= document.createElement('canvas').getContext('2d');
  if (!measureContext) return 190;
  measureContext.font = '11px sans-serif';
  let widest = 0;
  for (const dataset of datasets as any[]) {
    if (!dataset.endLabel) continue;
    const last = lastFiniteIndex(dataset.data || []);
    if (last < 0 || last !== labelCount - 1) continue;
    widest = Math.max(widest, measureContext.measureText(endLabelText(dataset, last)).width);
  }
  // 14px leader-line offset plus the label box and a little air.
  return widest ? Math.ceil(widest) + 24 : 16;
}

// Replaces the legend: with ten scenarios it wrapped over two rows and could not be matched to lines.
const lineEndLabels = {
  id: 'lineEndLabels',
  afterDatasetsDraw(chart:any) {
    const { ctx, chartArea } = chart;
    const labels:any[] = [];
    chart.data.datasets.forEach((dataset:any, datasetIndex:any) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden || !dataset.endLabel) return;
      const last = lastFiniteIndex(dataset.data);
      const point = meta.data[last];
      if (last < 0 || !point) return;
      labels.push({
        px: point.x, py: point.y, y: point.y, color: dataset.borderColor,
        text: endLabelText(dataset, last),
      });
    });
    if (!labels.length) return;

    // Scenario ends cluster within a few pixels, so spread them; short split panels shrink to still fit nine.
    const compact = chartArea.bottom - chartArea.top < 180;
    const gap = compact ? 11 : 12;
    const columns:any[] = [];
    for (const label of [...labels].sort((a, b) => a.px - b.px)) {
      // Only labels sharing a column collide; a scenario end mid-chart must not shove the right-edge ones.
      const column = columns.find((c) => Math.abs(c[0].px - label.px) < 120);
      if (column) column.push(label); else columns.push([label]);
    }
    for (const column of columns) {
      column.sort((a:any, b:any) => a.py - b.py);
      // Merge overlapping blocks around their mean anchor, so labels spread up and down, never only down.
      let blocks = column.map((label:any) => ({ items: [label] }));
      const place = (block:any) => {
        const height = (block.items.length - 1) * gap;
        const center = block.items.reduce((sum:any, l:any) => sum + l.py, 0) / block.items.length;
        block.top = Math.min(Math.max(center - height / 2, chartArea.top), chartArea.bottom - height);
        block.bottom = block.top + height;
      };
      blocks.forEach(place);
      for (let i = 1; i < blocks.length; i++) {
        if (blocks[i].top >= blocks[i - 1].bottom + gap) continue;
        blocks[i - 1].items.push(...blocks[i].items);
        blocks.splice(i, 1);
        place(blocks[i - 1]);
        i = 0;
      }
      let moved = false;
      for (const block of blocks) {
        block.items.forEach((label:any, k:any) => {
          label.y = block.top + k * gap;
          if (Math.abs(label.y - label.py) > 3) moved = true;
        });
      }
      // A moved label gets a leader line, which needs the text pushed clear of the point.
      column.forEach((label:any) => { label.x = label.px + (moved ? 14 : 6); });
    }

    ctx.save();
    ctx.font = compact ? '10px sans-serif' : '11px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
    const labelBackground = themeColor('--card', 0.85) || 'rgba(255,255,255,0.85)';
    for (const label of labels) {
      if (Math.abs(label.y - label.py) > 3) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = label.color;
        ctx.beginPath();
        ctx.moveTo(label.px + 3, label.py);
        ctx.lineTo(label.x - 2, label.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Lines crossing the label column made the text unreadable; a card-coloured box keeps it legible.
      const width = ctx.measureText(label.text).width;
      ctx.fillStyle = labelBackground;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(label.x - 2, label.y - gap / 2, width + 4, gap, 2);
      else ctx.rect(label.x - 2, label.y - gap / 2, width + 4, gap);
      ctx.fill();
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, label.x, label.y);
    }
    ctx.restore();
  },
};

// Panel components, not charts: vue-chartjs creates the chart after mount, so it is read at event time.
const panelCharts:any[] = [];
const setPanelChart = (index:any, el:any) => { panelCharts[index] = el; };

// Small multiples are only comparable if hovering one date marks the same date in every panel.
const syncCrosshair = {
  id: 'syncCrosshair',
  afterEvent(chart:any, args:any) {
    const others = panelCharts.map((el:any) => el?.chart).filter((other:any) => other && other !== chart);
    if (!others.length) return;
    const event = args.event;
    let index:any = null;
    if (event.type === 'mousemove') {
      index = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, false)[0]?.index ?? null;
    } else if (event.type !== 'mouseout') {
      return;
    }
    for (const other of others) {
      if (other.$syncIndex === index) continue;
      other.$syncIndex = index;
      other.update('none');
    }
  },
  afterDatasetsDraw(chart:any) {
    const index = chart.$syncIndex;
    if (index === null || index === undefined) return;
    const { ctx, chartArea } = chart;
    const datasetIndex = chart.data.datasets.findIndex((dataset:any) => !dataset.scenario
      && Number.isFinite(dataset.data[index]));
    const point = datasetIndex >= 0 ? chart.getDatasetMeta(datasetIndex).data[index] : null;
    const x = point ? point.x : chart.scales.x.getPixelForValue(chart.data.labels[index]);
    if (!Number.isFinite(x)) return;

    ctx.save();
    ctx.strokeStyle = axisTextColor || '#888';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    if (point) {
      const dataset = chart.data.datasets[datasetIndex];
      ctx.setLineDash([]);
      ctx.fillStyle = dataset.borderColor;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(formatChartNumber(dataset.data[index]), x + 4, chartArea.top + 2);
    }
    ctx.restore();
  },
};

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  // Room for lineEndLabels on lines that run to the right edge; sized per render by endLabelPadding.
  layout: { padding: { right: 190 } },
  locale: localStorage.getItem('lang') || 'en',
  plugins: {
    title: {
      display: false,
      text: 'Forecast Chart'
    },
    legend: {
      display: false,
      labels: { color: axisTextColor },
    },
    tooltip: {
      callbacks: {
        title: (tooltipItems) => {
          const date = tooltipItems[0].label;
          const fullDate = new Date(date);
          return fullDate.toLocaleDateString(locale.value === 'de' ? 'de-DE' : 'en-GB', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        },
        label: function (context) {
          const dataset = context.dataset;
          const index = context.dataIndex;
          
          let changeText = '';
          let changeAbsText = '';
          let scenarioChangeText = '';
          const value = context.raw;
          let prev = null;
          let prevDate = '';
          // Flag, not datasetIndex 0: split accounts put a history line per account.
          if (dataset.isHistory) {
            const prevEntry = historyEntryBefore(context.label, dataset.accountKey);
            if (prevEntry) {
              prev = prevEntry.total;
              prevDate = prevEntry.date.split('-').reverse().join('.');
            }
          } else if (index > 0) {
            // Weekly scenario dates leave several NaN gaps between month-ends; two steps back was not enough.
            const prevIndex = lastFiniteIndex(context.dataset.data.slice(0, index));
            prev = prevIndex >= 0 ? context.dataset.data[prevIndex] : null;
          }

          if(value && prev){
            const change = ((value - prev) / prev) * 100;
            const changeAbs = value - prev;
            const changeLabel = prevDate ? t('change_vs_date', { date: prevDate }) : t('change_vs_pm');
            const changeAbsLabel = prevDate ? t('change_vs_date_abs', { date: prevDate }) : t('change_vs_pm_abs');
            changeText = `${changeLabel}: ${change >= 0 ? '+' : ''}${formatChartNumber(change, 2)} %`;
            changeAbsText = `${changeAbsLabel}: ${changeAbs >= 0 ? '+' : ''}${formatChartNumber(changeAbs, 2)} €`;
          }

          if (index > 0) {

            //Scenario percentage
            let date = new Date(context.label);
            let scenarioData = context.dataset?.scenario;
            if (scenarioData) {
              let scenarioPercent = scenarioData.market; // e.g. -50
              let scenarioStartDate = new Date(scenarioData.timeframe.start);
              let scenarioEndDate = new Date(scenarioData.timeframe.end);
              
              const totalDays = (scenarioEndDate.getTime() - scenarioStartDate.getTime()) / (1000 * 60 * 60 * 24);
              const daysElapsed = (date.getTime() - scenarioStartDate.getTime()) / (1000 * 60 * 60 * 24);

              let scenarioPercentage = 0;
              // Before scenario start
              if (daysElapsed <= 0) {
                scenarioPercentage = 0;
              }
              // After scenario end
              else if (daysElapsed >= totalDays) {
                scenarioPercentage = scenarioPercent;
              }
              // In-between → linear progression
              else {
                scenarioPercentage = (daysElapsed / totalDays) * scenarioPercent;
              }
              
              scenarioChangeText += `${t('scenario_change_vs_pm')}: ${scenarioPercentage >= 0 ? '+' : ''}${formatChartNumber(scenarioPercentage, 2)} %`;
            }


          }
          
        if(dataset.scenario && selectedType.value === 'forecast'){
            
            const scenarioValue = context.raw;
            // Base scenario = first dataset (index 0)
            // Own account's base line: datasets[0] is only the first account when split.
            const baseValue = dataset.baseData?.[index] ?? scenarioValue;
            
            let scenarioEffectOnTarget = (scenarioValue - baseValue) || 0;
            const marketRisk = ((scenarioValue / baseValue -1) * 100) || 0;
            
            const todayTotal = dataset.todayTotal ?? scopedTodayTotal();
            let scenarioEffectOnCurrent = scenarioValue - todayTotal;
            const currentEffect = (scenarioValue / todayTotal -1) * 100;
            
            // A negative effect is real: in a rising market the premium is lost.
            const unhedgedValue = dataset.unhedgedData?.[index];
            const hedgeEffect = scenarioValue - unhedgedValue;
            const hedgeText = dataset.hedge && Number.isFinite(hedgeEffect)
              ? `${t('scenarios.virtual_puts.saving')}: ${hedgeEffect >= 0 ? '+' : ''}${formatChartNumber(hedgeEffect, 2)} € (${hedgeEffect >= 0 ? '+' : ''}${formatChartNumber((hedgeEffect / unhedgedValue) * 100, 2)}%)`
              : '';

            return [
              `${dataset.label} : ${formatChartNumber(scenarioValue, 2)}`,
              hedgeText,

              `${t('scenario_effect_on_the_target_value')}: ${formatChartNumber(scenarioEffectOnTarget, 2)} (${marketRisk >= 0 ? '+' : ''}${formatChartNumber(marketRisk, 2)}%)`,
              `${t('scenario_effect_on_the_current_portfolio_value')}: ${formatChartNumber(scenarioEffectOnCurrent, 2)} (${currentEffect >= 0 ? '+' : ''}${formatChartNumber(currentEffect, 2)}%)`,
              changeText,
              changeAbsText,
              scenarioChangeText
            ].filter(Boolean);
          }else{
            return [
              `${dataset.customLabels ? dataset.customLabels[index] : dataset.label} : ${formatChartNumber(context.raw, 2)}`,
              changeText,
              changeAbsText
            ].filter(Boolean);
          }
        },
        
      },
    },
  },
  interaction: {
    intersect: false,
  },
  scales: {
    x: {
      display: true,
      title: { display: true, text: '', color: axisTextColor },
      grid: { color: gridColor },
      type: 'time', // use 'category' if time scale is unavailable
      time: {
        unit: 'month',
        tooltipFormat: 'yyyy-MM-dd',
        minUnit: 'month'
      },
      ticks: {
        color: axisTextColor,
        source: 'auto',
        autoSkip: false, // label every vertical gridline with its date
        maxRotation: 60,
        minRotation: 45,
        callback: function(value, index, ticks) {
          // on a time scale ticks[index].value is the tick timestamp
          return formatDate(new Date(ticks[index].value));
        },
      },
    },
    y: {
      display: true,
      grid: { color: gridColor },
      ticks: { color: axisTextColor },
      title: {
        display: true,
        text: t('portfolio_value_in_euro'),
        color: axisTextColor,
      },
      suggestedMin: 0,
      suggestedMax: 500,
    }
  },
  spanGaps: true, //
};

const updateChartData = (event)=>{
  selectedType.value = event;
  try {
    localStorage.setItem('forecastType', event);
  } catch (err) {
    // Only the remembered choice is lost; the chart still switches.
    console.error('updateChartData error:', err);
  }
  recalculateDatapoints();
}

const getMinDate = (date) =>{
  const firstDate = new Date(date);
  const year = firstDate.getFullYear();
  const month = String(firstDate.getMonth() + 1).padStart(2, '0');
  const forcedMin = `${year}-${month}-01`;
  return forcedMin;
}


function calculateTotalValueForDate(date: Date, rows:any = listData.value): number {
  let total = 0;
  rows.forEach(item => {
    if (!item.total_value) return;
    
    
    if (item.valuation_date) {
      const valuationDate = new Date(item.valuation_date);

      if (date > valuationDate) {
        total += item.future_total_value ?? item.total_value;
      } else {
        if(item.type === "put"){
          const expectationMultiplier = 1;
          const dateObj = new Date(date);
          const daysForValuation = (valuationDate - dateObj) / (1000 * 60 * 60 * 24);
          const newUnderlying = item.underlying_price * expectationMultiplier;
          const bsTime = daysForValuation / 365;
          const bsSigma = item.implied_volatility/100;

          const bs = new BlackScholes();
          const blackScholesValue = bs.option({
            type: 'put',
            rate: 0.03, 
            strike: item.strike, 
            underlying: newUnderlying,
            sigma: bsSigma, 
            time: bsTime,
          });

          const scenarioValue = blackScholesValue.price;
          total += (scenarioValue * item.ratio) * item.stocks_owned;
          
        }else{
          const totalDays = (valuationDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
          const daysSinceToday = (date.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);

          if (totalDays <= 0 || daysSinceToday <= 0) {
            total += item.total_value;
          } else {
            const interpolatedValue = item.total_value + ((item.future_total_value - item.total_value) / totalDays) * daysSinceToday;
            total += interpolatedValue;
          }
        }
      }
    } else {
      total += item.total_value;
    }
  });
  return Math.round(total);
}

function toDate(val) {
  let d = val instanceof Date ? 
    new Date(val) : 
    new Date(val + "T00:00:00");
  d.setHours(0, 0, 0, 0); // normalize to midnight
  return d;
}

const MS_PER_DAY = 86400000;
const getScenarioItemFutureTotal = (item, scenario, date) =>{
  const { timeframe } = scenario;
  // Cash-like positions (e.g. overnight-rate ETFs) keep their neutral forecast instead of following the market shock.
  const market = excludedWkns.value.includes(item.wkn) ? 0 : scenario.market;
  const start = new Date(timeframe.start);
  const end = new Date(timeframe.end);
  const totalDays = (end - start) / MS_PER_DAY;
  const targetFactor = 1 + market / 100;

  const dateObj = new Date(date);
  const daysElapsed = (dateObj - start) / (1000 * 60 * 60 * 24);
  
  let expectationMultiplier = 1;

  const valuationDate = item.valuation_date ? new Date(item.valuation_date) : null;
  const daysToValuation = valuationDate ? (valuationDate - start) / MS_PER_DAY : null;
  if (targetFactor > 0 && totalDays > 0 && daysElapsed >= 0) {
    const daily = Math.pow(targetFactor, 1 / totalDays);
    expectationMultiplier = Math.pow(daily, daysElapsed);
    expectationMultiplier = Math.max(expectationMultiplier, 0.0001);
  }

  // --- Compute expectation multiplier *AT valuation date* ---
  let expectationAtValuation = 1;
  if (valuationDate && targetFactor > 0 && totalDays > 0 && daysToValuation >= 0) {
    const daily = Math.pow(targetFactor, 1 / totalDays);
    expectationAtValuation = Math.pow(daily, daysToValuation);
    expectationAtValuation = Math.max(expectationAtValuation, 0.0001);
  }


  // Use consistent date handling - convert all dates to Date objects for comparison
  const dateCurrent = toDate(date);
  const dateStart = toDate(timeframe.start);
  const dateEnd = toDate(timeframe.end);
  
  let scenarioFutureTotal = 0;
  let futureTotalValue = 0;

  if (dateCurrent >= dateStart && dateCurrent <= dateEnd) {
    if(item.type === "stock"){
      futureTotalValue = item.future_total_value * expectationMultiplier;
    }else{
      futureTotalValue = calculateFutureTotalValue(item,expectationMultiplier);
    }
    

    if(item.valuation_date) {
      const valuationDate = new Date(item.valuation_date);
      // Use dateObj (which is new Date(date)) for comparison with valuationDate
      if (dateObj > valuationDate) {
        scenarioFutureTotal = item.type === "stock" 
          ? item.future_total_value * expectationAtValuation
          : calculateFutureTotalValue(item, expectationAtValuation);
        return scenarioFutureTotal;
      } else {
        const totalDays = (valuationDate - todayDate) / (1000 * 60 * 60 * 24);
        const daysSinceToday = (dateObj - todayDate) / (1000 * 60 * 60 * 24);
        
        // Ensure we don't divide by zero and handle cases where valuationDate is before today
        if (totalDays <= 0 || daysSinceToday <= 0) {
          scenarioFutureTotal = item.total_value;
        } else {
          let interpolatedValue = item.total_value + ((futureTotalValue - item.total_value) / totalDays) * daysSinceToday; 
          if(item.type === "put"){
            const daysForValuation = (valuationDate - dateObj) / (1000 * 60 * 60 * 24);
            const newUnderlying = item.underlying_price * expectationMultiplier;
            const bsTime = daysForValuation / 365;
            const bsSigma = item.implied_volatility/100;

            const bs = new BlackScholes();
            const blackScholesValue = bs.option({
              type: 'put',
              rate: 0.03, 
              strike: item.strike, 
              underlying: newUnderlying,
              sigma: bsSigma, 
              time: bsTime,
            });
            const scenarioValue = blackScholesValue.price;
            
            
            interpolatedValue = (scenarioValue * item.ratio) * item.stocks_owned;
          }
          scenarioFutureTotal = interpolatedValue;
        }
      }
    }else{
      // Cash is never affected by market scenarios — keep it constant
      scenarioFutureTotal = item.stock_name === "Cash"
        ? (parseFloat(item.total_entry_value) || item.total_value || 0)
        : item.total_value * expectationMultiplier;
    }
  }else{
    scenarioFutureTotal = NaN;
  }

  return scenarioFutureTotal;
}


const accountLabels = ref<any>({});

// One line set per account unless combined; a single account in view needs no split either.
function chartAccountGroups() {
  const rowsByKey = new Map();
  for (const row of listData.value as any[]) {
    // An unattributed row would become a blank-titled panel; it still counts in the Total.
    if (!row?.broker) continue;
    const key = accountKeyOf(row);
    if (!rowsByKey.has(key)) rowsByKey.set(key, []);
    rowsByKey.get(key).push(row);
  }
  if (accountViewCombined.value || rowsByKey.size <= 1) return [{ key: null, label: '', rows: listData.value }];
  // Total first: splitting must not cost the user the portfolio figure; key null already means "all selected".
  return [{ key: null, label: t('total'), rows: listData.value }, ...[...rowsByKey.entries()].map(([key, rows]:any) => ({
    key, rows, label: accountLabels.value[key] || accountLabel(rows[0].broker, rows[0].account_id),
  }))];
}

// Same per-item sum as the scenario loop in recalculateDatapoints; NaN outside the timeframe.
function scenarioTotalForDate(rows:any, scenario:any, date:any) {
  let total = 0;
  for (const item of rows as any[]) {
    if (!item.total_value) continue;
    const value = getScenarioItemFutureTotal(item, scenario, new Date(date));
    if (isNaN(value)) return NaN;
    total += value;
  }
  return total;
}

const chartPanels = ref<any[]>([]);
const isLoading = ref(true);
const chartKey = ref(0);
const recalculateDatapoints = async() => {
  chartData.value.labels = [];
  datapoints.value = [];
  // An early return below would otherwise leave the previous view's panels on screen.
  chartPanels.value = [];
  chartData.value.datasets = defaultDataSets;


  if(selectedType.value==='history'){
    
    const rangeStart = rangeStartStr(selectedRange.value);
    const groups = chartAccountGroups();
    const groupTotals = groups.map((group:any) =>
      scopedDailyTotals(group.key).filter((entry:any) => !rangeStart || entry.date >= rangeStart));
    const historyTotals = groupTotals.flat();
    if (historyTotals && historyTotals.length > 0) {
      // Union of every account's days: one account may have been saved on a day another was not.
      const historyDates = [...new Set(historyTotals.map(item => item.date))].sort();

      const groupDatapoints = groupTotals.map((totals:any) => historyDates.map(date => {
        const found = totals.find((entry:any) => entry.date === date);
        return found ? found.total : null;
      }));
      const newDatapoints = groupDatapoints.flat().filter((value:any) => value !== null);
      
      
      chartData.value.labels = historyDates;
      datapoints.value = newDatapoints;
      chartData.value.datasets = groups.map((group:any, groupIndex:any) => ({
        label: t('history'),
        data: groupDatapoints[groupIndex],
        borderColor: customColors[0],
        backgroundColor: customColors[0],
        fill: false,
        tension: 0.4,
        cubicInterpolationMode: 'monotone',
        isHistory: true,
        accountKey: group.key,
        endLabel: t('history'),
      }));

      chartOptions.scales.x.min = historyDates[0];
      chartOptions.scales.x.ticks.source = "data";
      // one tick per saved day made 1y/max ranges an unreadable smear of labels
      chartOptions.scales.x.ticks.autoSkip = true;
      chartOptions.scales.x.ticks.maxTicksLimit = 14;
    }
    chartKey.value++; 
  }else if(selectedType.value==='forecast'){
      
    if (!listData.value || listData.value.length === 0) {
      datapoints.value = Array(dates.length).fill(0);
      chartData.value.datasets[0].data = datapoints.value;
      // returning without this left the skeleton spinning forever on an empty list
      isLoading.value = false;
      return;
    }
      
    const savedScenarios = await storage.getItem('local:scenarios') || [];
    const activeScenarios = savedScenarios.filter((item) => item.active === true);
    
    let datesForForecast = [...dates];
    
    //add todays date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    datesForForecast.push(today);

    // includes() on a fresh Date never matched, so only the start was added and a 7-day scenario drew a single dot.
    activeScenarios.forEach((scenario:any) => {
      const start = toDate(scenario.timeframe.start);
      const end = toDate(scenario.timeframe.end);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 7)) datesForForecast.push(new Date(d));
      datesForForecast.push(end);
    });
    // A scenario saved last week starts in the past; index 0 must stay today, where the forecast begins.
    datesForForecast = datesForForecast.filter((d:any) => d >= today);

    // Remove duplicates
    datesForForecast = [...new Map(datesForForecast.map(d => [d.getTime(), d])).values()];
    
    //convert and filter dates
    datesForForecast = datesForForecast
      .sort((a, b) => a - b);  
    const groups = chartAccountGroups();
    const allBase:any[] = [];
    chartData.value.datasets = [];
    groups.forEach((group:any, groupIndex:any) => {
      const newDatapoints = datesForForecast.map((date, dateIndex) =>{
        if(dateIndex===0){
          const todayTotal = scopedTodayTotal(group.key);
          return todayTotal;
        }else if(dates.includes(date)){      
          let calculatedValue = calculateTotalValueForDate(date, group.rows);
          return calculatedValue;
        }else{
          return NaN;
        }
      });
    
      // Remove duplicates
      datesForForecast = [...new Map(datesForForecast.map(d => [d.getTime(), d])).values()];
    
      const dynamicLabels = datesForForecast.map((date, index) => {
        return index === 0 ? t('today') : t('current_forecast');
      });
    
      // Forecast on every date, gaps included, so scenarios and their effect % have a base to stand on.
      const anchorBase = datesForForecast.map((date:any, i:any) =>
        Number.isFinite(newDatapoints[i]) ? newDatapoints[i] : calculateTotalValueForDate(date, group.rows));

      allBase.push(...newDatapoints.filter((value:any) => Number.isFinite(value)));
      chartData.value.labels = datesForForecast;

    
      chartData.value.datasets.push({
        label: t('current_forecast'),
        data: newDatapoints,
        borderColor: customColors[1],
        backgroundColor: customColors[1],
        fill: false,
        tension: 0.4,
        cubicInterpolationMode: 'monotone',
        customLabels: dynamicLabels,
        accountKey: group.key,
        endLabel: t('current_forecast'),
      });

      chartOptions.scales.x.min = getMinDate(datesForForecast[0]);
      chartOptions.scales.x.ticks.source = "auto";
      chartOptions.scales.x.ticks.autoSkip = false;

      //Scenarios
   
      activeScenarios.forEach((scenario, index) => {
        const { market, timeframe } = scenario;
        const end = new Date(timeframe.end);

        const adjustedData = datesForForecast
        .map((date, i) => {
          let total = 0;
          const dateObj = new Date(date);
          const listSnapshot = [...group.rows];
          listSnapshot.forEach(item => {
            if (!item.total_value) return; // Skip items with no value
          
            let scenarioFutureTotal = getScenarioItemFutureTotal(item, scenario, dateObj); 
            if(!isNaN(scenarioFutureTotal)){
              total += scenarioFutureTotal;
            }else{
              total = NaN;
            }
          

          });

          return total;
        });
      
        // Scenario model differs from the forecast even at 0% (puts, cash), so only its delta vs 0% is added.
        const neutralScenario = { ...scenario, market: 0 };
        const anchoredData = adjustedData.map((value:any, i:any) =>
          anchorBase[i] + value - scenarioTotalForDate(group.rows, neutralScenario, datesForForecast[i]));
        const formattedEndDate = end.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        chartData.value.datasets.push({
          label: `${t('scenario')} ${index + 1} (${market > 0 ? '+' : ''}${market}%) ${t('until')} ${formattedEndDate}`,

          data: anchoredData,
          scenario: scenario,
          fill: false,
          tension: 0.4,
          borderColor: market > 0 ? '#16a34a' : '#ef4444',
          backgroundColor: market > 0 ? '#16a34a' : '#ef4444',
          cubicInterpolationMode: 'monotone',
          accountKey: group.key,
          endLabel: `${market > 0 ? '+' : ''}${market}%`,
          baseData: anchorBase,
          todayTotal: newDatapoints[0],

        });

        // Virtual puts belong to no broker account, so only the Total panel carries the hedged line.
        if (group.key === null && activeVirtualPuts.value.length) {
          const hedgedData = anchoredData.map((value:any, i:any) => value + virtualPutsContribution(scenario, datesForForecast[i]));
          const hedgeDataset:any = {
            label: `${t('scenario')} ${index + 1} + ${t('scenarios.virtual_puts.short')}`,
            data: hedgedData,
            scenario: scenario,
            hedge: true,
            unhedgedData: anchoredData,
            fill: false,
            tension: 0.4,
            borderDash: [6, 4],
            borderColor: market > 0 ? '#16a34a' : '#ef4444',
            backgroundColor: market > 0 ? '#16a34a' : '#ef4444',
            cubicInterpolationMode: 'monotone',
            accountKey: group.key,
            endLabel: `${market > 0 ? '+' : ''}${market}% + ${t('scenarios.virtual_puts.short')}`,
            baseData: anchorBase,
            todayTotal: newDatapoints[0],
          };
          chartData.value.datasets.push(hedgeDataset);
        }
      });
    });
    datapoints.value = allBase;
    
  chartKey.value++;
  }else if (selectedType.value === 'multi') {
    const rangeStart = rangeStartStr(selectedRange.value);
    const groups = chartAccountGroups();
    const groupMaps = groups.map((group:any) => {
      const historyMap = new Map();
      const forecastMap = new Map();

      // === Step 1: Parse History Data ===
      scopedDailyTotals(group.key).filter((entry:any) => !rangeStart || entry.date >= rangeStart).forEach(item => {
        const date = item.date;
        const total = item.total || 0;
        historyMap.set(date, total);
      }); 

      const todayDataStr = todayIso();
      const todayTotal = scopedTodayTotal(group.key);
      forecastMap.set(todayDataStr, todayTotal);

      const forecastDates = dates;
      forecastDates.forEach(date => {
        const total = calculateTotalValueForDate(date, group.rows);
        forecastMap.set(date.toISOString().split('T')[0], total);
      });
      return { historyMap, forecastMap };
    });

    // === Step 3: Merge All Dates and Sort ===
    const allDates = Array.from(new Set(groupMaps.flatMap(({ historyMap, forecastMap }:any) => [
      ...Array.from(historyMap.keys()),
      ...Array.from(forecastMap.keys())
    ]))).sort((a, b) => new Date(a) - new Date(b));

    // === Step 4 + 5: Fill Datasets and Assign to Chart ===
    chartData.value.labels = allDates;
    chartData.value.datasets = groups.flatMap((group:any, groupIndex:any) => {
      const { historyMap, forecastMap } = groupMaps[groupIndex];
      const historyDataset = allDates.map(date => historyMap.get(date) ?? null);
      const forecastDataset = allDates.map(date => forecastMap.get(date) ?? null);
      return [
        {
          label: t('history'),
          data: historyDataset,
          fill: false,
          tension: 0.4,
          borderColor: customColors[0],
          backgroundColor: customColors[0],
          cubicInterpolationMode: 'monotone',
          isHistory: true,
          accountKey: group.key,
          endLabel: t('history'),
        },
        {
          label: t('forecast'),
          data: forecastDataset,
          fill: false,
          tension: 0.4,
          borderColor: customColors[1],
          backgroundColor: customColors[1],
          cubicInterpolationMode: 'monotone',
          accountKey: group.key,
          endLabel: t('forecast'),
        }
      ];
    });

    // First-of-month would open a short range with an empty gap; allDates[0] is already clamped to the range.
    chartOptions.scales.x.min = rangeStart ? allDates[0] : getMinDate(allDates[0]);
    chartOptions.scales.x.ticks.source = "auto";
    chartOptions.scales.x.ticks.autoSkip = false;
    
    
    chartKey.value++;
  }
  
  if (datapoints.value.length > 0) {
    //set +/-5% of min and max of the line
    const minValue = Math.min(...datapoints.value);
    const maxValue = Math.max(...datapoints.value);
    const rangePadding = (maxValue - minValue) * 0.05;
    chartOptions.scales.y.suggestedMin = Math.floor(minValue - rangePadding);
    chartOptions.scales.y.suggestedMax = Math.ceil(maxValue + rangePadding);

    // Ensure suggestedMax is at least slightly larger than suggestedMin
    if (chartOptions.scales.y.suggestedMax <= chartOptions.scales.y.suggestedMin) {
      chartOptions.scales.y.suggestedMax = chartOptions.scales.y.suggestedMin + 100;
    }
  }

  // several lines are only told apart by colour, so name them
  chartPanels.value = buildChartPanels();
  isLoading.value = false;
};

// Each split panel gets its own y-range; the shared x options keep the panels' dates aligned.
function buildChartPanels() {
  const groups = chartAccountGroups();
  chartOptions.layout.padding.right = endLabelPadding(chartData.value.datasets || [], (chartData.value.labels || []).length);
  if (groups.length <= 1) {
    return [{ key: null, label: '', data: chartData.value, options: chartOptions }];
  }
  return groups.map((group:any, groupIndex:any) => {
    const isBottom = groupIndex === groups.length - 1;
    const datasets = (chartData.value.datasets || []).filter((dataset:any) => dataset.accountKey === group.key);
    // Scenarios stay out of the range, matching the merged chart; Chart.js still widens to fit them.
    const values = datasets.filter((dataset:any) => !dataset.scenario)
      .flatMap((dataset:any) => dataset.data).filter((value:any) => Number.isFinite(value));
    const y:any = {
      ...chartOptions.scales.y,
      title: { ...chartOptions.scales.y.title, display: false },
      ticks: { ...chartOptions.scales.y.ticks, maxTicksLimit: 4 },
      // Fixed width: "1,500,000" vs "1,200" ticks otherwise shift each plot area and the dates stop lining up.
      afterFit: (scale:any) => { scale.width = 72; },
    };
    // One date axis under the last panel; the others keep only the grid so months still line up.
    const x:any = {
      ...chartOptions.scales.x,
      title: { ...chartOptions.scales.x.title, display: false },
      ticks: { ...chartOptions.scales.x.ticks, display: isBottom },
    };
    if (values.length) {
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);
      const rangePadding = (maxValue - minValue) * 0.05;
      y.suggestedMin = Math.floor(minValue - rangePadding);
      y.suggestedMax = Math.max(Math.ceil(maxValue + rangePadding), y.suggestedMin + 100);
    }
    return {
      key: group.key,
      label: group.label,
      data: { labels: chartData.value.labels, datasets },
      options: { ...chartOptions, scales: { ...chartOptions.scales, x, y } },
    };
  });
}


/***************/
const isScenarioSheet = ref(false)
const scenarios =  ref([]);
const scenariosKeys =  ref(1);
const excludedWkns = ref<string[]>([]);
const excludeSearch = ref('');
const isExcludeListOpen = ref(false);
const activeSuggestion = ref(-1);
const scenarioTabs = ['scenarios', 'puts', 'excluded'];
const scenarioTab = ref(readScenarioTab());
// Typing highlights the best match so Enter picks it; an empty field highlights nothing.
watch(excludeSearch, (value) => { activeSuggestion.value = value.trim() ? 0 : -1; });

function readScenarioTab(): string {
  try {
    // Open states of the collapsible panels the tabs replaced.
    localStorage.removeItem('forecastExcludeOpen');
    localStorage.removeItem('forecastVirtualPutOpen');
    const saved = localStorage.getItem('forecastScenarioTab') || '';
    // Validated: a stale or hand-edited value would leave no tab selected.
    return scenarioTabs.includes(saved) ? saved : 'scenarios';
  } catch (err) {
    // Blocked storage just means the sheet opens on the first tab.
    console.error('readScenarioTab error:', err);
    return 'scenarios';
  }
}

watch(scenarioTab, (value) => {
  try {
    localStorage.setItem('forecastScenarioTab', value as string);
  } catch (err) {
    // Only the remembered tab is lost; switching still works.
    console.error('scenarioTab watch error:', err);
  }
});

// Deduped by WKN: the same ETF held in two accounts is one exclusion choice.
const portfolioPositions = computed(() => {
  const byWkn = new Map<string, string>();
  for (const row of listData.value as any[]) {
    if (!row?.wkn || row.stock_name === "Cash" || byWkn.has(row.wkn)) continue;
    byWkn.set(row.wkn, row.stock_name || row.wkn);
  }
  return byWkn;
});

const excludeSuggestions = computed(() => {
  const query = excludeSearch.value.trim().toLowerCase();
  // Empty query lists the whole portfolio: users should not have to know a WKN to find it.
  return [...portfolioPositions.value.entries()]
    .filter(([wkn, name]) => !excludedWkns.value.includes(wkn) && (!query || wkn.toLowerCase().includes(query) || name.toLowerCase().includes(query)))
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([wkn, name]) => ({ wkn, name }));
});

async function updateExcludedWkns() {
  console.log("updateExcludedWkns", excludedWkns.value);
  await storage.setItem('local:SCENARIO_EXCLUDED_WKNS', [...excludedWkns.value]);
  recalculateDatapoints();
  if (isExportSheet.value) await loadForecastData();
}

function addExcludedWkn(position:any) {
  excludeSearch.value = '';
  if (excludedWkns.value.includes(position.wkn)) return;
  excludedWkns.value = [...excludedWkns.value, position.wkn];
  updateExcludedWkns();
  toast({ title: t('scenarios.exclude_added'), description: `${position.name} · ${position.wkn}` });
}

function moveActiveSuggestion(step:number) {
  const count = excludeSuggestions.value.length;
  if (!count) return;
  isExcludeListOpen.value = true;
  activeSuggestion.value = (activeSuggestion.value + step + count) % count;
}

function addExcludedFromInput() {
  const typed = excludeSearch.value.trim().toUpperCase();
  const active = excludeSuggestions.value[activeSuggestion.value];
  // -1 on an empty field: Enter must not exclude whichever position happens to sort first.
  if (active && isExcludeListOpen.value) return addExcludedWkn(active);
  // A WKN not in the current view is allowed (other account, bought later); anything else is a typo.
  if (/^[A-Z0-9]{6}$/.test(typed)) addExcludedWkn({ wkn: typed, name: typed });
}

function removeExcludedWkn(wkn:string) {
  excludedWkns.value = excludedWkns.value.filter((w) => w !== wkn);
  updateExcludedWkns();
  toast({ title: t('scenarios.exclude_removed'), description: `${portfolioPositions.value.get(wkn) || wkn} · ${wkn}` });
}

function clearExcludedWkns() {
  const count = excludedWkns.value.length;
  askConfirm(t('scenarios.exclude_clear_confirm', { count }), () => {
    excludedWkns.value = [];
    updateExcludedWkns();
  });
}

// Virtual puts: hedges the user does not own, tested against every active scenario.
const virtualPuts = ref<any[]>([]);
const emptyVirtualPutForm = () => ({
  underlying_name: '', underlying_price: null, quantity: null, strike: null, price: null, ratio: 1, maturity: '',
  implied_volatility: null, iv_manual: false,
});
const virtualPutForm = ref<any>(emptyVirtualPutForm());
const isVirtualPutFormOpen = ref(false);
const isVirtualPutSaving = ref(false);
const editingPutId = ref<string | null>(null);
// Filling the form for an edit must not count as the user changing the inputs.
let keepTypedIv = false;
// A typed IV only fits the inputs it was typed for; changed inputs go back to solving it from the price.
watch(() => ['price', 'strike', 'underlying_price', 'ratio', 'maturity'].map((key) => virtualPutForm.value[key]), () => {
  if (keepTypedIv) { keepTypedIv = false; return; }
  if (!virtualPutForm.value.iv_manual) return;
  virtualPutForm.value.iv_manual = false;
  virtualPutForm.value.implied_volatility = null;
});
// Expired puts are settled; counting them kept a stale payoff in the chart and the export.
const activeVirtualPuts = computed(() => virtualPuts.value.filter((put:any) => put.active && !isVirtualPutExpired(put)));
const tomorrowIso = computed(() => today(getLocalTimeZone()).add({ days: 1 }).toString());
const virtualPutPreview = computed(() => {
  const form = virtualPutForm.value;
  const premium = Number(form.price) * Number(form.quantity);
  const strike = Number(form.strike);
  const price = Number(form.underlying_price);
  const ratio = Number(form.ratio);
  const complete = premium > 0 && strike > 0 && price > 0 && ratio > 0 && !!form.maturity && !form.iv_manual;
  return {
    premium: premium > 0 ? premium : null,
    distance: strike > 0 && price > 0 ? (strike / price - 1) * 100 : null,
    iv: complete ? virtualPutSigma({ price: Number(form.price), ratio, strike, underlying_price: price, maturity: form.maturity }, startOfToday()) : null,
  };
});
// Index and stock volatilities stay within 8-150 %; outside it a ratio left at 1 for an index warrant is the usual cause.
const virtualPutIvWarning = computed(() => {
  const iv = virtualPutPreview.value.iv;
  if (iv === null) return '';
  // Unsolvable: a put is never worth more than its strike, so anything else is below intrinsic value.
  if (iv === 0) {
    const form = virtualPutForm.value;
    return t(Number(form.price) / Number(form.ratio) >= Number(form.strike) ? 'scenarios.virtual_puts.iv_high' : 'scenarios.virtual_puts.iv_low');
  }
  if (iv < 8) return t('scenarios.virtual_puts.iv_low');
  if (iv > 150) return t('scenarios.virtual_puts.iv_high');
  return '';
});
const virtualPutDistanceText = computed(() => {
  const distance = virtualPutPreview.value.distance;
  if (distance === null) return '';
  // Under 0.05 % rounds to 0.0, which reads better as at the price.
  if (Math.abs(distance) < 0.05) return t('scenarios.virtual_puts.distance_at');
  const value = formatChartNumber(Math.abs(distance), 1);
  return t(distance < 0 ? 'scenarios.virtual_puts.distance_below' : 'scenarios.virtual_puts.distance_above', { value });
});

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const isVirtualPutExpired = (put:any) => new Date(`${put.maturity}T00:00:00`) <= startOfToday();

// Index strikes are whole points; "24,000.00" only added noise.
const formatStrike = (value:any) => formatChartNumber(value, Number.isInteger(Number(value)) ? 0 : 2);

const virtualPutLabel = (put:any) =>
  `${formatChartNumber(put.quantity)} × Put ${put.underlying_name} · ${formatStrike(put.strike)} · ${formatDate(put.maturity)}`;

// Premium is subtracted: the base forecast never contained the put, so its whole value change is the effect.
function virtualPutContribution(put:any, scenario:any, date:any) {
  const row = virtualPutRow(put);
  return getScenarioItemFutureTotal(row, scenario, new Date(date)) - row.total_value;
}

function virtualPutsContribution(scenario:any, date:any) {
  let total = 0;
  for (const put of activeVirtualPuts.value) total += virtualPutContribution(put, scenario, date);
  return total;
}

async function updateVirtualPuts() {
  console.log("updateVirtualPuts", virtualPuts.value.length);
  await storage.setItem('local:SCENARIO_VIRTUAL_PUTS', deepCloneReactiveData(virtualPuts.value));
  recalculateDatapoints();
  if (isExportSheet.value) await loadForecastData();
}

// Every value is typed by hand: this is a what-if tool, so it needs no ISIN and no feed request.
async function addVirtualPut() {
  const form = virtualPutForm.value;
  const original = editingPutId.value ? virtualPuts.value.find((item:any) => item.id === editingPutId.value) : null;
  const put:any = {
    id: original?.id ?? crypto.randomUUID(),
    active: original?.active ?? true,
    underlying_name: String(form.underlying_name || '').trim(),
    underlying_price: Number(form.underlying_price),
    quantity: Number(form.quantity),
    strike: Number(form.strike),
    price: Number(form.price),
    ratio: Number(form.ratio),
    maturity: form.maturity,
    implied_volatility: Number(form.implied_volatility) || 0,
    iv_manual: !!form.iv_manual,
    // An edit is a re-buy at the new price, so the premium date moves to today as well.
    created_at: todayIso(),
  };
  console.log("addVirtualPut", put.underlying_name, !!original);

  const error = virtualPutValidate(put, startOfToday());
  if (error) {
    notifyError(t(error));
    return;
  }
  if (!put.iv_manual) {
    put.implied_volatility = virtualPutSigma(put, startOfToday());
    if (!put.implied_volatility) {
      // The volatility field appears now; the next submit uses the typed value.
      virtualPutForm.value.iv_manual = true;
      notifyError(t('scenarios.virtual_puts.iv_unsolvable'));
      return;
    }
  }

  // A second Enter before storage answers would add the same put twice.
  if (isVirtualPutSaving.value) return;
  isVirtualPutSaving.value = true;
  try {
    virtualPuts.value = original
      ? virtualPuts.value.map((item:any) => (item.id === original.id ? put : item))
      : [...virtualPuts.value, put];
    await updateVirtualPuts();
    toast({ title: t(original ? 'scenarios.virtual_puts.updated' : 'scenarios.virtual_puts.added'), description: virtualPutLabel(put) });
    closeVirtualPutForm();
  } finally {
    isVirtualPutSaving.value = false;
  }
}

// Keyboard users land where the change happened instead of at the top of the page.
async function focusById(id:string) {
  await nextTick();
  document.getElementById(id)?.focus();
}

function openVirtualPutForm() {
  isVirtualPutFormOpen.value = true;
  focusById('vp-underlying');
}

function editVirtualPut(id:any) {
  const put = virtualPuts.value.find((item:any) => item.id === id);
  if (!put) return;
  keepTypedIv = true;
  virtualPutForm.value = {
    underlying_name: put.underlying_name, underlying_price: put.underlying_price, quantity: put.quantity,
    strike: put.strike, price: put.price, ratio: put.ratio, maturity: put.maturity,
    implied_volatility: put.iv_manual ? put.implied_volatility : null, iv_manual: !!put.iv_manual,
  };
  // Cleared after the watcher ran, so the next real change still resets a typed IV.
  nextTick(() => { keepTypedIv = false; });
  editingPutId.value = id;
  isVirtualPutFormOpen.value = true;
  focusById('vp-underlying');
}

function closeVirtualPutForm() {
  virtualPutForm.value = emptyVirtualPutForm();
  editingPutId.value = null;
  isVirtualPutFormOpen.value = false;
  focusById('vp-add-button');
}

// Gap between the dashed and the plain line at the scenario end; NaN hides the row figure.
function scenarioHedgeEffect(scenario:any) {
  if (!scenario.active || !activeVirtualPuts.value.length) return NaN;
  // A finished scenario has no future point on the chart, so it gets no figure either.
  if (toDate(scenario.timeframe.end) < startOfToday()) return NaN;
  return virtualPutsContribution(scenario, toDate(scenario.timeframe.end));
}

// Computed once per change: the template reads it three times per row, each a Black-Scholes run per put.
const scenarioHedgeEffects = computed(() => scenarios.value.map((scenario:any) => scenarioHedgeEffect(scenario)));

// Sign always shown: "+15,084" vs "−2,100" is the whole message of the row figure.
const formatSigned = (value:any) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatChartNumber(Math.abs(value))}`;

function toggleVirtualPut(id:any) {
  virtualPuts.value = virtualPuts.value.map((put:any) => (put.id === id ? { ...put, active: !put.active } : put));
  updateVirtualPuts();
  const put = virtualPuts.value.find((item:any) => item.id === id);
  toast({ title: t(put.active ? 'scenarios.shown' : 'scenarios.hidden'), description: virtualPutLabel(put) });
}

function removeVirtualPut(id:any) {
  const put = virtualPuts.value.find((item:any) => item.id === id);
  const label = virtualPutLabel(put);
  askConfirm(t('scenarios.virtual_puts.delete_confirm', { put: label }), () => {
    virtualPuts.value = virtualPuts.value.filter((item:any) => item.id !== id);
    if (editingPutId.value === id) closeVirtualPutForm();
    updateVirtualPuts();
    toast({ title: t('scenarios.virtual_puts.deleted'), description: label });
  });
}

function clearVirtualPuts() {
  const count = virtualPuts.value.length;
  askConfirm(t('scenarios.virtual_puts.clear_confirm', { count }), () => {
    virtualPuts.value = [];
    if (editingPutId.value) closeVirtualPutForm();
    updateVirtualPuts();
    toast({ title: t('scenarios.virtual_puts.cleared', { count }) });
  });
}

const start = today(getLocalTimeZone());
const end = start.add({ days: 7 });

const form = ref({
  market: null as number | null,
  timeframe: {
    start: start,
    end: end,
  },
  active: true,
})

const editingIndex = ref<number | null>(null)
const isScenarioFormOpen = ref(false);

function openScenarioForm() {
  isScenarioFormOpen.value = true;
  focusById('market');
}

const marketPresets = [-10, -5, 5, 10];

// Real minus sign: a hyphen reads as a dash next to the timeframe text.
const formatMarket = (value:any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const abs = new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 }).format(Math.abs(n));
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${abs} %`;
};

const marketTone = (value:any) => {
  const n = Number(value);
  return n > 0 ? 'text-emerald-600 dark:text-emerald-400' : n < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground';
};

const maxAbsMarket = computed(() => Math.max(0, ...scenarios.value.map((s:any) => Math.abs(Number(s.market) || 0))));

// Half the track per side, so the largest scenario fills its side exactly.
const marketBarWidth = (value:any) => (maxAbsMarket.value ? (50 * Math.abs(Number(value) || 0)) / maxAbsMarket.value : 0);

// Inclusive count: 30.09 to 31.10 is 32 calendar days the scenario covers.
const scenarioDays = (scenario:any) => {
  const start = new Date(scenario.timeframe.start);
  const end = new Date(scenario.timeframe.end);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
};

const scenarioLabel = (scenario:any) =>
  `${formatMarket(scenario.market)} · ${formatDate(scenario.timeframe.start)} – ${formatDate(scenario.timeframe.end)}`;

// Persist changes

// Save scenario
async function saveScenario() {
  const original = { ...form.value }
  const newScenario = JSON.parse(JSON.stringify(original));
  // Typed input arrives as a string, presets as numbers; normalise so the duplicate check compares like with like.
  if (newScenario.market !== null && newScenario.market !== '') newScenario.market = Number(newScenario.market);
  if (newScenario.market === null || newScenario.market === '' ||
    !newScenario.timeframe.start ||
    !newScenario.timeframe.end
  ) {
    notifyError(t('scenarios.fill_all_fields'));
    return
  }

  // Format dates
  const startDate = new Date(newScenario.timeframe.start);
  const endDate = new Date(newScenario.timeframe.end);

  if (endDate < startDate) {
    notifyError(t('scenarios.alert_end_date'));
    return;
  }

  const formattedStart = formatDateToYMD(newScenario.timeframe.start);
  const formattedEnd = formatDateToYMD(newScenario.timeframe.end);
  newScenario.timeframe.start = formattedStart;
  newScenario.timeframe.end = formattedEnd;

  // Check for duplicate scenario
  const isDuplicate = scenarios.value.some((scenario, index) => {
    if (editingIndex.value !== null && index === editingIndex.value) {
      return false; // allow updating same index
    }
    return (
      // Number(): scenarios saved before the normalisation still hold the market as a string.
      Number(scenario.market) === newScenario.market &&
      scenario.timeframe.start === formattedStart &&
      scenario.timeframe.end === formattedEnd
    );
  });

  if (isDuplicate) {
    notifyError(t('scenarios.alert_duplicate'));
    return;
  }

  if (editingIndex.value !== null) {
    scenarios.value[editingIndex.value] = newScenario
    editingIndex.value = null
    toast({ title: t('scenarios.updated'), description: scenarioLabel(newScenario) });
  } else {
    scenarios.value.push(newScenario)
    toast({ title: t('scenarios.created'), description: scenarioLabel(newScenario) });
  }
  
  updateScenarios();
  resetForm();
}

function toCalendarDate(isoDate: string): CalendarDate {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new CalendarDate(year, month, day);
}

// Edit existing scenario
function editSenario(index: number) {
  const original = scenarios.value[index];
  
  const cloned = deepCloneReactiveData(original);
  cloned.timeframe.start = toCalendarDate(cloned.timeframe.start);
  cloned.timeframe.end = toCalendarDate(cloned.timeframe.end);
  
  
  form.value = cloned;
  editingIndex.value = index;
  // The form is collapsed by default; the pencil must still show it.
  isScenarioFormOpen.value = true;
}

function toggleScenarioStatus(index:number) {
  const original = scenarios.value[index];
  const cloned = JSON.parse(JSON.stringify(original));
  if(cloned){
    const newScenario = { ...cloned }
    newScenario.active = !newScenario.active;
    scenarios.value[index] = newScenario
    updateScenarios();
    toast({ title: t(newScenario.active ? 'scenarios.shown' : 'scenarios.hidden'), description: scenarioLabel(newScenario) });
  }
}

// Remove scenario
function removeSenario(index: number) {
  const label = scenarioLabel(scenarios.value[index]);
  askConfirm(t('scenarios.delete_confirm_named', { scenario: label }), () => {
    scenarios.value.splice(index, 1)
    // Keep editingIndex on the same scenario: the edited row is gone, a row above shifts it up by one.
    if (editingIndex.value === index) resetForm();
    else if (editingIndex.value !== null && editingIndex.value > index) editingIndex.value--;
    updateScenarios();
    toast({ title: t('scenarios.deleted'), description: label });
  });
}

function clearAllScenarios(){
  const count = scenarios.value.length;
  askConfirm(t('scenarios.clear_confirm', { count }), () => {
    scenarios.value = [];
    resetForm();
    updateScenarios();
    toast({ title: t('scenarios.cleared_count', { count }) });
  });
}

// Reset form
function resetForm() {
  form.value.market = null;

  editingIndex.value = null;
  isScenarioFormOpen.value = false;
  focusById('scenario-add-button');
}

async function updateScenarios(){
  const clonedData = deepCloneReactiveData(scenarios.value);
  await storage.setItem('local:scenarios',clonedData)
  recalculateDatapoints();
}

const dailyTotals = ref([]);

// Days saved before the per-account split cannot be attributed, so a filtered view drops them.
// A key narrows to that one account, for the per-account lines of the split view.
function scopedDailyTotals(key:any = null) {
  if (key) {
    return dailyTotals.value
      .filter((entry:any) => entry.accounts && key in entry.accounts)
      .map((entry:any) => ({ date: entry.date, total: entry.accounts[key] || 0 }));
  }
  if (accountViewIsAll()) return dailyTotals.value;
  return dailyTotals.value
    // A day without any selected account would plot as a false drop to 0.
    .filter((entry:any) => entry.accounts && accountViewSelected.value.some((key:any) => key in entry.accounts))
    .map((entry:any) => ({
      date: entry.date,
      total: accountViewSelected.value.reduce((sum:any, key:any) => sum + (entry.accounts[key] || 0), 0),
    }));
}

function scopedTodayTotal(key:any = null) {
  const todayStr = todayIso();
  const todayEntry = scopedDailyTotals(key).find(entry => entry.date === todayStr);
  if (todayEntry) return todayEntry.total;
  // Layout saves today's entry after this child mounts, so the first open of a day found none and plotted 0.
  const rows = key ? listData.value.filter((row:any) => accountKeyOf(row) === key) : listData.value;
  return rows.reduce((sum:any, row:any) => sum + (parseFloat(row.total_value) || 0), 0);
}

// Previous saved day, not strictly yesterday: days the user skipped opening the addon have no entry.
function historyEntryBefore(dateStr:any, key:any = null) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const targetStr = date.toISOString().split('T')[0];
  let found:any = null;
  for (const entry of scopedDailyTotals(key) as any[]) {
    if (entry.date < targetStr && (!found || entry.date > found.date)) found = entry;
  }
  return found;
}

const isExportSheet = ref(false)
const defaultExportDate = todayIso();
const exportDate = ref(defaultExportDate);


// 
const columns = ref([]);
const forecastTableData = ref([]);

const sorting = ref([])
const columnFilters = ref([])
const columnVisibility = ref({})
const rowSelection = ref({})
const expanded = ref({})

const table = useVueTable({
  get data(){
    return forecastTableData.value;
  },
  get columns() { 
    return columns.value 
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  onSortingChange: updaterOrValue => valueUpdater(updaterOrValue, sorting),
  onColumnFiltersChange: updaterOrValue => valueUpdater(updaterOrValue, columnFilters),
  onColumnVisibilityChange: updaterOrValue => valueUpdater(updaterOrValue, columnVisibility),
  onRowSelectionChange: updaterOrValue => valueUpdater(updaterOrValue, rowSelection),
  onExpandedChange: updaterOrValue => valueUpdater(updaterOrValue, expanded),
  state: {
    get sorting() { return sorting.value },
    get columnFilters() { return columnFilters.value },
    get columnVisibility() { return columnVisibility.value },
    get rowSelection() { return rowSelection.value },
    get expanded() { return expanded.value },
  },
});

const getFutureValueFromFutureTotal = (item, targetDate,scenario=null) => {
  let future_bid = 0;
  let future_underlying_price = item.underlying_price ?? 0;
  
  const valuationDate = new Date(item.valuation_date);
  const date = targetDate ? new Date(targetDate): new Date();
  const todayValue = item.total_value ?? 0;
  const futureTargetValue = item.future_total_value ?? 0;
  const ownedStocks = item.stocks_owned ?? 1;
  let futureTotalValue = todayValue;
  let expectationMultiplier = 1;
  

  if(scenario){
    futureTotalValue = getScenarioItemFutureTotal(item, scenario, targetDate);
  }else{
    if (item.type === "put") {
      const bs = new BlackScholes();
      const daysForValuation = (valuationDate - date) / MS_PER_DAY;
      const newUnderlying = item.underlying_price * expectationMultiplier;
      const bsTime = daysForValuation / 365;
      const bsSigma = (item.implied_volatility ?? 0) / 100;

      const blackScholesValue = bs.option({
        type: "put",
        rate: 0.03,
        strike: item.strike,
        underlying: newUnderlying,
        sigma: bsSigma,
        time: bsTime,
      });
      
      const scenarioValue = blackScholesValue.price;
      futureTotalValue = (scenarioValue * item.ratio) * item.stocks_owned;
      future_bid = scenarioValue;
    } else {
      const totalDays = (valuationDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
      const daysSinceToday = (date.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24);
      if (totalDays <= 0 || daysSinceToday <= 0) {
        futureTotalValue = item.total_value;
      } else {
        futureTotalValue = item.total_value + ((item.future_total_value - item.total_value) / totalDays) * daysSinceToday;
      }
    }
  }
  
  const totalDays = (valuationDate - date) / MS_PER_DAY;
  const passedDays = (targetDate - date) / MS_PER_DAY;

  if (futureTargetValue > todayValue && totalDays > 0 && passedDays >= 0) {
    const targetProfit = futureTargetValue - todayValue;
    const targetProfitUntilDate = (targetProfit / totalDays) * passedDays;
    futureTotalValue = todayValue + targetProfitUntilDate;
    future_bid = futureTotalValue / ownedStocks;
  } else {
  }
  
  const underlyingChange = ((item.future_underlying_price ?? item.underlying_price) - item.underlying_price) || 0;
  const totalUnderlyingChange = (underlyingChange / totalDays) * passedDays;
  future_underlying_price = item.underlying_price + totalUnderlyingChange;

  
  return {
    futureTotalValue,
    future_bid,
    future_underlying_price,
  };
};


const prepareForecastData = async () => {
  let mainList = accountViewFilter(await storage.getItem('local:MAIN_LIST') || []);
  // Every per-row formula below is linear in stocks_owned, so combined totals equal separate ones.
  if (accountViewCombined.value) mainList = accountCombineRows(mainList);

  // Get active scenarios
  const savedScenarios = await storage.getItem('local:scenarios') || [];
  const activeScenarios = savedScenarios.filter((item) => item.active === true);
  const scenarioHeaders = activeScenarios.map((s) => {
    const start = s.timeframe.start.replace(/-/g, "").slice(2); // YYMMDD
    const end = s.timeframe.end.replace(/-/g, "").slice(2);     // YYMMDD
    return {
      id: `${s.market}_${start}_${end}`,
      label: `${s.market}% (${formatDate(s.timeframe.start)} - ${formatDate(s.timeframe.end)})`,
    };
  });

  
  const rows = [];
  if (mainList && mainList.length > 0) {
    mainList.forEach(item => {
      const { futureTotalValue, future_bid,
        future_underlying_price } = getFutureValueFromFutureTotal(item, exportDate.value);

      // Same anchoring as the chart (forecast + scenario delta vs 0%), or table and chart disagree.
      const exportDay = toDate(exportDate.value);
      const forecastValue = calculateTotalValueForDate(exportDay, [item]);
      const scenarioValues = Object.fromEntries(
        activeScenarios.map((scenario,index) => [
            scenarioHeaders[index].id, forecastValue + getScenarioItemFutureTotal(item, scenario, exportDate.value)
              - getScenarioItemFutureTotal(item, { ...scenario, market: 0 }, exportDate.value)
        ])
      );

      const base = {
        date: exportDate.value,
        stock_name: item.stock_name ?? "",
        type: item.type ?? "",
        wkn: item.wkn ?? "",
        isin: item.isin ?? "",
        
        future_total_value: futureTotalValue ?? item.future_total_value,
        bid: future_bid ?? "",
        underlying_price: future_underlying_price ?? "",
        currency_rate: item.currency_rate ?? "",
        implied_volatility: item.implied_volatility ?? "",

         ...scenarioValues,
      };

      
      rows.push(base);
    });
  }

  // Their effect only, so scenario column totals match the dashed hedge lines; without a scenario there is nothing to show.
  if (activeScenarios.length) activeVirtualPuts.value.forEach((put:any) => {
    rows.push({
      date: exportDate.value,
      stock_name: `${t('virtual_put')} ${put.underlying_name}`,
      type: 'put',
      wkn: '',
      isin: '',
      future_total_value: '',
      bid: '',
      underlying_price: put.underlying_price,
      currency_rate: '',
      implied_volatility: put.implied_volatility,
      ...Object.fromEntries(activeScenarios.map((scenario:any, index:any) => [
        scenarioHeaders[index].id, virtualPutContribution(put, scenario, exportDate.value),
      ])),
    });
  });
  return { rows, scenarioHeaders };
};

const getColumnTotal = (columnId: string) => {
  const rows = table.getRowModel().rows
  let sum = 0
  const skipTotal = ['currency_rate','implied_volatility'];
  if(skipTotal.includes(columnId)){
    sum = 0;
  }else{
    sum = rows.reduce((acc, row) => {
      const val = row.original[columnId]
      return acc + (typeof val === "number" ? val : 0)
    }, 0);
  }

  return sum ? numberToGerman(sum) : '';
}


const forecastTableNonPriceFields = [
  'stock_name','wkn','isin'
];

// header is bg-primary, so the hover must tint with its own foreground to stay readable
const getSortingHeader = (column, label) => sortableHeader(column, t(label), 'hover:bg-primary-foreground/10 hover:text-primary-foreground');

const isTableLoading = ref(false);
const isExporting = ref(false);

const loadForecastData = async () => {
  isTableLoading.value = true;
  let prepared:any;
  try {
    prepared = await prepareForecastData();
  } catch (err) {
    // a failed build used to leave the sheet silently empty
    console.error('loadForecastData error:', err);
    notifyError(t('forecast_table_failed'));
    return;
  } finally {
    isTableLoading.value = false;
  }
  const { rows, scenarioHeaders } = prepared;
  forecastTableData.value = deepCloneReactiveData(rows);

  // Build table columns dynamically
  columns.value = [
    { accessorKey: "stock_name", header: t("stock_name") },
    { accessorKey: "type", header: ({ column }) => getSortingHeader(column, 'type') },
    { accessorKey: "wkn", header: t("wkn") },
    { accessorKey: "isin", header: t("isin") },
    { accessorKey: "currency_rate", header: ({ column }) => getSortingHeader(column, 'currency_rate') },
    { accessorKey: "implied_volatility", header: ({ column }) => getSortingHeader(column, 'implied_volatility') },
    
     ...scenarioHeaders.map((header) => ({
      accessorKey: header.id, // matches keys like "${market}%" set in prepareForecastData
      header: ({ column }) => getSortingHeader(column,`${t('scenario')} ${header.label}`),
    })),
  ];
};

const openForecastTableData = () =>{
  isExportSheet.value = true;
  loadForecastData()
}

const exportForecast = async() =>{
  isExporting.value = true;
  try {
    const { rows } = await prepareForecastData();
    downloadXlsx(rows, "Forecast-Scenario", `Forecast_Scenario_${exportDate.value}.xlsx`);
  } catch (err) {
    // the user is told, instead of a click that does nothing
    console.error('exportForecast error:', err);
    notifyError(t('forecast_export_failed'));
  } finally {
    isExporting.value = false;
  }
}


const loadForecast = async() => {
  try {
    let mainList = await storage.getItem('local:MAIN_LIST');
    if(mainList){
      listData.value = accountViewFilter(mainList);
      dailyTotals.value = await storage.getItem('local:DAILY_TOTAL') || [];
      // Before recalculateDatapoints: the first chart draw must already respect exclusions.
      excludedWkns.value = (await storage.getItem('local:SCENARIO_EXCLUDED_WKNS')) || [];
      virtualPuts.value = (await storage.getItem('local:SCENARIO_VIRTUAL_PUTS')) || [];
      accountLabels.value = Object.fromEntries((await accountList()).map((r:any) => [accountKeyOf(r), r.label]));

      recalculateDatapoints();
      scenarios.value = (await storage.getItem('local:scenarios')) || [];
    } else {
      // no MAIN_LIST yet: without this the skeleton never went away
      isLoading.value = false;
    }
  } catch (err) {
    // storage read failed; show the empty state instead of a stuck skeleton
    console.error('loadForecast error:', err);
    isLoading.value = false;
    notifyError(t('forecast_load_failed'));
  }
};

// dvh like List; 170 leaves room for the API-key banner above the chart.
const chartHeightClass = computed(() => apiKeyLoaded.value && (!apiKey.value || apiAuthFailed.value)
  ? 'h-[calc(100dvh-170px)]'
  : 'h-[calc(100dvh-100px)]');

const isChartEmpty = computed(() => !isLoading.value
  && (!listData.value.length || (selectedType.value === 'history' && !(chartData.value.labels || []).length)));

// Getrennt draws one line set per account, so the chart must be rebuilt too.
const onCombineChange = async () => {
  console.log("onCombineChange", accountViewCombined.value);
  recalculateDatapoints();
  if (isExportSheet.value) await loadForecastData();
};

// The dialog can add or remove an account while this page stays mounted.
watch(accountsVersion, loadForecast);

onMounted(loadForecast);
</script>

<style scoped>
</style>
