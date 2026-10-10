<template>
  <div>
    <div class="mx-auto grid flex-1 auto-rows-max gap-4">
      <div class="w-full overflow-auto shadow-lg rounded-lg">
      
        <Card class="border-0 shadow-none rounded-lg block w-full p-6 pt-3 bg-card text-card-foreground transition-all">
          <!-- Card p-6 + CardHeader p-6 + toolbar p-2 stacked ~60px above the filter row. -->
          <CardHeader class="pt-0 pb-0">
            <div class="flex flex-wrap items-center justify-start gap-5 mb-2">
              <!-- v-show here, not on the strip: a hidden strip still left this empty flex item and its gap-5 -->
              <div v-show="Object.keys(rowSelection).length" class="w-full">
                
                <!-- one row, labels sr-only: the stacked label/field layout ate ~180px above the table -->
                <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-muted/60 px-3 py-2">
                  <span class="inline-flex h-7 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">
                    {{ Object.keys(rowSelection).length }} {{ $t('selected') }}
                  </span>

                  <div class="hidden h-6 w-px bg-border sm:block" aria-hidden="true"></div>

                  <!-- one row can only join an existing group, so the name field was dead weight -->
                  <template v-if="Object.keys(rowSelection).length > 1">
                    <Label for="new_group_name" class="sr-only">{{ $t('new_group_name') }}</Label>
                    <Input id="new_group_name" v-model="groupName"
                      type="text" class="h-8 w-56 bg-background"
                      :placeholder="$t('new_group_name')" />
                    <span class="text-xs uppercase tracking-wide text-muted-foreground">
                      {{ $t('or') }}
                    </span>
                  </template>

                  <Label for="existing_group" class="sr-only">{{ $t('select_existing_group') }}</Label>
                  <Select v-model="selectedGroup">
                    <SelectTrigger id="existing_group" class="h-8 w-56 bg-background">
                      <SelectValue :placeholder="$t('select_existing_group')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem v-for="group in allGroups" :key="group.id"
                          :value="group.id">
                          {{ group.group_name }}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  <Button size="sm" class="h-8" @click="combineRows()"
                    :disabled="Object.keys(rowSelection).length === 1 && !selectedGroup">
                    {{ $t('combine') }}
                  </Button>

                  <template v-if="Object.keys(rowSelection).length === 1 && !isCashRow(currentRow)">
                    <Button size="sm" variant="outline" class="h-8 sm:ml-auto" @click="openModal(currentRow, 'stock')">
                      {{ $t('set_alert') }}
                    </Button>
                  </template>

                  <Button size="sm" variant="ghost" class="h-8" :class="{ 'sm:ml-auto': Object.keys(rowSelection).length > 1 || isCashRow(currentRow) }"
                    @click="rowSelection = {}">
                    <X class="mr-1 h-4 w-4" />
                    {{ $t('clear_selection') }}
                  </Button>
                </div>

              </div>
              <!-- Right Section: Filters and Actions -->
              <div class="py-0 flex flex-wrap gap-2 items-center justify-between w-full">

                <!-- Filters left, actions right -->
                <div class="flex flex-wrap gap-2 items-center">
                <div class="relative w-full sm:w-[260px]">
                  <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <!-- v-model="globalFilter" -->
                  <Input  type="search"
                    v-model="globalFilterInput"
                    :placeholder="t('search')" :aria-label="t('search')" class="pl-8 w-full" />
                </div>

                <AccountFilter compact trigger-class="h-9 w-full sm:w-auto"
                  @change="onAccountFilterChange()" />
                <CombineSwitch :rows="accountViewFilter(mainListData)" @change="onCombineChange()" />

                <!-- Cached rows are already on screen, so say they are about to change. -->
                <span v-if="isRefreshing && !isLoading"
                  class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <RefreshCcw class="h-3.5 w-3.5 animate-spin" />
                  {{ $t('fetching_latest_data') }}
                </span>
                </div>

                <div class="flex flex-wrap gap-2 items-center">

                
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                      <Button variant="outline" class="flex items-center">
                        <ListFilter class="h-3.5 w-3.5" />
                        <span class="sm:whitespace-nowrap ml-2">
                          {{ $t('view') }}
                        </span>
                      </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                      <div class="max-h-[60vh] overflow-y-auto">
                        <DropdownMenuCheckboxItem v-for="(column, colId) in allColumns" 
                          :key="colId"
                          class="capitalize"
                          :model-value="columnOrder.includes(colId)"
                          :disabled="colId === 'select'"
                          @update:model-value="(value) => toggleColumn(colId, value)">
                          {{ t(colId) }}
                        </DropdownMenuCheckboxItem>
                      </div>
                  </DropdownMenuContent>
                </DropdownMenu>


                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="outline">
                      <Download class="h-3.5 w-3.5" />
                      <span class="sm:whitespace-nowrap ml-2">
                        {{ $t('export') }}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent class="w-56">
                    <DropdownMenuLabel>{{ $t('export') }}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem @click="exportCSV()">
                        <File class="mr-2 h-4 w-4" />
                        <span>{{ $t('csv') }}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="exportXlsx()">
                        <FileSpreadsheet class="mr-2 h-4 w-4" />
                        <span>{{ $t('xlsx') }}</span>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button @click="reloadPriceData(true)" variant="outline" 
                  class="flex items-center" :disabled="isPriceLoading">
                  <!-- Not disabled while refreshing: a click must reach reloadPriceData to get the "already running" toast. -->
                  <RefreshCcw class="h-3.5 w-3.5"
                    :class="{ 'animate-spin opacity-50': isPriceLoading || isRefreshing }"  />
                  <span class="sm:whitespace-nowrap ml-2">
                    {{ isPriceLoading ? $t('loading') : $t('reload') }}
                  </span>
                </Button>

                <Button @click="isOpenAlertList=true" variant="outline" 
                  class="flex items-center">
                  <AlarmClockPlus class="h-3.5 w-3.5" />
                  <span class="sm:whitespace-nowrap ml-2">
                    {{ $t('alerts') }}
                  </span>
                </Button>
                </div>

              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div>
              
              
                <!-- dvh max-height; 210px once the toolbar wraps below 1360px -->
                <div ref="dt" class="rounded-md border w-full max-h-[calc(100dvh-150px)] max-[1360px]:max-h-[calc(100dvh-210px)] overflow-auto">
                 
                  <Table id="table_list">
                      <TableHeader class="bg-muted sticky top-0 z-10">
                       
                          
                          <VueDraggableNext 
                          v-model="columnOrder" 
                          tag="tr" 
                          handle=".drag-handle"
                          @end="onDragEnd"
                          :move="onMoveColumn"
                        >
                            <TableHead v-for="header in table.getHeaderGroups()[0]?.headers"
                              :key="header.id"
                              :class="[
                                header.column.getIsSorted() ? 'bg-accent text-accent-foreground' : '',
                                !nonDraggableColumns.includes(header.column.id) ? 'cursor-move drag-handle' : '',
                                header.column.id === 'select' ? 'sticky_column z-20 bg-muted' : ''
                              ]" draggable="true">
                              <div :class="{'w-80': header.id === 'stock_name',}">
                                <FlexRender
                                  v-if="!header.isPlaceholder"
                                  :render="header.column.columnDef.header"
                                  :props="header.getContext()"
                                />
                              </div>
                            </TableHead>
                        </VueDraggableNext>

                        </TableHeader>


                      <TableBody>
                        <template v-if="displayRows.length">
                          <template v-for="row in displayRows" :key="row.id">
                           
                            <TableRow v-if="row.depth==0" 
                            :class="{ 'group-row' : row.original?.isGroup,
                              'bg-accent!': row.getIsSelected() }">
                              
                              <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id"
                                :class="cell.column.id === 'select' ? 'sticky_column z-1 bg-muted' : ''">
                                
                                <span :data-wkn="row.original.wkn" :data-position="accountPositionKey(row.original)" :data-field="cell.column.id"
                                class="price_cell">
                                
                                <!-- group line -->
                                <template v-if="row.original.isGroup">
                                    <template v-if="cell.column.id === 'select'">
                                      <Button @click="askConfirm($t('confirm_remove_group'), () => removeGroup(row.original.id))"
                                        class="mr-2 h-8 w-8" size="icon" variant="ghost"
                                        :title="$t('delete_group')" :aria-label="$t('delete_group')">
                                        <Trash class="h-4 w-4 text-red-600 dark:text-red-400" />
                                      </Button>
                                    </template>

                                    <template v-else-if="cell.column.id === 'stock_name'">
                                      <div class="flex items-center">
                                        <Button @click="row.toggleExpanded()" class="mr-2 h-8 w-8" size="icon" variant="ghost"
                                          :aria-expanded="row.getIsExpanded()" :aria-label="$t(row.getIsExpanded() ? 'collapse_group' : 'expand_group')">
                                          <ChevronRight class="h-4 w-4 transition-transform" :class="{ 'rotate-90': row.getIsExpanded() }" />
                                        </Button>
                                        <template v-if="editGroupId===row.original.id">
                                          <div class="flex w-full max-w-sm items-center gap-1.5">
                                            <Input v-model="editGroupName" :placeholder="$t('new_group_name')" :aria-label="$t('new_group_name')" class="h-8 bg-background text-foreground font-normal" />
                                            <Button @click="updateGroup(editGroupId)" size="icon" class="h-8 w-8 shrink-0" :aria-label="$t('save')" :title="$t('save')">
                                              <Save class="h-4 w-4" />
                                            </Button>
                                            <Button @click="editGroupId=0" size="icon" variant="ghost" class="h-8 w-8 shrink-0" :aria-label="$t('cancel')" :title="$t('cancel')">
                                              <X class="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </template>
                                        <template v-else>
                                          <div class="flex items-center ml-auto">
                                            {{  row.original.group_name }}
                                            <Button @click="editGroup(row.original.id)" size="icon" variant="ghost" class="ml-1 h-8 w-8"
                                              :aria-label="$t('edit_group')" :title="$t('edit_group')">
                                              <Pencil class="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </template>
                                      </div>
                                    </template>


                                    <template v-else-if="cell.column.id === 'total_entry_value'">
                                      {{  formatGermanNumber(getScopedGroupTotals(row.original.id)['total_entry_value']) }}
                                    </template>
                                   
                                   <template v-else-if="cell.column.id === 'profit_loss_price'">
                                       {{  formatGermanNumber(getScopedGroupTotals(row.original.id)['profit_loss_price']) }}
                                    </template>
                                   
                                    <template v-else-if="cell.column.id === 'profit_loss_percentage'">
                                      {{  formatGermanNumber(getScopedGroupTotals(row.original.id)['profit_loss_percentage']) }}
                                   </template>
                                    
                                   <template v-else-if="cell.column.id === 'total_value'">
                                      {{  formatGermanNumber(getScopedGroupTotals(row.original.id)['total_value']) }}
                                   </template>

                                   <template v-else-if="cell.column.id === 'future_total_value'">
                                      {{  formatGermanNumber(getScopedGroupTotals(row.original.id)['future_total_value']) }}
                                   </template>

                                  <template v-else-if="cell.column.id === 'position_percentage'">
                                    {{  formatGermanNumber(getScopedGroupTotals(row.original.id)['position_percentage'])+'%' }}
                                  </template>

                                 <template v-else-if="cell.column.id === 'position_target_percentage'">
                                   {{  formatGermanNumber(getScopedGroupTotals(row.original.id)['position_target_percentage'])+'%' }}
                                 </template>
                                 <template v-else-if="cell.column.id === 'profit_loss_target_per_day'">
                                   {{  formatGermanNumber(getScopedGroupTotals(row.original.id)['profit_loss_target_per_day']) }}
                                 </template>
                                 <template v-else-if="cell.column.id === 'actions'">
                                    <Button size="icon" variant="ghost" class="h-8 w-8" @click="openModal(row.original,'group')"
                                      :aria-label="$t('set_alert')" :title="$t('set_alert')">
                                      <AlarmClockPlus class="h-4 w-4" />
                                    </Button>
                                 </template>
                                   
                                 <template v-else>
                                 </template>
                                    
                                </template>

                                <!-- Normal line -->
                                <template v-else>

                                  <!-- Cash is a balance, not a position: only the two value columns mean anything. -->
                                  <template v-if="isCashRow(row.original)">
                                    <!-- Selectable so cash lines can be grouped, with each other or with positions. -->
                                    <FlexRender v-if="cell.column.id === 'select'" :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                                    <template v-else-if="cell.column.id === 'stock_name'">
                                      {{ cashLabel(row.original) }}
                                    </template>
                                    <template v-else-if="cell.column.id === 'total_entry_value' || cell.column.id === 'total_value'">
                                      {{ numberToGerman(cashAmount(row.original)) }}
                                    </template>
                                    <template v-else>&nbsp;</template>
                                  </template>

                                  <!-- Combined rows are display-only; per-account inputs and alerts live on the split view. -->
                                  <template v-else-if="row.original.isCombined && cell.column.id === 'stock_name'">
                                    {{ row.original.stock_name }}
                                    <span class="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-100 whitespace-nowrap">
                                      {{ $t('accounts_selected', { count: row.original.combined_count }) }}
                                    </span>
                                  </template>
                                  <template v-else-if="row.original.isCombined && ['select', 'notes', 'position_target_percentage', 'actions'].includes(cell.column.id)">&nbsp;</template>

                                  <template v-else-if="cell.column.id === 'isin'">
                                    <a v-if="isinLink" :href="formattedISINLink(row.original.isin)" target="_blank"
                                        class="rounded-sm text-blue-600 dark:text-blue-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                        <StockInfoCard :wkn="row.original.isin" 
                                          :info="row.original" 
                                          :columns="columnOrder" />
                                    </a>
                                    <template v-else>
                                      <StockInfoCard :wkn="row.original.isin" 
                                        :info="row.original" 
                                        :columns="columnOrder" />
                                    </template>
                                  </template>

                                  <template v-else-if="cell.column.id === 'wkn'">
                                    <a v-if="wknLink" :href="formattedWKNLink(row.original.wkn)" target="_blank"
                                        class="rounded-sm text-blue-600 dark:text-blue-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                      <StockInfoCard :wkn="row.original.wkn" 
                                        :info="row.original" 
                                        :columns="columnOrder" />
                                    </a>
                                    <template v-else>
                                      <StockInfoCard :wkn="row.original.wkn" 
                                        :info="row.original" 
                                        :columns="columnOrder" />
                                    </template>
                                  </template>

                                  <template v-else-if="cell.column.id === 'type'">
                                    {{ row.original.type ? $t(row.original.type) : '' }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'stocks_owned'">
                                    {{  numberToGerman(row.original.stocks_owned,true)  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'buy_price'">
                                    {{  numberToGerman(row.original.buy_price)  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'purchase_date'">
                                    {{  formatDate(row.original.purchase_date)  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'days_since_purchase'">
                                    {{  numberToGerman(row.original.days_since_purchase,true)  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'yield_pa_since_purchase'">
                                    <span :title="getTitleForHL('yield_pa_since_purchase', row.original.yield_pa_since_purchase)" :class="[getClassForHL('yield_pa_since_purchase', row.original.yield_pa_since_purchase),
                                      getClassForAlert('yield_pa_since_purchase', row.original)]">
                                      {{  row.original.yield_pa_since_purchase != null ? numberToGerman(row.original.yield_pa_since_purchase,false,2)+'%' : '' }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'total_entry_value'">
                                    {{  numberToGerman(row.original.total_entry_value)  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'profit_loss_price'">
                                    <span :title="getTitleForHL('profit_loss_price', row.original.profit_loss_price)" :class="[getClassForHL('profit_loss_price', row.original.profit_loss_price),
                                      getClassForAlert('profit_loss_price', row.original)]">
                                      {{  numberToGerman(row.original.profit_loss_price)  }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'profit_loss_percentage'">
                                    <span :title="getTitleForHL('profit_loss_percentage', row.original.profit_loss_percentage)" :class="[getClassForHL('profit_loss_percentage', row.original.profit_loss_percentage),
                                      getClassForAlert('profit_loss_percentage', row.original)]">
                                      {{  numberToGerman(row.original.profit_loss_percentage)  }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'bid'">
                                    <span :class="getClassForAlert('bid',row.original)"
                                      :data-symbol="row.original.wkn" data-field="bid" class="price_cell">
                                      {{  row.original.bid ? numberToGerman(row.original.bid) : ''  }}
                                      </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'ask'">
                                    <span :data-symbol="row.original.wkn" data-field="ask" class="price_cell">
                                    {{  row.original.ask ? numberToGerman(row.original.ask) : ''  }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'cap_strike'">
                                    {{  row.original.cap_strike ? (numberToGerman(row.original.cap_strike) || '') +' '+ (row.original.currency || '') : ''  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'cap_disco_os'">
                                    {{  row.original.cap_disco_os ? (numberToGerman(row.original.cap_disco_os) || '') +' '+ (row.original.currency || '') : ''  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'barrier_knockout'">
                                    {{  row.original.barrier_knockout ? (numberToGerman(row.original.barrier_knockout) || '') : ''  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'bonus_level'">
                                    {{  row.original.bonus_level ? (numberToGerman(row.original.bonus_level) || '') +' '+ (row.original.currency || '') : ''  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'profit_loss_target'">
                                    {{  row.original.profit_loss_target ? numberToGerman(row.original.profit_loss_target) :  numberToGerman(0) }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'profit_loss_target_pa'">
                                    {{  row.original.profit_loss_target_pa ? numberToGerman(row.original.profit_loss_target_pa)+'%' : ''  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'profit_loss_target_per_day'">
                                    {{  row.original.profit_loss_target_per_day ? numberToGerman(row.original.profit_loss_target_per_day) : ''  }}
                                  </template>

                                  <!-- ((cap - underlyingPrice) / underlyingPrice) * 100 -->
                                  <template v-else-if="cell.column.id === 'distance_to_the_cap'">
                                      {{ row.original.distance_to_the_cap ? numberToGerman(row.original.distance_to_the_cap) : '' }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'total_value'">
                                    <span :title="getTitleForHL('total_value', row.original.total_value)" :class="getClassForHL('total_value', row.original.total_value)">
                                    {{  row.original.total_value ? numberToGerman(row.original.total_value) : '' }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'future_total_value'">
                                    <span :title="getTitleForHL('future_total_value', row.original.future_total_value)" :class="getClassForHL('future_total_value', row.original.future_total_value)">
                                      {{ row.original.future_total_value ? numberToGerman(row.original.future_total_value) : ''  }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'position_percentage'">
                                    {{ numberToGerman(scopedPositionPercentage(row.original), false, 2)+'%'  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'position_target_percentage'">
                                    <Input v-model="row.original.position_target_percentage"
                                            @input="debounceUpdatePositionTarget(row.original, row.original.position_target_percentage)"
                                            type="number" min="0" :disabled="isSyncing"
                                            class="h-7 min-w-[80px]"/>
                                  </template>

                                  <template v-else-if="cell.column.id === 'notes'">
                                    <Input v-model="row.original.notes"
                                        @input="debounceUpdateNotes(row.original, row.original.notes)"
                                        :disabled="isSyncing" class="h-7 min-w-[80px]"/>
                                  </template>

                                  <template v-else-if="cell.column.id === 'currency_rate'">
                                    {{ numberToGerman(row.original.currency_rate,false,4)  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'underlying_isin'">
                                    <template v-if="row.original.underlying_isin">
                                      <a v-if="isinLink" :href="formattedISINLink(row.original.underlying_isin)" target="_blank"
                                          class="rounded-sm text-blue-600 dark:text-blue-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                          <StockInfoCard :wkn="row.original.underlying_isin" 
                                            :info="row.original" :columns="columnOrder" />
                                      </a>
                                      <template v-else>
                                        <StockInfoCard :wkn="row.original.underlying_isin" 
                                          :info="row.original" :columns="columnOrder" />
                                      </template>
                                    </template>
                                  </template>

                                  <template v-else-if="cell.column.id === 'underlying_price'">
                                    <span :data-symbol="row.original.wkn" data-field="underlying_price" class="price_cell">
                                      {{  row.original.underlying_price ? numberToGerman(getComparableUnderlyingPrice(row.original),false,4) : '' }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'underlying_timestamp'">
                                    {{  formatTimestamp(row.original.underlying_timestamp)}}
                                  </template>

                                  <template v-else-if="cell.column.id === 'ratio'">
                                    {{  row.original.ratio ? numberToGerman(row.original.ratio,false,4) : ''  }}
                                  </template>

                                  <template v-else-if="cell.column.id === 'timestamp'">
                                    {{  formatTimestamp(row.original.timestamp)}}
                                  </template>

                                  <template v-else-if="cell.column.id === 'valuation_date'">
                                    {{  formatDate(row.original.valuation_date)}}
                                  </template>

                                  <!-- (cap / bid x ratio -1 ) *100 -->
                                  <template v-else-if="cell.column.id === 'sideways_return'">
                                    <span :title="getTitleForHL('sideways_return', row.original.sideways_return)" :class="[getClassForHL('sideways_return', row.original.sideways_return),
                                      getClassForAlert('sideways_return', row.original)]">
                                      {{ numberToGerman(row.original.sideways_return)  }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'sideways_return_pa'">
                                    <span :title="getTitleForHL('sideways_return_pa', row.original.sideways_return_pa)" :class="[getClassForHL('sideways_return_pa', row.original.sideways_return_pa),
                                      getClassForAlert('sideways_return_pa', row.original)]">
                                      {{  row.original.sideways_return_pa ? numberToGerman(row.original.sideways_return_pa)+'%' : '' }}
                                    </span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'peer_members'">
                                    <PeerProductsCard v-if="row.original.peer_members" 
                                      :wkn="row.original.wkn" :peer_members="row.original.peer_members" />
                                  </template>

                                  <template v-else-if="cell.column.id === 'implied_volatility'">
                                    <span>{{ row.original.implied_volatility ? numberToGerman(row.original.implied_volatility)+'%' : '' }}</span>
                                  </template>

                                  <template v-else-if="cell.column.id === 'actions'">
                                    <Button size="icon" variant="ghost" class="h-8 w-8" @click="openModal(row.original,'stock')"
                                      :aria-label="$t('set_alert')" :title="$t('set_alert')">
                                      <AlarmClockPlus class="h-4 w-4" />
                                    </Button>
                                  </template>
                                  
                                  <div v-else>
                                    <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                                  </div>

                                </template>

                                </span>
                              </TableCell>
                            </TableRow>
                            
                            <!-- v-for="(item, index) in row.original.items" -->
                            <!-- group expanded lines -->
                            <TableRow v-if="row.original?.isGroup && row.getIsExpanded?.() && row.original?.items" 
                                v-for="(item, index) in visibleSubRows(row)"
                                :key="`${row.id}-sub-${index}`"
                                class="group-child"
                                :class="{ 'group-child-last': index === visibleSubRows(row).length - 1 }"
                              >
                              <TableCell v-for="column in columns" :key="column.id"
                                :class="column.id === 'select' ? 'sticky_column z-1 bg-muted' : ''">
                                <template v-if="column.id === 'select'">
                                  <Button @click="removeItemFromGroup(row.original.id,item.original.id)" class="mr-2 h-8 w-8"
                                    size="icon" variant="ghost"
                                    :title="$t('delete_from_group')" :aria-label="$t('delete_from_group')">
                                    <X class="h-4 w-4 text-red-600 dark:text-red-400" />
                                  </Button>
                                </template>

                                <!-- Same as the top-level cash line: only the two value columns mean anything. -->
                                <template v-else-if="isCashRow(item.original)">
                                  <template v-if="column.id === 'stock_name'">{{ cashLabel(item.original) }}</template>
                                  <template v-else-if="column.id === 'total_entry_value' || column.id === 'total_value'">
                                    {{ numberToGerman(cashAmount(item.original)) }}
                                  </template>
                                  <template v-else>&nbsp;</template>
                                </template>

                                <!-- v-else-if: a plain v-if restarted the chain, so the select cell also fell through to FlexRender -->
                                <template v-else-if="column.id === 'isin'">
                                  <a v-if="isinLink" :href="formattedISINLink(item.original.isin)" target="_blank" class="rounded-sm text-blue-600 dark:text-blue-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                    <StockInfoCard :wkn="item.original.isin" 
                                      :info="item.original"  :columns="columnOrder" />
                                  </a>
                                  <template v-else>
                                    <StockInfoCard :wkn="item.original.isin"
                                      :info="item.original" :columns="columnOrder" />
                                  </template>
                                </template>

                                <template v-else-if="column.id === 'wkn'">
                                  <a v-if="wknLink" :href="formattedWKNLink(item.original.wkn)" target="_blank" class="rounded-sm text-blue-600 dark:text-blue-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                    <StockInfoCard :wkn="item.original.wkn"
                                      :info="item.original" :columns="columnOrder" />
                                  </a>
                                  <template v-else>
                                    <StockInfoCard :wkn="item.original.wkn" 
                                      :info="item.original" :columns="columnOrder" />
                                  </template>
                                </template>

                                <template v-else-if="column.id === 'underlying_isin'">
                                  <template v-if="item.original.underlying_isin">
                                    <a v-if="isinLink" :href="formattedISINLink(item.original.underlying_isin)" target="_blank" class="rounded-sm text-blue-600 dark:text-blue-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                                      <StockInfoCard :wkn="item.original.underlying_isin" 
                                        :info="item.original" :columns="columnOrder" />
                                    </a>
                                    <template v-else>
                                      <StockInfoCard :wkn="item.original.underlying_isin" 
                                        :info="item.original" :columns="columnOrder" />
                                    </template>
                                  </template>
                                </template>

                                <template v-else-if="column.id === 'total_value'">
                                  {{  item.original.total_value ? numberToGerman(item.original.total_value) : ''  }}
                                </template>

                                <template v-else-if="column.id === 'future_total_value'">
                                  {{  item.original.future_total_value ? numberToGerman(item.original.future_total_value) : ''  }}
                                </template>

                                <template v-else-if="column.id === 'type'">
                                  {{ item.original.type ? $t(item.original.type) : '' }}
                                </template>

                                <template v-else-if="column.id === 'stocks_owned'">
                                  {{  numberToGerman(item.original.stocks_owned,true)  }}
                                </template>

                                <template v-else-if="column.id === 'buy_price'">
                                  {{  numberToGerman(item.original.buy_price)  }}
                                </template>

                                <template v-else-if="column.id === 'purchase_date'">
                                  {{  formatDate(item.original.purchase_date)  }}
                                </template>

                                <template v-else-if="column.id === 'days_since_purchase'">
                                  {{  numberToGerman(item.original.days_since_purchase,true)  }}
                                </template>

                                <template v-else-if="column.id === 'yield_pa_since_purchase'">
                                  {{  item.original.yield_pa_since_purchase != null ? numberToGerman(item.original.yield_pa_since_purchase,false,2)+'%' : '' }}
                                </template>

                                <template v-else-if="column.id === 'total_entry_value'">
                                  {{  numberToGerman(item.original.total_entry_value)  }}
                                </template>

                                <template v-else-if="column.id === 'profit_loss_price'">
                                    {{  numberToGerman(item.original.profit_loss_price)  }}
                                </template>

                                <template v-else-if="column.id === 'profit_loss_percentage'">
                                  {{  numberToGerman(item.original.profit_loss_percentage)  }}
                                </template>

                                <template v-else-if="column.id === 'bid'">
                                  {{  item.original.bid ? numberToGerman(item.original.bid) : ''  }}
                                </template>

                                <template v-else-if="column.id === 'ask'">
                                  {{  item.original.ask ? numberToGerman(item.original.ask) : ''  }}
                                </template>

                                <template v-else-if="column.id === 'cap_strike'">
                                  {{  item.original.cap_strike ? (numberToGerman(item.original.cap_strike) || '') +' '+ (item.original.currency || '') : ''  }}
                                </template>

                                <template v-else-if="column.id === 'cap_disco_os'">
                                  {{  item.original.cap_disco_os ? (numberToGerman(item.original.cap_disco_os) || '') +' '+ (item.original.currency || '') : ''  }}
                                </template>
                                
                                <template v-else-if="column.id === 'profit_loss_target'">
                                  {{  item.original.profit_loss_target ? numberToGerman(item.original.profit_loss_target) : ''  }}
                                </template>

                                <template v-else-if="column.id === 'profit_loss_target_pa'">
                                  {{  item.original.profit_loss_target_pa ? numberToGerman(item.original.profit_loss_target_pa)+'%' : ''  }}
                                </template>

                                <template v-else-if="column.id === 'profit_loss_target_per_day'">
                                  {{  item.original.profit_loss_target_per_day ? numberToGerman(item.original.profit_loss_target_per_day) : ''  }}
                                </template>
                                
                                <template v-else-if="column.id === 'distance_to_the_cap'">
                                    {{ item.original.distance_to_the_cap ? numberToGerman(item.original.distance_to_the_cap) : '' }}
                                </template>

                                <template v-else-if="column.id === 'position_percentage'">
                                  {{ numberToGerman(scopedPositionPercentage(item.original), false, 2)+'%'  }}
                                </template>

                                <template v-else-if="column.id === 'position_target_percentage'">
                                  <Input v-model="item.original.position_target_percentage"
                                      @input="debounceUpdatePositionTarget(item.original,item.original.position_target_percentage,row.original.id)"
                                      type="number" min="0" :disabled="isSyncing"
                                      class="h-7 min-w-[80px]"/>
                                </template>

                                <template v-else-if="column.id === 'notes'">
                                  <Input v-model="item.original.notes" @input="debounceUpdateNotes(item.original,item.original.notes,row.original.id)"
                                      :disabled="isSyncing" class="h-7 min-w-[80px]"/>
                                </template>

                                <template v-else-if="column.id === 'currency_rate'">
                                  {{ numberToGerman(item.original.currency_rate,false,4)  }}
                                </template>

                                <template v-else-if="column.id === 'underlying_price'">
                                  {{  item.original.underlying_price ? numberToGerman(getComparableUnderlyingPrice(item.original),false,4) : '' }}
                                </template>

                                <template v-else-if="column.id === 'underlying_timestamp'">
                                  {{  formatTimestamp(item.original.underlying_timestamp)}}
                                </template>

                                <template v-else-if="column.id === 'ratio'">
                                  {{  item.original.ratio ? numberToGerman(item.original.ratio,false,4) : ''  }}
                                </template>

                                <template v-else-if="column.id === 'sideways_return'">
                                    {{ numberToGerman(item.original.sideways_return) }}
                                 </template>

                                <template v-else-if="column.id === 'sideways_return_pa'">
                                    {{ numberToGerman(item.original.sideways_return_pa)+'%' }}
                                </template>

                                <template v-else-if="column.id === 'timestamp'">
                                  {{  formatTimestamp(item.original.timestamp)}}
                                </template>

                                <template v-else-if="column.id === 'barrier_knockout'">
                                    {{ numberToGerman(item.original.barrier_knockout) }}
                                </template>
                                
                                <template v-else-if="column.id === 'bonus_level'">
                                    {{ numberToGerman(item.original.bonus_level) +' '+ (item.original.currency || '') }}
                                </template>

                                <template v-else-if="column.id === 'actions'">
                                  <Button size="icon" variant="ghost" class="h-8 w-8" @click="openModal(item.original,'stock')"
                                    :aria-label="$t('set_alert')" :title="$t('set_alert')">
                                    <AlarmClockPlus class="h-4 w-4" />
                                  </Button>
                                </template>

                                <template v-else>
                                  <FlexRender :render="column.cell"
                                        :props="{
                                          row: { 
                                            original: item,
                                            getValue: (columnId) => item.original[columnId],
                                            getIsSelected: () => false
                                          },
                                          column,
                                          getValue: () => item.original[column.id] // ✅ this is what some cell() functions expect
                                        }" />
                                </template>
                              </TableCell>
                            </TableRow>                          
                          </template>
                        </template>

                        <template v-if="isLoading">
                          <TableRow v-for="n of loadingRows" :key="n">
                          <TableCell v-for="col of columnOrder" :key="col" class="h-7">
                              <Skeleton class="h-7 w-full min-w-[50px] rounded-md" /> 
                            </TableCell>
                          </TableRow>
                        </template>
                        

                        <TableRow v-if="!isLoading && table.getRowModel().rows?.length==0" class="hover:bg-transparent">
                          <TableCell :colspan="columnOrder.length">
                            <Empty v-if="globalFilterInput" compact message="no_results" description="try_a_different_search" />
                            <Empty v-else compact />
                          </TableCell>
                        </TableRow>


                      </TableBody>

                      <!-- Footer -->
                      <TableFooter v-if="!isLoading && table.getRowModel().rows?.length>0 && listTotal && Object.keys(listTotal).length" class="sticky bottom-0 z-5">
                        <tr class="total-row sticky bottom-0">
                          <template v-for="header in table.getHeaderGroups()[0].headers" 
                            :key="'foot'+header.id">
                            
                            <TableCell :class="header.id === 'select' ? 'sticky_column z-1 bg-muted' : ''">
                              <!-- one v-if chain: separate v-ifs let the trailing v-else add a stray &nbsp; to every cell -->
                              <template v-if="header.id === 'total_entry_value'">
                                {{  numberToGerman(listTotal['total_entry_value']) }}
                             </template>
                             
                             <template v-else-if="header.id === 'profit_loss_price'">
                                 {{  numberToGerman(listTotal['profit_loss_price']) }}
                              </template>
                             
                              <template v-else-if="header.id === 'profit_loss_percentage'">
                                {{  numberToGerman(listTotal['profit_loss_percentage']) }}
                             </template>
                              
                             <template v-else-if="header.id === 'total_value'">
                                {{  numberToGerman(listTotal['total_value']) }}
                             </template>

                             <template v-else-if="header.id === 'future_total_value'">
                                {{  numberToGerman(listTotal['future_total_value']) }}
                             </template>
                             
                             <template v-else-if="header.id === 'profit_loss_target'">
                                {{  numberToGerman(listTotal['profit_loss_target']) }}
                             </template>

                             <template v-else-if="header.id === 'profit_loss_target_per_day'">
                                {{  numberToGerman(listTotal['profit_loss_target_per_day']) }}
                             </template>
                             

                             <template v-else-if="header.id === 'actions'">
                              <Button size="sm" variant="outline" @click="openModal(listTotal,'total')">
                                <AlarmClockPlus class="h-4 w-4" /> {{ $t('set_alert') }}
                              </Button>
                            </template>
                            <template v-else-if="header.id === footerLabelColumn">
                              {{  $t('total') }}
                            </template>
                            <template v-else> &nbsp; </template>
                          </TableCell>
                        </template>
                      </tr>
                    </TableFooter>
                  </Table>
                    
                  </div>
                </div>

              </CardContent>
        </Card>
      
        <!-- alert create modal -->
        <Dialog v-model:open="isAlertModal">
          <DialogContent class="max-w-2xl">
            <div class="space-y-6">
              <DialogHeader>
                <DialogTitle class="text-xl font-semibold">
                  {{ selectedItem?.stock_name }}
                </DialogTitle>
              </DialogHeader>
              
              <div class="flex flex-col">
                <Label for="alert_name" class="mb-1">
                  {{ $t('alert_name') }}
                </Label>
                <Input id="alert_name" v-model="alertForm.alert_name"  
                  :placeholder="$t('alert_name')" class="w-full" />
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <!-- Field -->
                <div class="flex flex-col">
                  <Label for="field" class="mb-1">
                    {{ $t('field') }}
                  </Label>
                  <Select v-model="alertForm.field" 
                  @update:modelValue="onAlertFieldChange($event)">
                    <SelectTrigger id="field" class="w-full">
                      <SelectValue :placeholder="$t('field')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in fieldOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <span v-if="alertForm.field" class="mt-1 text-xs text-muted-foreground">
                    {{ numberToGerman(selectedItem?.[alertForm.field]) }}
                  </span>
                </div>
              
                <!-- Condition -->
                <div class="flex flex-col">
                  <Label for="condition" class="mb-1">
                    {{ $t('condition') }}
                  </Label>
                  <Select v-model="alertForm.condition">
                    <SelectTrigger id="condition" class="w-full">
                      <SelectValue :placeholder="$t('condition')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="option in conditionOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              
                <!-- Alert Value -->
                <div class="flex flex-col">
                  <Label for="alertValue" class="mb-1">
                    {{ $t('alert_value') }}
                  </Label>
                  <Input id="alertValue" v-model.number="alertForm.alert_value" type="number"  
                  :placeholder="$t('alert_value')" class="w-full" />
                </div>
              </div>
              
      
              <DialogFooter class="mt-6">
                <Button variant="outline" @click="closeModal">
                  {{  $t('cancel') }}
                </Button>
                
                <Button v-if="selectedEditItem" @click="updateAlert(selectedEditItem.id)">
                  {{  $t('update')  }}
                </Button>
                <Button v-else @click="createAlert">
                  {{ $t('create') }}
                </Button>

              </DialogFooter>

            </div>
          </DialogContent>
        </Dialog>


        <!-- alert list modal -->
        <Dialog v-model:open="isOpenAlertList">
          <DialogContent class="max-w-5xl">
            <div class="space-y-6 ">
              <DialogHeader>
                <DialogTitle class="text-xl font-semibold">
                  {{ $t('alerts') }}
                </DialogTitle>
              </DialogHeader>
              
              <div class="max-w-full overflow-x-auto">
                <div class="min-w-[720px] max-h-[60vh] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow class="bg-muted sticky top-0 z-10">
                        <TableHead>{{ $t('alert_name') }}</TableHead>
                        <TableHead>{{ $t('type') }}</TableHead>
                        <TableHead>{{ $t('stock_name') }}</TableHead>
                        <TableHead>{{ $t('wkn') }}</TableHead>
                        <TableHead>{{ $t('field') }}</TableHead>
                        <TableHead>{{ $t('condition') }}</TableHead>
                        <TableHead>{{ $t('alert_value') }}</TableHead>
                        <TableHead>{{ $t('status') }}</TableHead>
                        <TableHead>{{ $t('action') }}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="alert in alerts" :key="alert.id">
                        <TableCell>{{ alert.alert_name }}</TableCell>
                        <TableCell>{{ $t(alert.type) }}</TableCell>
                        <TableCell>{{ alert.stock_name }}</TableCell>
                        <TableCell>{{ alert.wkn }}</TableCell>
                        <TableCell>{{ $t(alert.field) }}</TableCell>
                        <TableCell>{{ conditionLabel(alert.condition) }}</TableCell>
                        <TableCell>{{ numberToGerman(alert.alert_value) }}</TableCell>
                        <TableCell>{{ alert.status==1 ? $t('completed') : $t('active') }}</TableCell>
                        <TableCell>
                          <Button @click="openEditAlert(alert.id)" size="icon" variant="ghost" class="mr-1 h-8 w-8"
                            :aria-label="$t('edit')" :title="$t('edit')">
                            <Pen class="w-4 h-4" />
                          </Button>
                          <Button @click="confirmDeleteAlert(alert.id)" variant="ghost" size="icon" class="h-8 w-8"
                            :aria-label="$t('delete')" :title="$t('delete')">
                            <Trash class="w-4 h-4 text-red-600 dark:text-red-400" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <div v-if="alerts.length==0">
                    <Empty compact />
                  </div>
                    
                </div>
              </div>
              
      
            </div>
          </DialogContent>
        </Dialog>


         <!-- final alert dialog -->
         <Dialog v-model:open="alertDialog">
          <DialogContent class="max-w-sm text-center">
            <DialogHeader>
              <DialogTitle>{{ $t('alert_triggered') }}</DialogTitle>
            </DialogHeader>
            <div class="py-4 text-left" v-if="triggeredAlert">
              <p><strong>{{ $t('alert_name') }}</strong>: {{ triggeredAlert.alertName }}</p>
              <p v-if="triggeredAlert.contextKey === 'stock_name'"><strong>{{ $t('stock_name') }}</strong>: {{ triggeredAlert.stockName }}</p>
              <p v-else-if="triggeredAlert.contextKey === 'group_name'"><strong>{{ $t('group_name') }}</strong>: {{ triggeredAlert.stockName }}</p>
              <p v-else><strong>{{ $t('total') }}</strong></p>
              <p><strong>{{ $t(triggeredAlert.field) }}</strong> {{ conditionLabel(triggeredAlert.condition) }} <strong>{{ numberToGerman(triggeredAlert.alertValue) }}</strong></p>
              <p><strong>{{ $t('current') }}</strong>: {{ numberToGerman(triggeredAlert.currentValue) }}</p>
            </div>
            <DialogFooter>
              <Button @click="alertDialog = false">{{ $t('close') }}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog :open="!!confirmState" @update:open="(open) => { if (!open) confirmState = null }">
          <AlertDialogContent>
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
import { onBeforeRouteLeave } from 'vue-router'

import { storage } from '#imports';
import Empty from '~/components/Empty.vue'
import StockInfoCard from '~/components/StockInfoCard.vue'
import AccountFilter from '~/components/AccountFilter.vue'
import CombineSwitch from '~/components/CombineSwitch.vue'
import PeerProductsCard from '~/components/PeerProductsCard.vue'
import DataTableFacetedFilter from '~/components/DataTableFacetedFilter.vue'
import { VueDraggableNext } from 'vue-draggable-next'

import type { ColumnFiltersState } from '@tanstack/vue-table';
 
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'

import {
  FlexRender,
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues
} from '@tanstack/vue-table'

import { valueUpdater } from '~/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { getApiKey, apiBaseUrl, apiKey, apiAuthFailed, fetchFeed, isApiRateLimited, apiRateLimitSecondsLeft, numberToGerman, germanToNumer, formatTimestamp, formatDate, getLatestData, chunkArray, deepCloneReactiveData, isMarketClosed, saveDailyTotal, getComparableUnderlyingPrice, escapeHtml, todayIso } from '~/utils/helper';

import { 
  getPriceData,
  getUnderlyingPriceData,
  getCurrencyRate,
  calculateLatestMainListData,
} from '~/utils/price-data-utils'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import {useI18n} from "vue-i18n";
import { debounce } from 'lodash';
import { toast } from '@/components/ui/toast';
import { downloadCsv, downloadXlsx, fileTimestamp } from '~/utils/export-utils';

import { sortableHeader } from '~/utils/table-utils';
import { ListFilter, Trash, X, Search, Download, RefreshCcw, AlarmClockPlus, Pen, File, FileSpreadsheet, Pencil, Save, ChevronRight } from 'lucide-vue-next';

const { t } = useI18n();
document.title = t('list');

// native alert() blocked the page and was English-only; these now go through toast + i18n
const MSG_SELECT_TWO_TO_GROUP = 'select_two_to_group';
const MSG_GROUP_NOT_FOUND = 'group_not_found';
const MSG_ITEM_NOT_FOUND_IN_GROUP = 'item_not_found_in_group';
const notifyError = (key: string) => toast({ title: t(key), variant: 'destructive' });

// one shared confirm dialog for destructive row actions (delete alert, remove group)
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


const safeJsonGet = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const onDragEnd = (event) => {
  const { oldIndex, newIndex } = event

  if (oldIndex === newIndex) return // No change, exit

  
  //Get Only Visible Columns
  const visibleColumns = table.getAllColumns()
    .filter(col => col.getIsVisible())
    .map(col => col.id)
    
  //Reorder the visible columns
  const movedColumn = visibleColumns.splice(oldIndex, 1)[0] // Remove dragged column
  visibleColumns.splice(newIndex, 0, movedColumn) // Insert at new position


  //Update Full Column Order
  columnOrder.value = columnOrder.value.filter(colId => visibleColumns.includes(colId)) // Keep only visible ones
}


const nonDraggableColumns = ['select', 'actions']

function onMoveColumn(evt) {
  const draggedColumnId = columnOrder.value[evt.draggedContext.index]
  // slot 0 belongs to the pinned select column
  if (evt.relatedContext?.index === 0) return false
  return !nonDraggableColumns.includes(draggedColumnId)
}

// Save column visibility changes
const saveColumnVisibility = () => {
  localStorage.setItem('columnOrder', JSON.stringify(columnOrder.value));
};

const rowSelection = ref({})

const toggleColumn = (colId, isVisible) => {
  if (isVisible) {
    columnOrder.value.push(colId);
  } else {
    columnOrder.value = columnOrder.value.filter(id => id !== colId);
  }
  saveColumnVisibility();
};


const brokerOptions = computed(() => {
  const set = new Set()
  const column = table?.getColumn('broker')
  if (column?.getFacetedUniqueValues) {
    column.getFacetedUniqueValues().forEach((_count, value) => {
      if (value !== undefined && value !== null && value !== "") {
        set.add(value)
      }
    })
  }
  return Array.from(set).sort();
});

// Same value vocabulary as the Home picker, so the shared preference maps straight on.
const onAccountFilterChange = async () => {
  await calculateTotals();
};

// Selection is keyed per account; after a flip those rows may not be on screen at all.
const onCombineChange = () => {
  console.log("onCombineChange", accountViewCombined.value);
  rowSelection.value = {};
};

watch(accountsVersion, async () => {
  console.log("List accountsVersion changed");
  // Controllers pile up in the module-level array otherwise; only cancel empties it.
  cancellAllRequests();
  await getLatestData();
  await getLatestMainListData();
});

const typeOptions = computed(() => {
  const set = new Set()
  const column = table?.getColumn('type')
  if (column?.getFacetedUniqueValues) {
    column.getFacetedUniqueValues().forEach((_count, value) => {
      if (value !== undefined && value !== null && value !== "") {
        set.add(value)
      }
    })
  }
  return Array.from(set).sort();
});

const issuerOptions = computed(() => {
  const set = new Set()
  const column = table?.getColumn('issuer')
  if (column?.getFacetedUniqueValues) {
    column.getFacetedUniqueValues().forEach((_count, value) => {
      if (value !== undefined && value !== null && value !== "") {
        set.add(value)
      }
    })
  }
  return Array.from(set).sort();
});

// Must match getRowId exactly: rowSelection is keyed by whatever that returns.
const tableRowKey = (row:any) => row?.isGroup ? row.id : accountRowKey(row);

const groupAwareRowFilter = (row, columnId, filterValues) => {
  const original = row.original
  if (!filterValues?.length) return true

  if (original?.isGroup) {
    // accessorFn columns (account) have no matching property on the raw child rows,
    // so a plain item[columnId] lookup is undefined and drops every group.
    const accessor = (allColumns as any)[columnId]?.accessorFn;
    return original.items?.some((item: any) =>
      filterValues.includes(accessor ? accessor(item) : item[columnId])
    )
  }

  return filterValues.includes(row.getValue(columnId))
}

const isStocksOwnedVisible = (item: any) =>
  item?.stock_name === 'Cash' || !!Number(item?.stocks_owned)

const hideZeroStocksFilter = (row, _columnId, filterValues) => {
  if (!filterValues?.length) return true
  if (!filterValues.includes('hideZero')) return true

  const original = row.original
  if (original?.isGroup) {
    return original.items?.some(isStocksOwnedVisible) ?? false
  }
  return isStocksOwnedVisible(original)
}

function visibleSubRows(row) {
  const subRows = row?.subRows ?? []
  const isHidingZero = columnFilters.value.some(
    f => f.id === 'stocks_owned' && Array.isArray(f.value) && f.value.includes('hideZero')
  )
  if (!isHidingZero) return subRows
  return subRows.filter(sub => isStocksOwnedVisible(sub?.original))
}


const allColumns = {
  select: {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) =>
      h(Checkbox, {
        'modelValue': table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean) => table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': t('select_all'),
      }),
    cell: ({ row }) =>
      h(Checkbox, {
        'modelValue': row.original.depth ? row.original.getIsSelected() : row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean) => {
          if(row.original.depth){
            row.original.toggleSelected(!!value);
          }else{
            row.toggleSelected(!!value);
          }
        },
        'ariaLabel': t('select_row'),
      }),
  },
  
  account: {
    id: 'account',
    accessorFn: (row) => accountKeyOf(row),
    defaultVisible: false,
    cell: (info) => accountLabel(info.row.original.broker, info.row.original.account_id),
    // No faceted filter here on purpose: the toolbar AccountFilter is the single
    // control, and a second one would stack a separate filter on top of it.
    header: ({ column }) => getSortingHeader(column, "account"),
  },

  broker: {
    accessorKey: 'broker',
    id: 'broker',
    cell: (info) => info.getValue(),
    header: ({ column }) =>
      h("div", { class: "flex items-center gap-2" }, [
        getSortingHeader(column, "broker"),
        h(DataTableFacetedFilter, {
          column,
          options: brokerOptions.value.map(item => ({
            label: item, value: item,
          })),
        }),
    ]),
    filterFn: groupAwareRowFilter,
  },
  stock_name: { accessorKey: 'stock_name', id: 'stock_name', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'stock_name') },
  
  isin: { accessorKey: 'isin', id: 'isin', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'isin') },
  wkn: { accessorKey: 'wkn', id: 'wkn', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'wkn') },
  
  type: { 
    accessorKey: 'type', id: 'type', 
    cell: (info) => info.getValue(), 
    header: ({ column }) =>
      h("div", { class: "flex items-center gap-2" }, [
        getSortingHeader(column, "type"),
        h(DataTableFacetedFilter, {
          column,
          options: typeOptions.value.map(type => ({
            label: t(type), value: type,
          })),
        }),
    ]),
    filterFn: groupAwareRowFilter,
  },

  stocks_owned: {
    accessorKey: 'stocks_owned',
    id: 'stocks_owned',
    cell: (info) => info.getValue(),
    header: ({ column }) =>
      h("div", { class: "flex items-center gap-2" }, [
        getSortingHeader(column, "stocks_owned"),
        h(DataTableFacetedFilter, {
          column,
          options: [{ label: t('hide_zero_stocks_owned'), value: 'hideZero' }],
        }),
      ]),
    filterFn: hideZeroStocksFilter,
  },
  buy_price: { accessorKey: 'buy_price', id: 'buy_price', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'buy_price') },
  purchase_date: { accessorKey: 'purchase_date', id: 'purchase_date', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'purchase_date') },
  days_since_purchase: { accessorKey: 'days_since_purchase', id: 'days_since_purchase', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'days_since_purchase') },
  yield_pa_since_purchase: { accessorKey: 'yield_pa_since_purchase', id: 'yield_pa_since_purchase', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'yield_pa_since_purchase') },
  total_entry_value: { accessorKey: 'total_entry_value', id: 'total_entry_value', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'total_entry_value') },
  profit_loss_price: { accessorKey: 'profit_loss_price', id: 'profit_loss_price', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'profit_loss_price')  },
  profit_loss_percentage: { accessorKey: 'profit_loss_percentage', id: 'profit_loss_percentage', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'profit_loss_percentage') },
  profit_loss_target_per_day: { accessorKey: 'profit_loss_target_per_day', id: 'profit_loss_target_per_day', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'profit_loss_target_per_day') },

  issuer: { 
    accessorKey: 'issuer', id: 'issuer', 
    cell: (info) => info.getValue(), 
    header: ({ column }) =>
      h("div", { class: "flex items-center gap-2" }, [
        getSortingHeader(column, "issuer"),
        h(DataTableFacetedFilter, {
          column,
          options: issuerOptions.value.map(item => ({
            label: item, value: item,
          })),
        }),
    ]),
    filterFn: groupAwareRowFilter,
  },
  
  bid: { accessorKey: 'bid', id: 'bid', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'bid_price')  },
  ask: { accessorKey: 'ask', id: 'ask', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'ask_price')  },
  timestamp: { accessorKey: 'timestamp', id: 'timestamp', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'timestamp') },
  total_value: { accessorKey: 'total_value', id: 'total_value', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'total_value')  },
  
  future_total_value: { accessorKey: 'future_total_value', id: 'future_total_value', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'future_total_value')  },
  underlying_isin: { accessorKey: 'underlying_isin', id: 'underlying_isin', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'underlying')  },
  underlying_name: { accessorKey: 'underlying_name', id: 'underlying_name', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'underlying_name')  },
  underlying_price: { accessorKey: 'underlying_price', id: 'underlying_price', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'underlying_price')  },
  underlying_timestamp: { accessorKey: 'underlying_timestamp', id: 'underlying_timestamp', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'timestamp_underlying')  },
  
  settlement: { accessorKey: 'settlement', id: 'settlement', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'settlement')  },
  quanto2: { accessorKey: 'quanto2', id: 'quanto2', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'quanto')  },
  ratio: { accessorKey: 'ratio', id: 'ratio', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'ratio') },
  
  cap_strike: { accessorKey: 'cap_strike', id: 'cap_strike', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'cap_strike')  },
  cap_disco_os: { accessorKey: 'cap_disco_os', id: 'cap_disco_os', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'cap_disco_os')  },
  profit_loss_target: { accessorKey: 'profit_loss_target', id: 'profit_loss_target', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'profit_loss_target')  },
  profit_loss_target_pa: { accessorKey: 'profit_loss_target_pa', id: 'profit_loss_target_pa', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'profit_loss_target_pa')  },
  distance_to_the_cap: { accessorKey: 'distance_to_the_cap', id: 'distance_to_the_cap', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'distance_to_the_cap') },
  position_percentage: { accessorKey: 'position_percentage', id: 'position_percentage', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'position_percentage') },
  position_target_percentage: { accessorKey: 'position_target_percentage', id: 'position_target_percentage', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'position_target_percentage') },
  notes: { accessorKey: 'notes', id: 'notes', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'notes') },
  currency_rate: { accessorKey: 'currency_rate', id: 'currency_rate', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'currency_rate') },

  valuation_date: { accessorKey: 'valuation_date', id: 'valuation_date', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'valuation_date') },
  sideways_return: { accessorKey: 'sideways_return', id: 'sideways_return', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'sideways_return')  },
  sideways_return_pa: { accessorKey: 'sideways_return_pa', id: 'sideways_return_pa', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'sideways_return_pa') },
  pe_ratio: { accessorKey: 'pe_ratio', id: 'pe_ratio', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'pe_ratio')  },
  dividend_yield: { accessorKey: 'dividend_yield', id: 'dividend_yield', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'dividend_yield')  },
  market_cap: { accessorKey: 'market_cap', id: 'market_cap', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'market_cap')  },
  barrier_knockout: { accessorKey: 'barrier_knockout', id: 'barrier_knockout', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'barrier_knockout') },
  bonus_level: { accessorKey: 'bonus_level', id: 'bonus_level', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'bonus_level') },
  coupon: { accessorKey: 'coupon', id: 'coupon', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'coupon') },
  
  omega: { accessorKey: 'omega', id: 'omega', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'omega') },
  theta: { accessorKey: 'theta', id: 'theta', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'theta') },
  vega: { accessorKey: 'vega', id: 'vega', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'vega')  },

  peer_members: { accessorKey: 'peer_members', id: 'peer_members', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'peer_members')  },
  implied_volatility: { accessorKey: 'implied_volatility', id: 'implied_volatility', cell: (info) => info.getValue(), header: ({ column }) => getSortingHeader(column, 'implied_volatility')  },
  
}


