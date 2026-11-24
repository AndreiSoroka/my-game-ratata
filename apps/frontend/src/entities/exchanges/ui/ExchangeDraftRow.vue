<script setup lang="ts">
import { ITEM_DEFINITIONS, type ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { darkPanelButtonColors, ItemSlot, UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'

const props = defineProps<{ item?: ItemInstanceSnapshot; available: number; selected: number }>()
const emit = defineEmits<{ change: [quantity: number] }>()

const label = computed(() =>
    props.item ? itemName(props.item.itemId) : tGame('game.trade.goldExchangeOffer')
)
const stackSize = computed(() => props.item?.quantity ?? 1)
const itemLabel = computed(() =>
    stackSize.value > 1 ? `${label.value} × ${stackSize.value}` : label.value
)
const maxDurability = computed(() =>
    props.item ? ITEM_DEFINITIONS[props.item.itemId].maxDurability : undefined
)
const button = { appearance: 'panel', panel: 'panel-015', colors: darkPanelButtonColors } as const

function allowedQuantity(value: number): number {
    return Math.min(props.available, Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)))
}

function change(value: number): void {
    emit('change', allowedQuantity(value))
}

function inputQuantity(event: Event): void {
    const field = event.target as HTMLInputElement
    const quantity = allowedQuantity(field.valueAsNumber)
    if (field.value !== '' && field.valueAsNumber !== quantity) {
        field.value = String(quantity)
    }
    emit('change', quantity)
}

function restoreQuantity(event: FocusEvent): void {
    const field = event.target as HTMLInputElement
    field.value = String(props.selected)
}
</script>

<template>
    <li class="exchange-draft-row">
        <div class="exchange-draft-row__identity">
            <ItemSlot v-if="item" :src="itemAssetCatalog[item.itemId].src" :alt="itemLabel" />
            <ItemSlot v-else
                ><span class="exchange-draft-row__gold" aria-hidden="true">◈</span></ItemSlot
            >
            <div class="exchange-draft-row__description">
                <strong>{{ label }}</strong>
                <small v-if="item">
                    {{ tGame('game.trade.inBag') }} {{ stackSize }}
                    <span v-if="available !== stackSize"
                        >{{ tGame('game.trade.availableTradeItem') }} {{ available }}</span
                    >
                    <span>{{ tGame('game.trade.selectedForExchange', { count: selected }) }}</span>
                </small>
                <small v-else class="exchange-draft-row__balance">
                    {{ tGame('game.trade.available') }} {{ available }}
                </small>
                <small v-if="item && maxDurability">
                    {{ tGame('game.trade.durability') }}
                    {{ Math.floor(item.durability ?? maxDurability) }}/{{ maxDurability }}
                </small>
            </div>
        </div>
        <div class="exchange-draft-row__actions">
            <div
                class="exchange-draft-row__stepper"
                role="group"
                :aria-label="tGame('game.trade.exchangeItem', { item: label })"
            >
                <UiButton
                    v-bind="button"
                    :disabled="selected <= 0"
                    :aria-label="
                        item
                            ? tGame('game.trade.offerLessItem', { item: label })
                            : tGame('game.trade.lessGold')
                    "
                    @click="change(selected - 1)"
                    >−</UiButton
                >
                <FantasyBorder
                    class="exchange-draft-row__field"
                    border="border-015"
                    color="var(--exchange-draft-control-border)"
                >
                    <input
                        :id="item ? `exchange-${item.instanceId}` : undefined"
                        :value="selected"
                        type="number"
                        min="0"
                        :max="available"
                        step="1"
                        inputmode="numeric"
                        :disabled="Boolean(item && available <= 0)"
                        :aria-label="
                            item
                                ? tGame('game.trade.itemQuantity', { item: itemLabel })
                                : tGame('game.trade.offerGold')
                        "
                        @input="inputQuantity"
                        @blur="restoreQuantity"
                    />
                </FantasyBorder>
                <UiButton
                    v-bind="button"
                    :disabled="selected >= available"
                    :aria-label="
                        item
                            ? tGame('game.trade.offerMoreItem', { item: label })
                            : tGame('game.trade.moreGold')
                    "
                    @click="change(selected + 1)"
                    >+</UiButton
                >
            </div>
            <UiButton
                v-bind="button"
                :disabled="selected === available"
                :aria-label="
                    item
                        ? tGame('game.trade.offerAllItem', { item: label })
                        : tGame('game.trade.allGold')
                "
                @click="change(available)"
            >
                {{ tGame(item ? 'game.trade.all' : 'game.trade.allGold') }}
            </UiButton>
            <UiButton
                v-bind="button"
                :disabled="selected <= 0"
                :aria-label="
                    item
                        ? tGame('game.trade.removeItemOffer', { item: label })
                        : tGame('game.trade.removeGold')
                "
                @click="change(0)"
            >
                {{ item ? tGame('game.trade.remove') : '×' }}
            </UiButton>
        </div>
    </li>
</template>

<style scoped>
.exchange-draft-row {
    --exchange-draft-control-border: var(--exchange-frame-accent, var(--ui-dark-panel-border));
    --ui-themed-panel-accent: var(--exchange-draft-control-border);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px 10px;
    padding: 8px 0;
    border-block-end: 1px solid var(--ui-dark-panel-divider);
    list-style: none;
}

.exchange-draft-row__identity {
    display: flex;
    flex: 1 1 132px;
    align-items: center;
    gap: 9px;
    min-inline-size: 0;
}

.exchange-draft-row__identity .ui-item-slot {
    flex: none;
}

.exchange-draft-row__gold {
    color: var(--ui-light-button-selected-edge);
    font-size: 25px;
}

.exchange-draft-row__description {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.exchange-draft-row__description strong {
    color: var(--ui-dark-panel-title);
    font: 600 16px/1.15 var(--ratata-font-family, system-ui);
}

.exchange-draft-row__description small {
    color: var(--exchange-frame-muted, var(--ui-dark-panel-text));
    font-size: 11px;
}

.exchange-draft-row__balance {
    text-transform: capitalize;
}

.exchange-draft-row__actions,
.exchange-draft-row__stepper {
    display: flex;
    align-items: stretch;
    gap: 4px;
}

.exchange-draft-row__actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    max-inline-size: 100%;
    margin-inline-start: auto;
}

.exchange-draft-row__actions button {
    --ui-button-panel-padding: 0 3px;
    min-inline-size: 28px;
    min-block-size: 30px;
    font-size: 12px;
    white-space: nowrap;
}

.exchange-draft-row__stepper button {
    font:
        600 17px/1 system-ui,
        sans-serif;
}

.exchange-draft-row__field {
    display: grid;
    inline-size: 44px;
    min-block-size: 30px;
    background: var(--ui-dark-panel-surface);
    color: var(--ui-dark-panel-title);
}

.exchange-draft-row__field:focus-within {
    outline: 1px solid var(--ui-dark-panel-title);
    outline-offset: 2px;
}

.exchange-draft-row__field input {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    appearance: textfield;
    padding: 0 1px;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font:
        600 14px/1 system-ui,
        sans-serif;
    text-align: center;
}

.exchange-draft-row__field input::-webkit-inner-spin-button,
.exchange-draft-row__field input::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
}

.exchange-draft-row__field:has(input:disabled) {
    opacity: 0.5;
}
</style>
