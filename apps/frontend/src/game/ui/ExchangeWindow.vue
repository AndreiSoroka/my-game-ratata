<script setup lang="ts">
import type {
    CharacterSnapshot,
    ClientMessage,
    ExchangeSnapshot,
    WhisperSnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import {
    type ExchangeDraftPresentation,
    type ExchangePrimitives,
    ExchangeWindow as ExchangeWindowView,
} from '@/entities/exchanges'
import { tGame } from '@/shared/lib/i18n'

import ItemIcon from './ItemIcon.vue'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import PrivateConversation from './PrivateConversation.vue'
import SocialWindow from './SocialWindow.vue'
import TradeGoldEditor from './TradeGoldEditor.vue'
import TradeItemEditor from './TradeItemEditor.vue'
import { useExchangeDraft } from './useExchangeDraft'

const props = defineProps<{
    exchange: ExchangeSnapshot
    player: CharacterSnapshot
    gold: number
    conversation?: WhisperSnapshot | null
}>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const draft = useExchangeDraft(props, (message) => emit('command', message))
const primitives: ExchangePrimitives = {
    button: GameButton,
    frame: GameFrame,
    itemIcon: ItemIcon,
}
const draftPresentation = computed<ExchangeDraftPresentation>(() => ({
    editing: draft.editing.value,
    withdrawing: Boolean(draft.withdrawing.value),
    confirming: Boolean(draft.confirming.value),
    error: draft.error.value,
    valid: draft.valid.value,
    pending: Boolean(draft.pending.value),
    dirty: draft.dirty.value,
    empty: draft.empty.value,
    canConfirm: draft.canConfirm.value,
}))

function restart(): void {
    emit('command', { type: 'exchange_invite', targetId: props.exchange.partnerId })
}
</script>

<template>
    <SocialWindow
        :title="tGame('game.trade.exchangeWith', { name: exchange.partnerName })"
        layout="exchange"
        @close="emit('close')"
    >
        <ExchangeWindowView
            :exchange="exchange"
            :draft="draftPresentation"
            :partner-available="conversation?.available ?? true"
            :primitives="primitives"
            @all="draft.all"
            @clear="draft.clear"
            @edit="draft.edit"
            @propose="draft.propose"
            @confirm="draft.confirm"
            @close="emit('close')"
            @restart="restart"
        >
            <template v-if="player.inventory.length" #draftItems>
                <TradeItemEditor
                    v-for="item in player.inventory"
                    :key="item.instanceId"
                    :item="item"
                    :available="draft.available.value.get(item.instanceId) ?? 0"
                    :selected="draft.quantities.value[item.instanceId] ?? 0"
                    @change="draft.change(item.instanceId, $event)"
                />
            </template>
            <template #draftGold>
                <TradeGoldEditor
                    :selected="draft.gold.value"
                    :available="draft.availableGold.value"
                    @change="draft.changeGold"
                />
            </template>
        </ExchangeWindowView>
        <template v-if="conversation?.partnerId === exchange.partnerId" #below>
            <PrivateConversation
                :conversation="conversation"
                :player-id="player.id"
                @command="emit('command', $event)"
            />
        </template>
    </SocialWindow>
</template>