const sorting = ref([
])

const setSorting = (sortingUpdater) => {
  const newSortVal = sortingUpdater(sorting.value)
  sorting.value = newSortVal;
  // save sort state
  localStorage.setItem("tableSortState", JSON.stringify(newSortVal));
}

const defaultColumnOrder = Object.keys(allColumns).filter(colId => allColumns[colId].defaultVisible !== false);
const storedOrder = safeJsonGet<string[]>('columnOrder', defaultColumnOrder);

// select must stay index 0: .sticky_column uses left:0, so any other slot scrolls away
function withSelectFirst(order: string[]) {
  return ['select', ...order.filter(id => id !== 'select')];
}

const columnOrder = ref(withSelectFirst(storedOrder));

const columns = computed(() => columnOrder.value.map(colId => allColumns[colId]))

const expanded = ref(safeJsonGet<Record<string, boolean>>('tableExpanded', {}));
let isFirstLoad = false;
function setExpanded(updater) {
  if(isFirstLoad && updater){
    valueUpdater(updater, expanded); // your helper
    localStorage.setItem('tableExpanded', JSON.stringify(expanded.value));
  }
}

// filter
const globalFilter = ref('');
const globalFilterInput = ref('');
const applyDebouncedFilter = debounce((val) => {
  globalFilter.value = val;
}, 300);

