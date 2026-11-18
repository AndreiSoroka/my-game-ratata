<script setup lang="ts">
import { ITEM_DEFINITIONS, type ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import ItemIcon from './ItemIcon.vue'
import { itemStackLabel } from './itemLabels'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import GameInput from './primitives/GameInput.vue'

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
    <li
        class="trade-item-editor game-frame-host"
        :class="{ 'trade-item-editor--selected': selected > 0 }"
    >
        <GameFrame variant="inset" />
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
            <GameButton
                size="compact"
                type="button"
                :disabled="disabled || selected <= 0"
                :aria-label="`Меньше: ${label}`"
                @click="change(selected - 1)"
            >
                −
            </GameButton>
            <GameInput
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
            <GameButton
                size="compact"
                type="button"
                :disabled="disabled || selected >= available"
                :aria-label="`Больше: ${label}`"
                @click="change(selected + 1)"
            >
                +
            </GameButton>
        </div>
        <div class="trade-item-editor__shortcuts">
            <GameButton
                size="compact"
                type="button"
                :disabled="disabled || selected === available"
                :aria-label="`Всё: ${label}`"
                @click="change(available)"
            >
                Всё
            </GameButton>
            <GameButton
                size="compact"
                type="button"
                :disabled="disabled || selected <= 0"
                :aria-label="`Убрать: ${label}`"
                @click="change(0)"
            >
                ×
            </GameButton>
        </div>
    </li>
</template>
<style scoped>
.trade-item-editor {
    position: relative;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px 9px;
    padding: 9px;
    border: 1px solid transparent;
}
.trade-item-editor--selected {
    --game-frame-fill: linear-gradient(135deg, #314029, #1e3020);
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
