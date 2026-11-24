<script setup lang="ts">
import {
    type ClientMessage,
    type MarketSnapshot,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { ref } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { ItemSlot } from '@/shared/ui/common'

import GameButton from './primitives/GameButton.vue'
import GameInput from './primitives/GameInput.vue'
const props = defineProps<{
    market: MarketSnapshot
    npcId: string
    gold: number
    blocked?: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const side = ref<'buy' | 'sell'>('buy')
const quantity = ref(1)
function total(row: MarketSnapshot['rows'][number]): number | null {
    return quoteMarketTrade(row, side.value, quantity.value)
}
function trade(row: MarketSnapshot['rows'][number]): void {
    const expectedTotal = total(row)
    if (expectedTotal === null || props.blocked) return
    emit('command', {
        type: 'market_trade',
        npcId: props.npcId,
        side: side.value,
        itemId: row.itemId,
        quantity: quantity.value,
        expectedTotal,
        requestId: crypto.randomUUID(),
    })
}
</script>
<template>
    <section class="city-market" :aria-label="tGame('game.trade.cityMarket')">
        <div class="market-controls">
            <GameButton data-dialogue-action :aria-pressed="side === 'buy'" @click="side = 'buy'">
                {{ tGame('game.trade.buy') }}
            </GameButton>
            <GameButton data-dialogue-action :aria-pressed="side === 'sell'" @click="side = 'sell'">
                {{ tGame('game.trade.sell') }}
            </GameButton>
            <label
                >{{ tGame('game.trade.quantity') }}
                <GameInput v-model.number="quantity" type="number" min="1" max="100" step="1"
            /></label>
        </div>
        <p>
            {{ tGame('game.conversation.youHave') }} {{ gold }} {{ tGame('game.trade.gold') }}
            {{ market.cityName }}
        </p>
        <div v-for="row in market.rows" :key="row.itemId" class="market-row">
            <div class="market-row__item">
                <ItemSlot size="compact" :src="itemAssetCatalog[row.itemId].src" alt="" />
                <span>
                    {{ itemName(row.itemId) }}
                    <small
                        >{{ tGame('game.trade.inStock') }} {{ row.stock }} /
                        {{ row.capacity }}</small
                    >
                </span>
            </div>
            <GameButton
                variant="primary"
                data-dialogue-action
                :disabled="
                    blocked || total(row) === null || (side === 'buy' && gold < (total(row) ?? 0))
                "
                @click="trade(row)"
            >
                {{
                    total(row) === null
                        ? side === 'buy'
                            ? tGame('game.trade.noGoods')
                            : tGame('game.trade.noBuyer')
                        : `${side === 'buy' ? tGame('game.trade.buy') : tGame('game.trade.sell')} ${quantity} · ${total(row)} ◈`
                }}
            </GameButton>
        </div>
    </section>
</template>
<style scoped>
.city-market {
    display: grid;
    gap: 8px;
    max-height: 55vh;
    overflow: auto;
}
.market-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
}
.market-controls label {
    display: flex;
    align-items: center;
    gap: 5px;
}
input {
    width: 52px;
}
.market-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid #566273;
    padding: 5px 0;
}
.market-row__item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    overflow-wrap: anywhere;
}
small {
    display: block;
    font-size: 10px;
    opacity: 0.8;
}
</style>