watch(globalFilterInput, (val) => {
  applyDebouncedFilter(val);
});


const searchableColumns = [
  'stock_name',
  'isin','wkn',
  'type','underlying_name'
];

// Scope by account here rather than through the table's account column: that column
// is defaultVisible:false, so it is absent from `columns` and getColumn() returns
// undefined until the user enables it. Groups are filtered by their children.
const accountScopedData = computed(() => {
  if (accountViewIsAll()) return listData.value;
  return listData.value
    .map(entry => {
      if (!entry.isGroup) return accountViewFilter([entry]).length ? entry : null;
      const items = accountViewFilter(entry.items || []);
      return items.length ? { ...entry, items } : null;
    })
    .filter(Boolean);
});

// After scoping, so only accounts in view merge. Display only: nothing downstream of this
// computed may be written back to LIST_DATA, or per-account notes and cost bases are lost.
const combinedData = computed(() => {
  if (!accountViewCombined.value) return accountScopedData.value;
  return accountCombineRows(accountScopedData.value);
});

//filter with row, group sub rows and also column filter
const newFilteredData = computed(() => {
  const term = globalFilter.value?.toLowerCase()?.trim()
  if (!term) return combinedData.value
  return combinedData.value
    .map(entry => {
      if (!entry.isGroup) {
        //Filter standalone rows
        const matches = searchableColumns.some(col =>
          String(entry[col] || '').toLowerCase().includes(term)
        )
        return matches ? entry : null
      }

      //Handle groups
      const matchedItems = entry.items.filter(item =>
        searchableColumns.some(col =>
          String(item[col] || '').toLowerCase().includes(term)
        )
      )

      if (matchedItems.length > 0) {
        return {
          ...entry,
          items: matchedItems, // keep only matching children
        }
      }

      return null // drop group if no match
    })
    .filter(Boolean) // remove nulls
});


