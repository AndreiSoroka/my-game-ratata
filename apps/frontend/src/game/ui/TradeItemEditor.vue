<script setup lang="ts">
import { ITEM_DEFINITIONS, type ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import ItemIcon from './ItemIcon.vue'
import { itemStackLabel } from './itemLabels'

const props = defineProps<{
    item: ItemInstanceSnapshot
    available: number
    selected: number
    disabled?: boolean
}>()
const emit = defineEmits<{ change: [quantity: number] }>()
const label = computed(() => ITEM_DEFINITIONS[props.item.itemId].name)
const maximum = computed(() => ITEM_DEFINITIONS[props.item.itemId].maxDurability)
function change(value: number): void {
    emit(
        'change',
        Math.min(props.available, Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)))
    )
}
</script>
<template>
    <li class="trade-item-editor" :class="{ 'trade-item-editor--selected': selected > 0 }">
        <ItemIcon :item="item" />
        <div class="trade-item-editor__identity">
            <strong :title="itemStackLabel(item)">{{ label }}</strong>
            <small
                >В сумке {{ item.quantity ?? 1 }} <span>· свободно {{ available }}</span></small
            >
            <small v-if="maximum" class="trade-item-editor__condition"
                >Прочность {{ Math.floor(item.durability ?? maximum) }}/{{ maximum }}</small
            >
        </div>
        <div class="trade-item-editor__controls" role="group" :aria-label="`В обмен: ${label}`">
            <button
                type="button"
                :disabled="disabled || selected <= 0"
                :aria-label="`Меньше: ${label}`"
                @click="change(selected - 1)"
            >
                −
            </button>
            <input
                :id="`exchange-${item.instanceId}`"
                :value="selected"
                type="number"
                min="0"
                :max="available"
                step="1"
                :disabled="disabled || available <= 0"
                :aria-label="`Количество: ${itemStackLabel(item)}`"
                @input="change(Number(($event.target as HTMLInputElement).value))"
            />
            <button
                type="button"
                :disabled="disabled || selected >= available"
                :aria-label="`Больше: ${label}`"
                @click="change(selected + 1)"
            >
                +
            </button>
        </div>
        <div class="trade-item-editor__shortcuts">
            <button
                type="button"
                :disabled="disabled || selected === available"
                :aria-label="`Всё: ${label}`"
                @click="change(available)"
            >
                Всё
            </button>
            <button
                type="button"
                :disabled="disabled || selected <= 0"
                :aria-label="`Убрать: ${label}`"
                @click="change(0)"
            >
                ×
            </button>
        </div>
    </li>
</template>
<style scoped>
.trade-item-editor {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px 9px;
    padding: 9px;
    background: #192b22;
    border: 1px solid #354b39;
    border-radius: 5px;
}
.trade-item-editor--selected {
    border-color: #a28c4d;
    background: #26382a;
}
.trade-item-editor__identity {
    min-width: 0;
}
strong {
    display: block;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
small {
    display: block;
    color: #b3c0ad;
    font-size: 10px;
    white-space: nowrap;
}
small span {
    color: #d5d8b8;
}
.trade-item-editor__condition {
    color: #9aac91;
}
.trade-item-editor__controls {
    display: grid;
    grid-template-columns: 24px 36px 24px;
    gap: 2px;
}
.trade-item-editor__controls button,
.trade-item-editor__controls input {
    min-width: 0;
    width: 100%;
    height: 29px;
    padding: 0;
    text-align: center;
}
.trade-item-editor__controls input {
    appearance: textfield;
    -moz-appearance: textfield;
}
.trade-item-editor__controls input::-webkit-inner-spin-button {
    appearance: none;
}
.trade-item-editor__shortcuts {
    grid-column: 2 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    margin-top: -2px;
}
.trade-item-editor__shortcuts button {
    padding: 1px 7px;
    min-height: 22px;
    font-size: 10px;
}
@media (max-width: 420px) {
    .trade-item-editor {
        grid-template-columns: 36px minmax(0, 1fr) auto;
        gap: 5px;
        padding: 7px;
    }
    .trade-item-editor :deep(.rpg-item-icon) {
        width: 36px;
        height: 36px;
    }
}
</style>
