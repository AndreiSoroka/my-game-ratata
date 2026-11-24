<script setup lang="ts">
import type { AdventureShopOffer, AdventureTradeItemId } from '@my-game-ratata/contracts'

import { tGame, tLocalized } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { darkPanelButtonColors, ItemSlot, UiButton } from '@/shared/ui/common'

defineProps<{
    offers: readonly AdventureShopOffer[]
    gold: number
    blockedReason?: string | undefined
    buttonAttrs?: Record<string, unknown>
}>()
defineSlots<{ market?: () => unknown }>()
const emit = defineEmits<{ buy: [itemId: AdventureTradeItemId]; back: [] }>()
</script>

<template>
    <section class="adventure-shop" :aria-label="tGame('game.conversation.trade')">
        <p v-if="blockedReason" class="trade-refusal" role="status">{{ blockedReason }}</p>
        <slot name="market">
            <h3 class="adventure-shop__summary">
                {{ tGame('game.conversation.forJourney') }}
                <span>
                    {{ tGame('game.conversation.youHave') }} {{ gold }}
                    {{ tGame('game.conversation.gold') }}
                </span>
            </h3>
            <UiButton
                v-for="offer in offers"
                :key="offer.itemId"
                v-bind="buttonAttrs"
                appearance="panel"
                panel="panel-001"
                :colors="darkPanelButtonColors"
                class="adventure-shop__action"
                :disabled="Boolean(blockedReason) || gold < offer.price"
                @click="emit('buy', offer.itemId)"
            >
                <span class="adventure-shop__offer">
                    <ItemSlot size="compact" :src="itemAssetCatalog[offer.itemId].src" />
                    <span>{{ tLocalized(offer.labelMessage, offer.label) }}</span>
                    <strong>{{ offer.price }} ◈</strong>
                </span>
            </UiButton>
        </slot>
        <UiButton
            v-bind="buttonAttrs"
            appearance="panel"
            panel="panel-001"
            :colors="darkPanelButtonColors"
            class="adventure-shop__action"
            @click="emit('back')"
        >
            {{ tGame('game.conversation.backConversation') }}
        </UiButton>
    </section>
</template>

<style scoped>
.adventure-shop {
    margin-block-start: 18px;
    padding-block-start: 12px;
    border-block-start: 1px solid var(--ui-dark-panel-divider);
    color: var(--ui-dark-panel-text);
}

.adventure-shop__summary {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    margin: 0 0 10px;
    font-size: 14px;
}

.adventure-shop__offer {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding-block: 2px;
}

.adventure-shop__summary span,
.adventure-shop__offer strong {
    color: var(--ui-light-button-selected-edge);
    white-space: nowrap;
}

.adventure-shop__summary span {
    font-size: 11px;
}

.adventure-shop__action {
    --ui-button-panel-padding: 0 4px;
    inline-size: 100%;
    min-block-size: 38px;
    margin-block-start: 5px;
    font-size: 14px;
    font-weight: 600;
    text-align: start;
}

.adventure-shop__action :deep(.ui-button__content) {
    inline-size: 100%;
}
</style>