const columnFilters = ref<ColumnFiltersState>([])
const mainListData = ref([]);
const listData = ref([]);

// Saves the list (groups, notes, targets) so it survives a reload.
const persistListData = async () => {
  await storage.setItem('local:LIST_DATA', deepCloneReactiveData(listData.value));
};


const table = useVueTable({
  get data() {
    return newFilteredData.value
  },
  get columns() { return columnOrder.value.map(colId => allColumns[colId]) },
  state: {
    get sorting() {return sorting.value },
    get rowSelection() { return rowSelection.value },
    get expanded() { return expanded.value },
    get globalFilter() { return globalFilter.value },
    get columnFilters() { return columnFilters.value },
  },
  onGlobalFilterChange: (updater) => {
    globalFilter.value = updater
  },
  onSortingChange: setSorting,
  onExpandedChange: setExpanded,
  getCoreRowModel: getCoreRowModel(),
  getGroupedRowModel: getGroupedRowModel(),
  getSortedRowModel: getSortedRowModel(),
  onRowSelectionChange: updaterOrValue => valueUpdater(updaterOrValue, rowSelection),
  onColumnFiltersChange: updaterOrValue => valueUpdater(updaterOrValue, columnFilters),
  getFilteredRowModel: getFilteredRowModel(),
  getFacetedRowModel: getFacetedRowModel(),
  getFacetedUniqueValues: getFacetedUniqueValues(),
  getRowId: row => tableRowKey(row),
  getExpandedRowModel: getExpandedRowModel(),
  autoResetExpanded: false,
  getRowCanExpand: row => !!row.items || row.original.isGroup,
  getSubRows: row => row.isGroup ? row.items : [],
  debugTable: false,

  // Combined rows are not stored, so combineRows would find nothing in listData; Cash rows are.
  enableRowSelection: row => !row.original?.isCombined,
  enableSubRowSelection: true,
});

