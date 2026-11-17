<script setup lang="ts">
import './socialWindows.css'

import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import ExchangeWindow from './ExchangeWindow.vue'
import NpcQuestWindow from './NpcQuestWindow.vue'
import QuestOfferWindow from './QuestOfferWindow.vue'
import WhisperWindow from './WhisperWindow.vue'

const props = defineProps<{
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    connected: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage]; open: [] }>()
const whisperTarget = ref<string>()
const exchangeId = ref<string>()
const hiddenExchangeId = ref<string>()
const questOpen = ref(false)
const social = computed(() => props.snapshot.social)
const whisper = computed(() => social.value?.whisper)
const exchange = computed(() => social.value?.exchange)
const available = computed(() => props.player.alive && props.connected)
const exchangeVisible = computed(
    () =>
        available.value &&
        exchange.value &&
        hiddenExchangeId.value !== exchange.value.id &&
        (exchangeId.value === exchange.value.id || !exchange.value.incoming)
)
const whisperVisible = computed(
    () =>
        available.value &&
        !exchangeVisible.value &&
        Boolean(whisper.value) &&
        whisper.value?.partnerId === whisperTarget.value
)
const questOfferVisible = computed(() => available.value && Boolean(social.value?.questOffer))
const hasOpenWindow = computed(() =>
    Boolean(
        exchangeVisible.value ||
        whisperVisible.value ||
        questOfferVisible.value ||
        (questOpen.value && social.value?.quest)
    )
)
function prepare(): void {
    emit('open')
    emit('command', { type: 'release_input' })
}
function command(message: ClientMessage): void {
    if (message.type === 'whisper_open') {
        whisperTarget.value = message.targetId
        prepare()
    }
    if (message.type === 'exchange_invite') prepare()
    emit('command', message)
}
function showWhisper(): void {
    whisperTarget.value = whisper.value?.partnerId
    prepare()
}
function showExchange(): void {
    exchangeId.value = exchange.value?.id
    hiddenExchangeId.value = undefined
    prepare()
}
function restoreFocus(): void {
    void nextTick(() => document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus())
}
function closeWhisper(): void {
    whisperTarget.value = undefined
    emit('command', { type: 'whisper_close' })
    restoreFocus()
}
function closeExchange(): void {
    const current = exchange.value
    hiddenExchangeId.value = current?.id
    exchangeId.value = undefined
    if (current && ['invited', 'active'].includes(current.status))
        emit('command', { type: 'exchange_cancel', exchangeId: current.id })
    restoreFocus()
}
function showQuest(): void {
    questOpen.value = true
    prepare()
}
function closeQuest(): void {
    questOpen.value = false
    restoreFocus()
}
watch(
    () => props.player.id,
    () => {
        whisperTarget.value = undefined
        exchangeId.value = undefined
        hiddenExchangeId.value = undefined
        questOpen.value = false
    }
)
watch(questOfferVisible, (visible) => {
    if (visible) prepare()
})
watch(available, (value) => {
    if (!value) {
        whisperTarget.value = undefined
        questOpen.value = false
    }
})
defineExpose({ command, hasOpenWindow })
</script>
<template>
    <div v-if="available" class="social-hints" aria-label="Личные разговоры и договоры">
        <button
            v-if="whisper && !whisperVisible && !exchangeVisible"
            type="button"
            @click="showWhisper"
        >
            Шёпот: {{ whisper.partnerName }}{{ whisper.messages.length ? ' · новые реплики' : '' }}
        </button>
        <button
            v-if="exchange && !exchangeVisible && ['invited', 'active'].includes(exchange.status)"
            type="button"
            @click="showExchange"
        >
            {{ exchange.partnerName }}:
            {{ exchange.status === 'invited' ? 'приглашение к обмену' : 'обмен' }}
        </button>
        <button v-if="social?.quest && !questOpen" type="button" @click="showQuest">
            Договор: {{ social.quest.title }}
        </button>
    </div>
    <WhisperWindow
        v-if="whisperVisible && whisper"
        :conversation="whisper"
        :player-id="player.id"
        @close="closeWhisper"
        @command="command"
    />
    <ExchangeWindow
        v-if="exchangeVisible && exchange"
        :exchange="exchange"
        :player="player"
        :gold="snapshot.adventure?.gold ?? 0"
        :conversation="whisper"
        @close="closeExchange"
        @command="command"
    />
    <NpcQuestWindow
        v-if="questOpen && social?.quest && available"
        :quest="social.quest"
        :characters="characters"
        @close="closeQuest"
        @command="command"
    />
    <QuestOfferWindow
        v-if="questOfferVisible && social?.questOffer"
        :key="`${social.questOffer.id}:${social.questOffer.revision}`"
        :offer="social.questOffer"
        :characters="characters"
        :server-time="snapshot.serverTime"
        :occupied="
            Boolean(snapshot.party?.activeJob && snapshot.party.activeJob.status !== 'completed') ||
            Boolean(
                social.quest && ['active', 'ready', 'reward_missing'].includes(social.quest.status)
            )
        "
        @command="command"
    />
</template>
