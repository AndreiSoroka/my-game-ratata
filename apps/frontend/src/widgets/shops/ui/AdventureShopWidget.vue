<script setup lang="ts">
import type {
    AdventureShopOffer,
    AdventureSnapshot,
    AdventureTradeItemId,
    MarketSide,
    MarketSnapshot,
} from '@my-game-ratata/contracts'

import { AdventureShop, CityMarket, type MarketTradeSelection } from '@/entities/shops'
import { tGame } from '@/shared/lib/i18n'
import { darkPanelButtonColors, DarkWindowFrame, UiButton } from '@/shared/ui/common'

defineProps<{
    title: string
    offers: readonly AdventureShopOffer[]
    gold: number
    blockedReason?: string | undefined
    market?: MarketSnapshot | undefined
    marketSide?: MarketSide | undefined
    marketSides?: readonly MarketSide[] | undefined
    marketInventory?: AdventureSnapshot['marketInventory']
}>()
defineSlots<{ navigation?: () => unknown }>()
const emit = defineEmits<{
    buy: [itemId: AdventureTradeItemId]
    trade: [selection: MarketTradeSelection]
    close: []
}>()
</script>

<template>
    <DarkWindowFrame class="adventure-shop-window" :title="title" @close="emit('close')">
        <template v-if="$slots.navigation" #summary>
            <slot name="navigation" />
        </template>
        <AdventureShop
            :offers="offers"
            :gold="gold"
            :blocked-reason="blockedReason"
            @buy="emit('buy', $event)"
        >
            <template v-if="market" #market>
                <CityMarket
                    :market="market"
                    :gold="gold"
                    :blocked="Boolean(blockedReason)"
                    :initial-side="marketSide"
                    :sides="marketSides"
                    :inventory="marketInventory"
                    @trade="emit('trade', $event)"
                />
            </template>
        </AdventureShop>
        <template #actions>
            <UiButton
                data-dialogue-action
                appearance="panel"
                panel="panel-001"
                :colors="darkPanelButtonColors"
                @click="emit('close')"
            >
                {{ tGame('game.conversation.backConversation') }}
            </UiButton>
        </template>
    </DarkWindowFrame>
</template>