const parseGermanNumber = (value: string | number): number => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  return germanToNumer(value)
}

const groupName = ref('');
const currentRow = ref(null);
const selectedGroup = ref(null);
const selectedProducts = ref([]);

watch(rowSelection, (newVal) => {
  const selectedIds = new Set(Object.keys(newVal));
  
  selectedProducts.value = [];
  listData.value.map(item => {
    if (selectedIds.has(tableRowKey(item))){
      selectedProducts.value.push(item);
    };

    //items
    if (item.items?.length) {
      item.items.filter(sub =>{
        if(selectedIds.has(tableRowKey(sub))){
          selectedProducts.value.push(sub);
        }
      });
    }
  });
  
  // Cash has no wkn, so name it by its label or a cash-only group gets the name ", ".
  const wknValues = selectedProducts.value.map(item => isCashRow(item) ? cashLabel(item) : item.wkn);
  groupName.value = wknValues.join(', ');

  currentRow.value = selectedProducts.value[0];
});

// Watch Column Order and Save Changes
watch(columnOrder, (newOrder) => {
  if (newOrder[0] !== 'select') {
    columnOrder.value = withSelectFirst(newOrder)
    return
  }
  localStorage.setItem('columnOrder', JSON.stringify(newOrder))
}, { deep: true })


const allGroups = computed(() => {
  return listData.value?.filter(item => item.isGroup) ?? [];
});

const removeGroupWithEmptyItems = ()=>{
  // Remove group if items array is empty
  listData.value = listData.value.filter(item => {
    if (item.isGroup && (!item.items || item.items.length === 0)) return false;
    return true;
  });
}

const combineRows = async () => {
  if(selectedGroup.value){
    const groupIndex = listData.value.findIndex(g => g.id === selectedGroup.value);
    if (groupIndex !== -1) {
      const existingGroup = listData.value[groupIndex];
      
      // Ensure group has items array
      if (!existingGroup.items) existingGroup.items = [];

      // Push only base items (no nested groups)
      const newItems = selectedProducts.value.filter(item => !item.isGroup)
        .map(({ items, ...rest }) => rest);
      existingGroup.items.push(...newItems);

      // Remove the selected products from the top-level list

      listData.value = listData.value.map(item => {
        if (item.id === selectedGroup.value) return item;
        
        // Remove selected sub-items from items array
        if (item.items?.length) {
          item = { ...item,
            items: item.items.filter(
              sub => !selectedProducts.value.some(p => accountRowKey(p) === accountRowKey(sub)))
          };
        }

        // Remove top-level selected items
        if (!item.items && selectedProducts.value.some(p => accountRowKey(p) === accountRowKey(item))) {
          return null;
        }

        return item;

      }).filter(Boolean);

      // Replace updated group in the list
      listData.value[groupIndex] = { ...existingGroup };
      removeGroupWithEmptyItems();
    }
  }else{
    
    if (selectedProducts.value.length < 2) {
      notifyError(MSG_SELECT_TWO_TO_GROUP);
      return
    }

    const groupedRow = {
      id: crypto.randomUUID(),
      group_name: groupName.value,
      isGroup: true,
      items: selectedProducts.value.filter(item => !item.isGroup)
        .map(({ items, ...rest }) => rest),
    };


    const flatRows = listData.value.map(item => {
      const mainSelected = selectedProducts.value.some(
        p => accountRowKey(p) === accountRowKey(item)
      );
      if (mainSelected) return null;
      
      if (item.items?.length) {
        const remainingItems = item.items.filter(
          sub => !selectedProducts.value.some(p => accountRowKey(p) === accountRowKey(sub)) 
        );
        return remainingItems.length > 0 ? { ...item, items: remainingItems } : null;
      }
      return item;
    }).filter(Boolean);


    // Set new listData with grouped + remaining
    listData.value = [groupedRow, ...flatRows];
    removeGroupWithEmptyItems();
  }
  
  // Clear selection
  clearRowSelecttion();
  
  await persistListData();
  
}

const editGroupId = ref(0);
const editGroupName = ref(0);
const editGroup = (groupId)=>{
  editGroupId.value = groupId;
  const groupIndex = listData.value.findIndex(item => item.id === groupId && item.isGroup);
  if (groupIndex === -1) {
    notifyError(MSG_GROUP_NOT_FOUND);
    return;
  }
  
  let currentItem = listData.value[groupIndex];
    if(currentItem){
      editGroupName.value = currentItem.group_name; 
  }
}

const updateGroup = async (groupId) => {
  
  // Find the group by the groupId
  const groupIndex = listData.value.findIndex(item => item.id === groupId && item.isGroup);

  if (groupIndex === -1) {
    notifyError(MSG_GROUP_NOT_FOUND);
    return;
  }
  
  let currentItem = listData.value[groupIndex];
  if(currentItem){
    listData.value[groupIndex].group_name = editGroupName.value;
    editGroupId.value = 0;
    editGroupName.value = '';
    
    await persistListData();
  }
};


const removeGroup = async (groupId) => {
  
  // Find the group by the groupId
  const groupIndex = listData.value.findIndex(item => item.id === groupId && item.isGroup);

  if (groupIndex === -1) {
    notifyError(MSG_GROUP_NOT_FOUND);
    return;
  }

  // Extract the group and move all its items to the main data
  const groupToRemove = listData.value[groupIndex];
  const itemsToMove = groupToRemove.items;

  // Remove the group
  listData.value.splice(groupIndex, 1);

  // Move the items back to the main data
  listData.value = [...listData.value, ...itemsToMove];

  // Clear selection
  rowSelection.value = {};

  await persistListData();

};


const removeItemFromGroup = async (groupId, itemId) => {
  const groupIndex = listData.value.findIndex(item => item.id === groupId && item.isGroup);
  if (groupIndex === -1) {
    notifyError(MSG_GROUP_NOT_FOUND);
    return;
  }

  const group = listData.value[groupIndex];
  const itemIndex = group.items.findIndex(item => item.id === itemId);
  if (itemIndex === -1) {
    notifyError(MSG_ITEM_NOT_FOUND_IN_GROUP);
    return;
  }

  // Remove the item
  const [itemToMove] = group.items.splice(itemIndex, 1);

  // Create a shallow clone of the listData
  const updatedList = [...listData.value];
  updatedList.push(itemToMove);

  if (group.items.length === 0) {
    updatedList.splice(groupIndex, 1);
  } else {
    updatedList[groupIndex] = { ...group }; // Reassign group to trigger reactivity
  }

  // Trigger full reactivity
  listData.value = updatedList;

  await persistListData();

};


const formatGermanNumber = (num) => numberToGerman(num, false, 2);;

// Cache overall total once for dependent calculations
const overallTotalValue = computed(() => {
  return mainListData.value?.reduce((acc, val) => acc + Number(val.total_value || 0), 0) || 0;
});

// Denominator for what the user can actually see, so filtered percentages reach 100%.
const scopedTotalValue = computed(() => {
  return accountViewFilter(mainListData.value)?.reduce((acc, val) => acc + Number(val.total_value || 0), 0) || 0;
});

function computeGroupTotals(items:any, totalAll:any) {
  let total_entry_value = 0;
  let profit_loss_price = 0;
  let total_value = 0;
  let position_target_percentage = 0;
  let future_total_value = 0;
  let profit_loss_target_per_day = 0;

  for (const item of items) {
    // Cash has no units or bid; its balance is both entry and value, so it adds no P/L.
    if (isCashRow(item)) {
      const balance = Number(item.total_entry_value) || 0;
      total_value += balance;
      total_entry_value += balance;
      continue;
    }

    const totalValue = (item.stocks_owned || 0) * (item.bid || 0);
    total_value += totalValue;

    const profitLossPrice = totalValue - (item.total_entry_value || 0);
    profit_loss_price += profitLossPrice;

    const totalEntryValue = parseGermanNumber(item.total_entry_value);
    total_entry_value += totalEntryValue;

    const totalPositionTarget = parseGermanNumber(item.position_target_percentage);
    position_target_percentage += totalPositionTarget;

    const totalFutureTotal = parseGermanNumber(item.future_total_value);
    future_total_value += totalFutureTotal;

    const totalProfitLossTargetPerDay = parseGermanNumber(item.profit_loss_target_per_day);
    profit_loss_target_per_day += totalProfitLossTargetPerDay;
  }

  const profit_loss_percentage = total_entry_value > 0
    ? ((total_value / total_entry_value) - 1) * 100
    : 0;

  const position_percentage = totalAll > 0
    ? Number(((total_value / totalAll) * 100).toFixed(2))
    : 0;

  return {
    total_entry_value,
    profit_loss_price,
    profit_loss_percentage,
    total_value,
    position_percentage,
    position_target_percentage,
    future_total_value,
    profit_loss_target_per_day,
  };
}

// Memoized map of groupId -> totals to avoid repeated heavy computation in templates
const groupTotalsMap = computed(() => {
  const map = {} as Record<string, any>;
  const totalAll = overallTotalValue.value;

  for (const listItem of listData.value || []) {
    if (!listItem?.isGroup || !listItem?.id || !Array.isArray(listItem.items)) continue;
    map[listItem.id] = computeGroupTotals(listItem.items, totalAll);
  }

  return map;
});

const emptyGroupTotals = () => ({
  total_entry_value: 0,
  profit_loss_price: 0,
  profit_loss_percentage: 0,
  total_value: 0,
  position_percentage: 0,
  position_target_percentage: 0,
  future_total_value: 0,
  profit_loss_target_per_day: 0,
});

