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
    ExchangeWindow as ExchangeWindowView,
} from '@/entities/exchanges'
import { useExchangeDraftStore } from '@/entities/exchanges'
import { tGame } from '@/shared/lib/i18n'

import PrivateConversation from './PrivateConversation.vue'
import SocialWindow from './SocialWindow.vue'

const props = defineProps<{
    exchange: ExchangeSnapshot
    player: CharacterSnapshot
    gold: number
    conversation?: WhisperSnapshot | null
}>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const draft = useExchangeDraftStore(props, (message) => emit('command', message))
const draftPresentation = computed<ExchangeDraftPresentation>(() => ({
    items: props.player.inventory.map((item) => ({
        item,
        available: draft.available.value.get(item.instanceId) ?? 0,
        selected: draft.quantities.value[item.instanceId] ?? 0,
    })),
    gold: { available: draft.availableGold.value, selected: draft.gold.value },
    editing: draft.editing.value,
    withdrawing: Boolean(draft.withdrawing.value),
    confirming: Boolean(draft.confirming.value),
    error: draft.error.value,
    valid: draft.valid.value,
    pending: Boolean(draft.pending.value),
    canResubmit: draft.canResubmit.value,
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
            @change-item="draft.change"
            @change-gold="draft.changeGold"
            @all="draft.all"
            @clear="draft.clear"
            @edit="draft.edit"
            @propose="draft.propose"
            @confirm="draft.confirm"
            @close="emit('close')"
            @restart="restart"
        />
        <template v-if="conversation?.partnerId === exchange.partnerId" #below>
            <PrivateConversation
                :conversation="conversation"
                :player-id="player.id"
                @command="emit('command', $event)"
            />
        </template>
    </SocialWindow>
</template>
