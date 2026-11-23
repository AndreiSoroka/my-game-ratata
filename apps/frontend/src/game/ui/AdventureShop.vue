<script setup lang="ts">
import type {
    AdventureDialogue,
    AdventureShopOffer,
    AdventureTradeItemId,
    ClientMessage,
    MarketSnapshot,
} from '@my-game-ratata/contracts'

import { tGame, tLocalized } from '@/shared/lib/i18n'

import CityMarket from './CityMarket.vue'
import GameButton from './primitives/GameButton.vue'

const props = defineProps<{
    dialogue: AdventureDialogue
    shop: AdventureShopOffer[]
    market?: MarketSnapshot | undefined
    gold: number
}>()
const emit = defineEmits<{ command: [message: ClientMessage]; back: [] }>()

function buy(itemId: AdventureTradeItemId): void {
    if (!props.dialogue.tradeBlockedReason) emit('command', { itemId, type: 'trade' })
}
</script>

<template>
    <div class="adventure-shop" :aria-label="tGame('game.conversation.trade')">
        <p v-if="dialogue.tradeBlockedReason" class="trade-refusal" role="status">
            {{ tLocalized(dialogue.tradeBlockedReasonMessage, dialogue.tradeBlockedReason) }}
        </p>
        <CityMarket
            v-if="market"
            :market="market"
            :npc-id="dialogue.npcId"
            :gold="gold"
            :blocked="Boolean(dialogue.tradeBlockedReason)"
            @command="emit('command', $event)"
        />
        <h3 v-if="!market">
            {{ tGame('game.conversation.forJourney') }}
            <span
                >{{ tGame('game.conversation.youHave') }} {{ gold }}
                {{ tGame('game.conversation.gold') }}</span
            >
        </h3>
        <GameButton
            v-for="offer in market ? [] : shop"
            :key="offer.itemId"
            data-dialogue-action
            :disabled="Boolean(dialogue.tradeBlockedReason) || gold < offer.price"
            @click="buy(offer.itemId)"
        >
            <span>{{ tLocalized(offer.labelMessage, offer.label) }}</span
            ><strong>{{ offer.price }} ◈</strong>
        </GameButton>
        <GameButton data-dialogue-action @click="emit('back')">
            {{ tGame('game.conversation.backConversation') }}
        </GameButton>
    </div>
</template>