// Unfiltered on purpose: alerts must fire on the real portfolio, not on the current view.
const getGroupTotals = (groupId) => {
  return groupTotalsMap.value[groupId] || emptyGroupTotals();
};

// A group spanning two accounts must show only the visible half while a filter is on.
const groupScopedTotalsMap = computed(() => {
  if (accountViewIsAll()) return groupTotalsMap.value;

  const map = {} as Record<string, any>;
  const totalAll = scopedTotalValue.value;

  for (const listItem of accountScopedData.value || []) {
    if (!listItem?.isGroup || !listItem?.id || !Array.isArray(listItem.items)) continue;
    map[listItem.id] = computeGroupTotals(listItem.items, totalAll);
  }
  return map;
});

const getScopedGroupTotals = (groupId:any) => {
  return groupScopedTotalsMap.value[groupId] || emptyGroupTotals();
};

// A negative balance is a Wertpapierkredit, so it reads as credit rather than minus-cash.
const cashAmount = (row:any) => Math.abs(Number(row?.total_entry_value) || 0);

const cashLabel = (row:any) => {
  const base = (Number(row?.total_entry_value) || 0) < 0 ? t('loan_capital') : t('cash');
  // Only worth naming the account when more than one is on screen.
  if (accountViewIsAll() || accountViewSelected.value.length > 1) {
    return `${base} · ${accountLabel(row?.broker, row?.account_id)}`;
  }
  return base;
};

// Cash sits at the bottom whatever the sort, or several balances alphabetise into the
// middle and split the holdings.
const orderedRows = (rows:any) => {
  if (!Array.isArray(rows)) return [];
  const holdings = rows.filter((r:any) => !isCashRow(r.original));
  const cash = rows.filter((r:any) => isCashRow(r.original));
  return cash.length ? [...holdings, ...cash] : rows;
};

const displayRows = computed(() => orderedRows(table.getRowModel().rows));

// The stored percentage is against the whole portfolio, so recompute it while filtered.
const scopedPositionPercentage = (row:any) => {
  if (accountViewIsAll()) return row?.position_percentage;
  const total = scopedTotalValue.value;
  return total > 0 ? ((Number(row?.total_value || 0) / total) * 100).toFixed(2) : 0;
};


const listTotal = ref({});
// "Total" used to sit only in the broker column, so it vanished whenever broker was hidden
const footerLabelColumn = computed(() => columnOrder.value.find((id: string) => id !== 'select'));
async function calculateTotals(saveDaily = true) {

  const totalColumns = [
    'total_entry_value', 'profit_loss_price',
    'total_value','future_total_value',
    'profit_loss_target',
    'profit_loss_target_per_day',
    'profit_loss_percentage', //keep this last for manual process

  ];

  const allRows = accountViewFilter(mainListData.value);
  if(allRows){
      
    const totals = {};
      for (const key of totalColumns) {
        totals[key] = allRows.reduce((sum, row) => {
          let value = parseFloat(row[key]);
          return sum + (isNaN(value) ? 0 : value);
      }, 0);
    }

    //custom calculation
    totals.profit_loss_percentage = ((totals.total_value / totals.total_entry_value) - 1) * 100;
    // Only the unscoped total may be persisted: a single-account figure here would
    // corrupt DAILY_TOTAL and with it Home's day-change badge and the 30-day series.
    if (saveDaily && accountViewIsAll()) saveDailyTotal();

    //convert to german
    for (const key in totals) {
      totals[key] = parseFloat(totals[key]).toFixed(2);
    }

    listTotal.value = totals;

  }
}


// No hover override: gray-300 hover with black text broke dark mode; ghost variant already has a themed hover
const getSortingHeader = (column, label) => sortableHeader(column, t(label));


const controllers: AbortController[] = [];
let chunkSize = 20;


const getProductData = async (forceUpdate = false) => {
  if(isMarketClosed()) return;

  const controller = new AbortController();
  controllers.push(controller);

  mainListData.value = await storage.getItem('local:MAIN_LIST') || [];

  const today = todayIso();
  const shouldInclude = (item) => forceUpdate || item.lastUpdated !== today;
  // Deduped: the same holding in two accounts is two rows but one product to fetch.
  const stockItems = [...new Set(mainListData.value.filter(item => item.type === 'stock' && shouldInclude(item)).map(item => item.wkn).filter(Boolean))];
  const otherItems = [...new Set(mainListData.value.filter(item => item.type !== 'stock' && shouldInclude(item)).map(item => item.isin).filter(Boolean))];

  const wknChunks = chunkArray(stockItems, chunkSize);
  const isinChunks = chunkArray(otherItems, chunkSize);
  let allApiData = [];
  // Only codes the API answered get today's stamp; a failed or rate-limited chunk must retry today.
  const answered = new Set();

  try {
    
    for (const chunk of wknChunks) {
      try {
        const wknParam = chunk.join(',');
        const url = `${apiBaseUrl}products?apikey=${apiKey.value}&wkn=${wknParam}`;
        const apiData = await fetchFeed(url, controller.signal);
        if (!apiData) {
          if (apiAuthFailed.value || isApiRateLimited()) break;
          // A plain error is stamped as before, or an unknown product refetches on every refresh.
          chunk.forEach((code:any) => answered.add(code));
          continue;
        }
        chunk.forEach((code:any) => answered.add(code));
        if(apiData.status == 1 && apiData?.data?.length>0){
          allApiData = allApiData.concat(apiData.data);
        }
      } catch (chunkErr) {
        if ((chunkErr as any)?.name === 'AbortError') throw chunkErr;
        console.error('getProductData error:', chunkErr);
      }
    }

    for (const chunk of isinChunks) {
      try {
        const isinParam = chunk.join(',');
        const url = `${apiBaseUrl}products?apikey=${apiKey.value}&isin=${isinParam}`;
        const apiData = await fetchFeed(url, controller.signal);
        if (!apiData) {
          if (apiAuthFailed.value || isApiRateLimited()) break;
          // A plain error is stamped as before, or an unknown product refetches on every refresh.
          chunk.forEach((code:any) => answered.add(code));
          continue;
        }
        chunk.forEach((code:any) => answered.add(code));
        if(apiData.status == 1 && apiData?.data?.length>0){
          allApiData = allApiData.concat(apiData.data);
        }
      } catch (chunkErr) {
        if ((chunkErr as any)?.name === 'AbortError') throw chunkErr;
        console.error('getProductData error:', chunkErr);
      }
    }
    
    
    const apiMap = Object.fromEntries(
      allApiData.map(product => [product.isin, { ...product, lastUpdated: today }])
    );
    
    // Merge data into your list
    mainListData.value = mainListData.value.map(item => {
      const extraData = apiMap[item.isin];
      if (extraData && Object.keys(extraData).length > 0) {
        return { ...item, ...extraData };
      } else if(answered.has(item.wkn) || answered.has(item.isin)) {
        // If the item was supposed to be updated but no data found, set lastUpdated to today to avoid refetching
        return { ...item, lastUpdated: today };
      }else {
        return item;
      }
    });
    const clonedData = deepCloneReactiveData(mainListData.value);
    await storage.setItem('local:MAIN_LIST',clonedData);

  } catch (err) {
    console.error('getProductData Failed to fetch product data:', err);
  } finally {
    const idx = controllers.indexOf(controller);
    if (idx !== -1) controllers.splice(idx, 1);
  }
};

const isPriceLoading = ref(false);
const reloadPriceData = async(forceUpdate=false) =>{
  // forceUpdate means the Reload button, so only then say why nothing happened; the interval stays silent.
  if(isRefreshing.value || isPriceLoading.value){
    if(forceUpdate) toast({ title: t('refresh_already_running') });
    return;
  }
  if(isApiRateLimited()){
    if(forceUpdate) toast({ title: t('api_rate_limited_short', { seconds: apiRateLimitSecondsLeft() }), variant: 'destructive' });
    return;
  }
  if(isMarketClosed()){
    if(forceUpdate) toast({ title: t('market_closed_no_prices') });
    return;
  }
  const currentData = mainListData.value;

  isPriceLoading.value = true;
  try {
    if(forceUpdate){
      await getProductData(true);
    }
    await getPriceData();
    await getUnderlyingPriceData();
    await getCurrencyRate();

    const priceFields = [
      'bid','ask',
      'sideways_return','sideways_return_pa',
      'yield_pa_since_purchase',
      'profit_loss_price','profit_loss_percentage',
      'profit_loss_target_per_day','total_value',
      'profit_loss_target','profit_loss_target_pa',
      'underlying_price',
    ];

    mainListData.value = await storage.getItem('local:MAIN_LIST') || [];

    // Per position, not per wkn: one wkn in two accounts flashed only the first row.
    const oldByPosition = new Map(currentData.map(i => [accountPositionKey(i), i]));
    mainListData.value.forEach(item => {
      const oldItem = oldByPosition.get(accountPositionKey(item));
      if (!oldItem) return;
      priceFields.forEach(key => {
        const oldValue = oldItem[key] ?? 0;
        const newValue = item[key] ?? oldValue;
        if (newValue !== oldValue) {
          // Second key is the combined row's: price is per product, so a child's move is its move.
          const combinedKey = accountPositionKey({ ...(item as any), account_id: '', deposite_number: '' });
          document.querySelectorAll(`[data-position="${accountPositionKey(item)}"][data-field="${key}"], [data-position="${combinedKey}"][data-field="${key}"]`)
            .forEach((rowEl) => {
              rowEl.classList.remove('up', 'down');
              void rowEl.offsetWidth; // ✅ Force reflow to restart animation
              rowEl.classList.add(newValue > oldValue ? 'up' : 'down');
              setTimeout(() => rowEl.classList.remove('up', 'down'), 2000);
            });
        }
      });
    });

    await getLatestMainListData(true);
  } catch (e) {
    console.error('reloadPriceData failed:', e);
  } finally {
    isPriceLoading.value = false;
  }
}

const getPeerProductData = async () => {
  if(isMarketClosed()) return;
  const controller = new AbortController();
  controllers.push(controller);

  mainListData.value = await storage.getItem('local:MAIN_LIST') || [];
  const today = todayIso();
  // Deduped: the same holding in two accounts is two rows but one peers request.
  const wknList = [...new Set(mainListData.value
    .filter(item => item.peerslastUpdated !== today)
    .map(item => item.wkn)
    .filter(Boolean))];
  // Only stamp wkns the API actually answered: a failed or skipped fetch must retry today.
  const answered = new Set();


  const allApiData: Record<string, any> = {};

  const fetchPeers = async (wkn) => {
    try {
      const url = `${apiBaseUrl}peers?apikey=${apiKey.value}&wkn=${wkn}`;
      const apiData = await fetchFeed(url, controller.signal);
      if (!apiData) {
        // A plain error is stamped as before; only auth and rate-limit misses retry today.
        if (!apiAuthFailed.value && !isApiRateLimited()) answered.add(wkn);
        return;
      }
      answered.add(wkn);
      if (apiData.status === 1 && apiData?.data?.length>0) {
        allApiData[wkn] = {
          wkn: wkn,
          peer_members: apiData.data,
          peerslastUpdated: today
        };
      }
    } catch (chunkErr) {
      if ((chunkErr as any)?.name === 'AbortError') throw chunkErr;
      console.error('getPeerProductData error:', wkn, chunkErr);
    }
  };

  try {
    // One request per wkn, so run a few at a time instead of strictly one after another.
    for (const batch of chunkArray(wknList, 4)) {
      if (apiAuthFailed.value || isApiRateLimited()) break;
      await Promise.all(batch.map(fetchPeers));
    }
    
    // Merge data into your list
    mainListData.value = mainListData.value.map(item => {
      const extraData = allApiData[item.wkn];

        if (extraData && Object.keys(extraData).length > 0) {
          return { ...item, ...extraData };
        } else if(answered.has(item.wkn)){
          return { ...item, peerslastUpdated: today };
        }else {
          return item;
        }

    });

    const clonedData = deepCloneReactiveData(mainListData.value);
    await storage.setItem('local:MAIN_LIST',clonedData);

  } catch (err) {
    console.error('getPeerProductData Failed to fetch product data:', err);
  } finally {
    const idx = controllers.indexOf(controller);
    if (idx !== -1) controllers.splice(idx, 1);
  }
};

const getNestedValue = (obj, path) => {
  if (!path || typeof path !== 'string') return undefined; // Ensure path is valid
  if (!path.includes('.')) return obj[path]; // Return flat property
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};


const amountFields = [
  'buy_price',
  'total_entry_value',
  'profit_loss_price',
  'profit_loss_percentage',
  'profit_loss_target_per_day',
  'bid',
  'ask',
  'total_value',
  'future_total_value',
  'underlying_price',
  'ratio',
  'cap_strike',
  'cap_disco_os',
  'profit_loss_target',
  'profit_loss_target_pa',
  'distance_to_the_cap',
  'position_percentage',
  'position_target_percentage',
  'currency_rate',
  'sideways_return',
  'sideways_return_pa',
  'yield_pa_since_purchase',
  'market_cap',
  ];

const exportDelimiter = ref(';');
// Selected rows if the user ticked any, otherwise everything in the table.
const rowsToExport = () => {
  if (!Object.keys(rowSelection.value).length) return combinedData.value;
  return combinedData.value.filter(item => rowSelection.value[tableRowKey(item)] === true);
};

// Cell value as it should appear in a file: peers joined, amounts rounded to 2 decimals.
const exportCellValue = (row, col) => {
  const value = getNestedValue(row, col.accessorKey || col.id);
  if (col.accessorKey === 'peer_members') return value != null ? value.join(',') : '';
  if (amountFields.includes(col.accessorKey)) return value != null ? Number(parseFloat(value).toFixed(2)) : '';
  return value;
};

const exportCSV = () => {
  const delimiter = exportDelimiter.value;
  const activeColumns = columns.value.filter(col => !['select','id','profile_photo','actions'].includes(col.id));

  const header = activeColumns.map(col => col.id).join(delimiter) + '\n';
  const body = rowsToExport()
    .map(row => activeColumns.map(col => exportCellValue(row, col) ?? '').join(delimiter))
    .join('\n');

  downloadCsv(header + body, `list_${fileTimestamp()}.csv`);
}

