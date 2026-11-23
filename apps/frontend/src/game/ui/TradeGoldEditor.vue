<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
import GameInput from './primitives/GameInput.vue'
const props = defineProps<{ selected: number; available: number }>()
const emit = defineEmits<{ change: [quantity: number] }>()
function change(value: number): void {
    emit(
        'change',
        Math.min(props.available, Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)))
    )
}
</script>
<template>
    <div class="trade-gold-editor">
        <span
            >{{ tGame('game.trade.goldTradeGold') }}
            <small>{{ tGame('game.trade.available') }} {{ available }}</small></span
        >
        <div class="trade-gold-editor__controls">
            <GameButton
                size="compact"
                type="button"
                :disabled="selected <= 0"
                :aria-label="tGame('game.trade.lessGold')"
                @click="change(selected - 1)"
            >
                −
            </GameButton>
            <GameInput
                :value="selected"
                type="number"
                min="0"
                :max="available"
                step="1"
                :aria-label="tGame('game.trade.offerGold')"
                @input="change(Number(($event.target as HTMLInputElement).value))"
            />
            <GameButton
                size="compact"
                type="button"
                :disabled="selected >= available"
                :aria-label="tGame('game.trade.moreGold')"
                @click="change(selected + 1)"
            >
                +
            </GameButton>
        </div>
        <div class="trade-gold-editor__shortcuts">
            <GameButton
                size="compact"
                type="button"
                :disabled="selected === available"
                :aria-label="tGame('game.trade.allGold')"
                @click="change(available)"
            >
                {{ tGame('game.trade.all') }}
            </GameButton>
            <GameButton
                size="compact"
                type="button"
                :disabled="selected <= 0"
                :aria-label="tGame('game.trade.removeGold')"
                @click="change(0)"
            >
                ×
            </GameButton>
        </div>
    </div>
</template>
<style scoped>
.trade-gold-editor {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 6px;
    align-items: center;
}
.trade-gold-editor small {
    display: block;
    font-size: 10px;
    color: #aab58e;
}
.trade-gold-editor__controls {
    display: flex;
    gap: 2px;
}
.trade-gold-editor__controls button {
    min-width: 24px;
    min-height: 28px;
    padding: 0;
}
.trade-gold-editor__controls input {
    width: 42px;
    padding: 3px;
    text-align: center;
    appearance: textfield;
    -moz-appearance: textfield;
}
.trade-gold-editor__controls input::-webkit-inner-spin-button {
    appearance: none;
}
.trade-gold-editor__shortcuts {
    display: flex;
    gap: 3px;
}
.trade-gold-editor__shortcuts button {
    min-height: 26px;
    padding: 2px 5px;
    font-size: 10px;
}
</style>