const exportXlsx = () => {
  const activeColumns = columns.value.filter(col => !['select', 'id', 'actions'].includes(col.id));

  const exportData = rowsToExport().map(row => {
    const newRow = {};
    activeColumns.forEach(col => {
      newRow[col.id] = exportCellValue(row, col);
    });
    return newRow;
  });

  downloadXlsx(exportData, 'Sheet1', `list_${fileTimestamp()}.xlsx`);
};

const wknLink = ref('');
const isinLink = ref('');
const priceUpdateDuration = ref(30);
const telegramBotToken = ref('');
const telegramChannelId = ref('');

const loadingRows = ref(14);
const isLoading = ref(true);

const restoreSortState = () => {
  const savedSortState = safeJsonGet<any[]>("tableSortState", []);
  sorting.value = savedSortState;
};


const cancellAllRequests = () => {
  controllers.forEach(c => c.abort())
  controllers.length = 0
};

let priceInterval: ReturnType<typeof setInterval> | null = null;
let alertInterval: ReturnType<typeof setInterval> | null = null;

onBeforeUnmount(() => {
  cancellAllRequests();
});

onBeforeRouteLeave(() => {
  cancellAllRequests();
});

onUnmounted(() => {
  if (priceInterval !== null) clearInterval(priceInterval);
  if (alertInterval !== null) clearInterval(alertInterval);
  priceInterval = null;
  alertInterval = null;
});

onMounted( async() => {
  await getApiKey();
  await getLatestData();
  await paintFromStorage();

  restoreSortState();
  await loadAlerts();
  isFirstLoad = true;

  // Not awaited: alerts, settings and intervals must not wait on the network pass.
  if(apiKey.value) refreshFromNetwork();

  setTimeout(()=>{
  },1000);

  const settings = await storage.getItem('local:settings') as Record<string, any> | null;
  if(settings){
    wknLink.value          = settings.wkn_link            ?? '';
    isinLink.value         = settings.isin_link           ?? '';
    exportDelimiter.value  = settings.export_delimiter    ?? ';';
    priceUpdateDuration.value = Number(settings.price_duration) > 0 ? Number(settings.price_duration) : 30;
    telegramBotToken.value = settings.telegram_bot_token  ?? '';
    telegramChannelId.value= settings.telegram_channel_id ?? '';
  }

  // Outside the settings block: a fresh install has no saved settings and never auto-refreshed.
  if(apiKey.value && priceUpdateDuration.value > 0){
    priceInterval = setInterval(async()=>{
      await reloadPriceData();
    }, priceUpdateDuration.value * 60 * 1000);
  }

  //Alert Interval
  alertInterval = setInterval(checkAlerts, 1000);

});


// A count, not a flag: an account switch can start a second pass before the first ends.
const activeRefreshes = ref(0);
const isRefreshing = computed(() => activeRefreshes.value > 0);
// Network passes read-modify-write MAIN_LIST, so a note typed mid-pass would be overwritten.
const isSyncing = computed(() => isRefreshing.value || isPriceLoading.value);

const getLatestMainListData = async(isPriceReload=false) =>{
  await paintFromStorage();
  if(apiKey.value){
    await refreshFromNetwork(isPriceReload);
  }

  //new added for page change issue
}

// Paint from storage first; the network pass can take many seconds on the first load of a day.
const paintFromStorage = async() =>{
  await calculateLatestMainListData();
  mainListData.value = await storage.getItem('local:MAIN_LIST') || [];
  // No DAILY_TOTAL save yet when a network pass follows: cached prices would stand in for today on Home.
  calculateTotals(!apiKey.value);
  await getLatestListData();
  isLoading.value = false;
}

const refreshFromNetwork = async(isPriceReload=false) =>{
  console.log("refreshFromNetwork", isPriceReload);
  // The banner already explains the wait; cached rows stay until the window reopens.
  if (isApiRateLimited()) {
    // The paint skipped DAILY_TOTAL expecting this pass; save from cached prices as the old failed-fetch path did.
    calculateTotals();
    return;
  }
  activeRefreshes.value++;
  try {
    //update price and product
    await getProductData();
    await getPeerProductData();

    if(!isPriceReload){
      await getPriceData();
      await getUnderlyingPriceData();
      await getCurrencyRate();
    }
    // First pass ran before cap/strike/underlying arrived; without this, new positions show a wrong Zielwert until the next price interval.
    await calculateLatestMainListData(true);
    mainListData.value = await storage.getItem('local:MAIN_LIST') || [];

    calculateTotals();
    await getLatestListData();
  } catch (err) {
    // Cached rows are already on screen; the next interval or Reload retries.
    console.error('refreshFromNetwork error:', err);
  } finally {
    activeRefreshes.value--;
  }
}


//listData
const getLatestListData = async() =>{
  const currentListData = await storage.getItem('local:LIST_DATA');
  if(currentListData){
    listData.value = currentListData;
  }

  const newStockData =  mainListData.value;
  const currentData = listData.value || [];

  if(currentData.length===0){
    currentData.push(...newStockData.map(stock => ({...stock, isGroup: false})));
  }else{
    // Shared with MAIN_LIST so the two stores can never disagree about identity.
    const getKey = (item) => accountPositionKey(item);
    const newWknSet = new Set(newStockData.map(stock => getKey(stock)));

    // Indexed once up front; findIndex per stock was O(n²) with a key rebuild on every compare. First match wins, as before.
    const groupIndex = new Map();
    const topIndex = new Map();
    currentData.forEach((entry, i) => {
      if (entry.isGroup && Array.isArray(entry.items)) {
        entry.items.forEach((item, j) => {
          const key = getKey(item);
          if (!groupIndex.has(key)) groupIndex.set(key, { group: entry, itemIndex: j });
        });
      } else if (!entry.isGroup) {
        const key = getKey(entry);
        if (!topIndex.has(key)) topIndex.set(key, i);
      }
    });

    newStockData.forEach((newStock) => {
      const key = getKey(newStock);

      // 1. Try updating inside a group
      const inGroup = groupIndex.get(key);
      if (inGroup) {
        const { group, itemIndex } = inGroup;
        group.items[itemIndex] = { ...group.items[itemIndex],...newStock,isGroup: false };
        return;
      }

      // 2. Try updating top-level item
      const top = topIndex.get(key);
      if (top !== undefined) {
        currentData[top] = { ...currentData[top], ...newStock, isGroup: false };
        return;
      }

      // 3. Add new item if not found at all
      currentData.push({...newStock, isGroup: false,});
      topIndex.set(key, currentData.length - 1);
    });

    // Step 2: Remove items not present in newStockData
    for (let i = currentData.length - 1; i >= 0; i--) {
      const entry = currentData[i];

      if (entry.isGroup && Array.isArray(entry.items)) {
        entry.items = entry.items.filter(item => newWknSet.has(getKey(item)));
        // Optionally remove empty groups
        if (entry.items.length === 0) {
          currentData.splice(i, 1);
        }
      } else if (!entry.isGroup && !newWknSet.has(getKey(entry))) {
        currentData.splice(i, 1);
      }
    }
  }
  
  //set init
  const clonedData = deepCloneReactiveData(currentData);
  listData.value = clonedData;
  await storage.setItem('local:LIST_DATA',clonedData);
}

const formattedWKNLink = (wkn) =>{
  return wknLink.value.replace('$WKN', wkn);
}

const formattedISINLink = (isin) =>{
  return isinLink.value.replace('$ISIN', isin);
}


const hlFields = [
  'yield_pa_since_purchase', 'profit_loss_price', 'profit_loss_percentage',
  'total_value', 'future_total_value', 'sideways_return', 'sideways_return_pa',
];

// From displayed rows, not MAIN_LIST: an account filter or combined view otherwise marks a row that isn't on screen.
const hlExtremes = computed(() => {
  const leaves = combinedData.value.flatMap((entry:any) => entry.isGroup ? (entry.items || []) : [entry]);
  const map:any = {};
  for (const field of hlFields) {
    let high = -Infinity;
    let low = Infinity;
    for (const item of leaves) {
      const value = item?.[field];
      if (typeof value !== 'number' || isNaN(value) || value === 0) continue;
      if (value > high) high = value;
      if (value < low) low = value;
    }
    map[field] = high === -Infinity ? null : { high, low };
  }
  return map;
});

function getClassForHL(field, currentValue) {
  const extremes = hlExtremes.value[field];
  if (!extremes) return '';

  const highValue = extremes.high;
  const lowValue = extremes.low;
  
  if (currentValue === highValue) {
    return 'high';
  }

  if (currentValue === lowValue) {
    return 'low';
  }

  return '';
}

// undefined, not '', so Vue drops the title attribute on unmarked cells.
function getTitleForHL(field, currentValue) {
  const hl = getClassForHL(field, currentValue);
  return hl ? t(hl === 'high' ? 'column_highest' : 'column_lowest') : undefined;
}

// Alerts written before the multi-account key carry no account, so they keep
// matching on wkn alone rather than going silent.
function alertMatchesRow(alert:any, item:any) {
  if (!alert?.account_id) return true;
  // A combined row stands for all its accounts, so any child's alert shows on it.
  if (item?.isCombined) {
    return alert.broker === item.broker && (item.combined_accounts || []).includes(alert.account_id);
  }
  return accountKeyOf(item) === accountKeyOf(alert);
}

// Called per cell, so bucket once instead of scanning every alert per cell.
const alertsByKey = computed(() => {
  const map = new Map();
  for (const a of alerts.value as any[]) {
    const key = `${a.field}|${a.type_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  return map;
});

function getClassForAlert(field, row) {
  const matchingAlerts = (alertsByKey.value.get(`${field}|${row?.wkn}`) || []).filter(
    (a:any) => alertMatchesRow(a, row)
  );
  
  if (matchingAlerts.length === 0) return '';

  const topConditions = ['>=', '>'];
  const bottomConditions = ['<=', '<'];

  let topColor = '';
  let bottomColor = '';

  for (const alert of matchingAlerts) {
    const isActive = alert.status !== 1;
    if (topConditions.includes(alert.condition)) {
      if(isActive) topColor = 'border-top-green';
      else topColor = 'border-top-red';
    }

    if (bottomConditions.includes(alert.condition)) {
      if (isActive) bottomColor = 'border-bottom-green';
      else bottomColor = 'border-bottom-red';
    }
  }

  const classes = [];
  if (topColor) classes.push('alert_top', topColor);
  if (bottomColor) classes.push('alert_bottom', bottomColor);
  if (matchingAlerts.length > 1) classes.push('alert_bg','bg-green-200');

  return classes.join(' ');
}


/* Alert */
const alertForm = reactive({
  alert_name:'',
  type:'',
  type_id:'',
  field:'',
  condition:'==',
  alert_value:0,
  stock_name:'',
  status:0,
});


const CONDITION_KEYS = {
  '>=': 'condition_gte',
  '>': 'condition_gt',
  '<=': 'condition_lte',
  '<': 'condition_lt',
  '==': 'condition_eq',
};
// stored values stay symbols (isConditionSatisfied matches on them); only the label is spelled out
const conditionLabel = (value: string) => CONDITION_KEYS[value] ? t(CONDITION_KEYS[value]) : value;
const conditionOptions = computed(() => Object.keys(CONDITION_KEYS)
  .map((value) => ({ value, label: conditionLabel(value) })));

const isAlertModal = ref(false);
const selectedItem = ref(null);
const isOpenAlertList = ref(false);
const alertType = ref('stock'); // stock, total, group
const fieldOptions = ref([]);

function setAlertFields(){
  if(alertType.value=='stock'){
    fieldOptions.value = [
      { value: 'bid', label: t('bid_price') },
      { value: 'profit_loss_price', label: t('profit_loss_price') },
      { value: 'profit_loss_percentage', label: t('profit_loss_percentage') },
      { value: 'sideways_return', label: t('sideways_return') },
      { value: 'sideways_return_pa', label: t('sideways_return_pa') },
      { value: 'underlying_price', label: t('underlying_price') },
      { value: 'yield_pa_since_purchase', label: t('yield_pa_since_purchase') },
      { value: 'dc_dist_cap', label: t('dc_dist_cap') },
      { value: 'dc_dist_barrier', label: t('dc_dist_barrier') },
    ];
  }else if(alertType.value=='total'){
    fieldOptions.value = [
      { value: 'total_entry_value', label: t('total_entry_value') },
      { value: 'profit_loss_price', label: t('profit_loss_price') },
      { value: 'total_value', label: t('total_value') },
      { value: 'future_total_value', label: t('future_total_value') },
      { value: 'profit_loss_percentage', label: t('profit_loss_percentage') },
    ];
  }else if(alertType.value=='group'){
    fieldOptions.value = [
      { value: 'total_entry_value', label: t('total_entry_value') },
      { value: 'profit_loss_percentage', label: t('profit_loss_percentage') },
      { value: 'profit_loss_price', label: t('profit_loss_price') },
      { value: 'total_value', label: t('total_value') },
      { value: 'position_percentage', label: t('position_percentage') },
    ];
  }

}

function openModal(item, type='stock') {
  selectedItem.value = item;
  if(selectedItem.value?.wkn){
    resetAlertForm();
    isAlertModal.value = true;
    alertType.value = type;
    setAlertFields();
    if(type=='group'){
      selectedItem.value = getGroupTotals(item.id);
      selectedItem.value.wkn = item.id;
      selectedItem.value.stock_name = item.group_name;
    }
  }
}

function closeModal() {
  isAlertModal.value = false;
  resetAlertForm();
  clearRowSelecttion();
}

// Also run on open: closing via X or overlay skips closeModal, so an old edit would leak into the next create.
function resetAlertForm() {
  selectedEditItem.value = null;
  alertForm.alert_name = '';
  alertForm.type = '';
  alertForm.type_id = '';
  alertForm.field = '';
  alertForm.condition = '==';
  alertForm.alert_value = 0;
  alertForm.stock_name = '';
  alertForm.status = 0;
}

const clearRowSelecttion = ()=>{
  // Clear row selection
  rowSelection.value = {}
  groupName.value = '';
  selectedGroup.value = '';
}

const onAlertFieldChange = (event) =>{
  const raw = selectedItem.value?.[alertForm.field];
  const parsed = raw == null ? NaN : Number(raw);
  if (Number.isFinite(parsed)) {
    alertForm.alert_value = parsed.toFixed(2);
  }
}

const alerts = ref([]);
async function saveAlerts() {
  await storage.setItem('local:ALERTS', JSON.parse(JSON.stringify(alerts.value)))
}

// Load alerts from local storage
async function loadAlerts() {
  const saved = await storage.getItem('local:ALERTS')
  if (saved) {
    alerts.value = saved
  }
}

// --- MAIN functions ---
// Create new alert
async function createAlert() {
  const exists = alerts.value.some(
    (a) => a.field === alertForm.field
    && a.type_id === alertForm.type_id
    && a.condition === alertForm.condition
    && a.alert_value === alertForm.alert_value
    && a.status === alertForm.status
    // Strict, unlike alertMatchesRow: a legacy account-less alert must not block the
    // same alert being created for a second account.
    && (a.account_id ?? '') === (selectedItem.value?.account_id ?? '')
    && (a.broker ?? '') === (selectedItem.value?.broker ?? '')
  )

  if (exists) {
    // 🚨 Show warning
    toast({ title: t('alert_with_same_settings_already_exists'), variant: 'destructive' });
    return
  }

  const newAlert = {
    id: crypto.randomUUID(),
    alert_name: alertForm.alert_name,
    type: alertType.value,
    field: alertForm.field,
    condition: alertForm.condition,
    alert_value: alertForm.alert_value,
    type_id: selectedItem.value.wkn,
    stock_name: selectedItem.value.stock_name,
    // Undefined on total and group alerts, which have no account to belong to.
    broker: selectedItem.value.broker,
    account_id: selectedItem.value.account_id,
    status:0, //0:pending, 1:complete
  }

  alerts.value.push(newAlert);
  await saveAlerts();
  toast({ title: t('alert_created_successfully') });
  
  closeModal();
}

// Update an existing alert
const selectedEditItem = ref(null);
async function openEditAlert(id) {
  isOpenAlertList.value = false;
  const idx = alerts.value.findIndex((a) => a.id === id)
  if (idx !== -1) {
    const currentAlert = alerts.value[idx];
    
    alertType.value = currentAlert.type;
    setAlertFields();
    
    if(alertType.value==='stock'){
      selectedItem.value = listData.value.find(item => item.wkn === currentAlert.type_id && alertMatchesRow(currentAlert, item));
    }else if(alertType.value==='total'){
      selectedItem.value = listTotal.value;
    }

    selectedEditItem.value = currentAlert;
    
    alertForm.id = selectedEditItem.value.id;
    alertForm.alert_name = selectedEditItem.value.alert_name;
    alertForm.type = selectedEditItem.value.type;
    alertForm.type_id = selectedEditItem.value.type_id;
    alertForm.stock_name = selectedEditItem.value.stock_name;

    alertForm.field = selectedEditItem.value.field;
    alertForm.condition = selectedEditItem.value.condition;
    alertForm.alert_value = selectedEditItem.value.alert_value;
    alertForm.status = 0;
    isAlertModal.value = true;
  }
}

// Update an existing alert
async function updateAlert(id) {
  const updatedData = alertForm;
  const idx = alerts.value.findIndex((a) => a.id === id)
  if (idx !== -1) {
    alerts.value[idx] = { ...alerts.value[idx], ...updatedData }
    await saveAlerts();
    toast({ title: t('alert_updated_successfully') });
  }
  closeModal();
}

// Delete an alert
function confirmDeleteAlert(id: string) {
  askConfirm(t('confirm_delete_alert'), () => deleteAlert(id));
}

async function deleteAlert(id: string) {
  alerts.value = alerts.value.filter((a) => a.id !== id)
  await saveAlerts()
  toast({ title: t('alert_deleted_successfully') });
}


// alert trigger
const alertDialog = ref(false)
type TriggeredAlert = {
  alertName: string
  contextKey: 'stock_name' | 'group_name' | null
  stockName: string
  field: string
  condition: string
  alertValue: number
  currentValue: number
}
const triggeredAlert = ref<TriggeredAlert | null>(null)


import alertAudioUrl from '~/assets/alert.mp3';


let alertCheckInFlight = false;
async function checkAlerts() {
  if (alertCheckInFlight) return;
  // Cached prices are painted before the network pass; firing on them would complete alerts on stale values.
  if (isRefreshing.value) return;
  alertCheckInFlight = true;
  try {
    for (const alert of alerts.value) {
      if(alert.status===1) continue; //pass if completed


      let item;
      let alertType = alert.type;
      if(alertType =='stock'){
        item = mainListData.value.find(
          (i) => i.wkn === alert.type_id && i.stock_name === alert.stock_name && alertMatchesRow(alert, i)
        );
      }else if(alertType=='total'){
        item = listTotal.value;
      }else if(alertType=='group'){
        item = getGroupTotals(alert.type_id);
      }

      if (!item) continue

      const rawFieldValue = item[alert.field];
      const fieldValue = rawFieldValue == null ? NaN : Number(rawFieldValue);

      if (!Number.isFinite(fieldValue)) continue

      if (isConditionSatisfied(fieldValue, alert.condition, alert.alert_value)) {

        const contextKey: TriggeredAlert['contextKey'] =
          alertType === 'stock' ? 'stock_name' :
          alertType === 'group' ? 'group_name' : null;

        triggeredAlert.value = {
          alertName: alert?.alert_name ?? '',
          contextKey,
          stockName: alert?.stock_name ?? '',
          field: alert.field,
          condition: alert.condition,
          alertValue: Number(alert.alert_value),
          currentValue: fieldValue,
        };

        alertDialog.value = true
        const audio = new Audio(alertAudioUrl);
        audio.currentTime = 0 // always reset to start
        audio.play().catch((err) => {
        });

        // Telegram message — build HTML safely with user-input fields escaped.
        const a = triggeredAlert.value;
        const contextLine =
          a.contextKey === 'stock_name'
            ? `<strong>${t('stock_name')}</strong>: ${escapeHtml(a.stockName)} <br/>`
            : a.contextKey === 'group_name'
              ? `<strong>${t('group_name')}</strong>: ${escapeHtml(a.stockName)} <br/>`
              : `<strong>${t('total')}</strong> <br/>`;
        let message = `🚨${t('alert')}\n\n` +
          `<strong>${t('alert_name')}</strong>: ${escapeHtml(a.alertName)} <br/>` +
          contextLine +
          `<strong>${t(a.field)}</strong> ${escapeHtml(a.condition)} <strong>${numberToGerman(a.alertValue)}</strong> <br/>` +
          `<strong>${t('current')}</strong>: ${numberToGerman(a.currentValue)}`;
        
        if(telegramBotToken.value && telegramChannelId.value){
          await sendTelegramMessage(telegramBotToken.value,telegramChannelId.value,message)
        }

        //update status to complet
        const index = alerts.value.findIndex(alrt => alrt.id === alert.id);
        if (index !== -1) {
          alerts.value[index].status=1;
          await saveAlerts();
        }
        break // Stop after first match (optional: remove if you want to show multiple)
      }else{
      }
    }
  } catch (error) {
  } finally {
    alertCheckInFlight = false;
  }
}


function isConditionSatisfied(current: number, condition: string, target: number) {
  switch (condition) {
    case '==': return current == target
    case '!=': return current != target
    case '>': return current > target
    case '<': return current < target
    case '>=': return current >= target
    case '<=': return current <= target
    default: return false
  }
}


// Keyed by position, not wkn: the same product in two accounts is two rows, and the
// first match would take the other account's edit.
const updatePositionTarget = async (row,target,groupId=null) => {
  const key = accountPositionKey(row);

  //main
  let index = mainListData.value.findIndex(item => accountPositionKey(item) === key);
  if (index !== -1) {
    mainListData.value[index].position_target_percentage = target;
    const clonedData = deepCloneReactiveData(mainListData.value);
    await storage.setItem('local:MAIN_LIST',clonedData);
  }

  //list
  index = listData.value.findIndex(item => accountPositionKey(item) === key);
  if (index !== -1) {
    listData.value[index].position_target_percentage = target;
    await persistListData();
  }

  if (groupId) {
    const groupIndex = listData.value.findIndex(item => item.id === groupId && item.isGroup);
    if (groupIndex !== -1) {
      const subItemIndex = listData.value[groupIndex].items.findIndex(item => accountPositionKey(item) === key);
      if (subItemIndex !== -1) {
        listData.value[groupIndex].items[subItemIndex].position_target_percentage = target;
        await persistListData();
      }
    }
  }

}

const debounceUpdatePositionTarget = debounce((row, target, groupId = null) => {
  updatePositionTarget(row, target, groupId)
}, 500);


const updateNotes = async (row,target,groupId=null) => {
  const key = accountPositionKey(row);

  //main
  let index = mainListData.value.findIndex(item => accountPositionKey(item) === key);
  if (index !== -1) {
    mainListData.value[index].notes = target;
    const clonedData = deepCloneReactiveData(mainListData.value);
    await storage.setItem('local:MAIN_LIST',clonedData);
  }

  //list
  index = listData.value.findIndex(item => accountPositionKey(item) === key);
  if (index !== -1) {
    listData.value[index].notes = target;
    await persistListData();
  }

  if (groupId) {
    const groupIndex = listData.value.findIndex(item => item.id === groupId && item.isGroup);
    if (groupIndex !== -1) {
      const subItemIndex = listData.value[groupIndex].items.findIndex(item => accountPositionKey(item) === key);
      if (subItemIndex !== -1) {
        listData.value[groupIndex].items[subItemIndex].notes = target;
        await persistListData();
      }
    }
  }

}
const debounceUpdateNotes = debounce((row, target, groupId = null) => {
  updateNotes(row, target, groupId)
}, 500);

</script>

<style scoped>
/* Table*/
th {
  text-align: right;
  padding: 8px 4px;
  font-weight: bold;
  border-bottom: 2px solid hsl(var(--border));
  white-space: nowrap;
}

/* padding: 8px 4px; */

/* Table cells */
th,td {
  text-align: right;
  padding: 8px!important;
  border-bottom: 1px solid hsl(var(--border));
  white-space: nowrap;
  border-right: 2px solid hsl(var(--card));
}

td:last-child, th:last-child {
  border-right: none;
}

.high{
  display: block;
  padding: 6px;
  border-left: 2px solid #059669;
  border-right: 2px solid #059669;
}

.low{
  display: block;
  padding: 6px;
  border-left: 2px solid #e11d48;
  border-right: 2px solid #e11d48;
}

td:has(.high),
td:has(.low) {
  padding: 1px!important;
}

td:has(.alert_top),
td:has(.alert_bottom) {
  padding: 1px!important;
}

.alert_bg {
  display: block;
  padding: 6px;
}

.alert_top {
  display: block;
  padding: 6px;
  border-top-width: 2px;
  border-top-style: solid;
}

.alert_bottom {
  display: block;
  padding: 6px;
  border-bottom-width: 2px;
  border-bottom-style: solid;
}

.border-top-red {
  border-top-color: red !important;
}
.border-top-green {
  border-top-color: green !important;
}
.border-bottom-red {
  border-bottom-color: red !important;
}

.border-bottom-green {
  border-bottom-color: green !important;
}


.price_cell {
  transition: color 0.5s ease, background-color 0.5s ease;
}

.up {  background-color: #00915a; }
.down {  background-color: #e4200e; }

.sticky_column {
  position: sticky;
  left: 0; 
  top: 0px;
}

/* solid indigo band + closing rule: pale tints read as just another zebra stripe */
:global(:root) {
  --grp-bg: #4f46e5; --grp-bg-hover: #4338ca; --grp-fg: #ffffff; --grp-danger: #fecaca;
  --grp-child-bg: #e0e7ff; --grp-child-bg-hover: #c7d2fe; --grp-child-fg: #1e1b4b; --grp-child-bar: #4f46e5; --grp-child-line: #c7d2fe;
}
/* vars, not :global(.dark) rules: the scoped [data-v] attribute out-ranked those and dark mode kept the light tints */
:global(.dark) {
  --grp-bg: #4338ca; --grp-bg-hover: #3730a3; --grp-fg: #ffffff; --grp-danger: #fca5a5;
  --grp-child-bg: #1e1b4b; --grp-child-bg-hover: #272463; --grp-child-fg: #e0e7ff; --grp-child-bar: #818cf8; --grp-child-line: #312e81;
}
.group-row,
.group-row > td { background-color: var(--grp-bg) !important; color: var(--grp-fg); font-weight: 700; }
.group-row:hover,
.group-row:hover > td { background-color: var(--grp-bg-hover) !important; }
/* red-600 trash icon disappears on the indigo band */
.group-row .text-red-600 { color: var(--grp-danger) !important; }
/* ghost hover's pale accent swallowed the light icons; :not keeps the rename Save button primary */
.group-row button:not(.bg-primary):hover { background-color: rgb(255 255 255 / 0.15) !important; color: inherit !important; }

.group-child,
.group-child > td { background-color: var(--grp-child-bg) !important; color: var(--grp-child-fg); border-bottom-color: var(--grp-child-line); }
.group-child:hover,
.group-child:hover > td { background-color: var(--grp-child-bg-hover) !important; }
.group-child-last > td { border-bottom: 2px solid var(--grp-child-bar) !important; }

/* card bg, not muted: muted matched the gray zebra so the total read as one more row */
.total-row > td {
  background-color: hsl(var(--card)) !important;
  color: hsl(var(--foreground));
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  /* inset shadow, not border-top: collapsed borders on sticky cells scroll away with the body */
  box-shadow: inset 0 2px 0 hsl(var(--foreground) / 0.8), 0 -6px 8px -6px rgb(0 0 0 / 0.15);
}
</style>
