<script setup lang="ts">
import './socialWindows.css'

import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { activeQuests } from './activeQuests'
import ExchangeWindow from './ExchangeWindow.vue'
import QuestOfferWindow from './QuestOfferWindow.vue'
import QuestTurnInWindow from './QuestTurnInWindow.vue'
import WhisperWindow from './WhisperWindow.vue'

const props = defineProps<{
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    connected: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage]; open: []; quests: [] }>()
const whisperTarget = ref<string>()
const exchangeId = ref<string>()
const hiddenExchangeId = ref<string>()
const hints = ref<HTMLElement>()
const social = computed(() => props.snapshot.social)
const whisper = computed(() => social.value?.whisper)
const exchange = computed(() => social.value?.exchange)
const available = computed(() => props.player.alive && props.connected)
const questCount = computed(() => activeQuests(props.snapshot).length)
const turnInVisible = computed(() => available.value && Boolean(social.value?.questTurnIn))
const questOfferVisible = computed(
    () => available.value && !turnInVisible.value && Boolean(social.value?.questOffer)
)
const exchangeVisible = computed(
    () =>
        available.value &&
        !turnInVisible.value &&
        !questOfferVisible.value &&
        exchange.value &&
        exchange.value.status !== 'completed' &&
        hiddenExchangeId.value !== exchange.value.id &&
        (exchangeId.value === exchange.value.id || !exchange.value.incoming)
)
const whisperVisible = computed(
    () =>
        available.value &&
        !turnInVisible.value &&
        !questOfferVisible.value &&
        !exchangeVisible.value &&
        Boolean(whisper.value) &&
        whisper.value?.partnerId === whisperTarget.value
)
const hasOpenWindow = computed(() =>
    Boolean(
        exchangeVisible.value ||
        whisperVisible.value ||
        questOfferVisible.value ||
        turnInVisible.value
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
watch(
    () => props.player.id,
    () => {
        whisperTarget.value = undefined
        exchangeId.value = undefined
        hiddenExchangeId.value = undefined
    }
)
watch(
    () => `${exchange.value?.id ?? ''}:${exchange.value?.status ?? ''}`,
    () => {
        if (exchange.value?.status !== 'completed') return
        hiddenExchangeId.value = exchange.value.id
        exchangeId.value = undefined
        whisperTarget.value = undefined
        restoreFocus()
    },
    { immediate: true }
)
watch(questOfferVisible, (visible) => {
    if (visible) {
        prepare()
        const issuerId = social.value?.questOffer?.issuerId
        if (issuerId && whisper.value?.partnerId !== issuerId)
            emit('command', { type: 'whisper_open', targetId: issuerId })
    }
})
watch(
    () => social.value?.questTurnIn?.id,
    (id) => {
        if (id && available.value) {
            whisperTarget.value = undefined
            prepare()
        } else restoreFocus()
    }
)
watch(available, (value) => {
    if (!value) whisperTarget.value = undefined
})
let resize: ResizeObserver | undefined
let container: HTMLElement | undefined
watch(
    hints,
    (element) => {
        resize?.disconnect()
        container?.style.removeProperty('--ratata-social-hints-height')
        container = element?.closest<HTMLElement>('.game-screen') ?? undefined
        const measure = (): void => {
            if (container && element)
                container.style.setProperty(
                    '--ratata-social-hints-height',
                    `${Math.ceil(element.getBoundingClientRect().height)}px`
                )
        }
        measure()
        if (element && typeof ResizeObserver !== 'undefined') {
            resize = new ResizeObserver(measure)
            resize.observe(element)
        }
    },
    { flush: 'post' }
)
onBeforeUnmount(() => {
    resize?.disconnect()
    container?.style.removeProperty('--ratata-social-hints-height')
})
defineExpose({ command, hasOpenWindow })
</script>
<template>
    <div v-if="available" ref="hints" class="social-hints" aria-label="Личные разговоры и квесты">
        <button
            v-if="
                whisper &&
                !whisperVisible &&
                !exchangeVisible &&
                !questOfferVisible &&
                !turnInVisible
            "
            type="button"
            @click="showWhisper"
        >
            Шёпот: {{ whisper.partnerName }}{{ whisper.messages.length ? ' · новые реплики' : '' }}
        </button>
        <button
            v-if="
                exchange &&
                !exchangeVisible &&
                !questOfferVisible &&
                !turnInVisible &&
                ['invited', 'active'].includes(exchange.status)
            "
            type="button"
            @click="showExchange"
        >
            {{ exchange.partnerName }}:
            {{ exchange.status === 'invited' ? 'приглашение к обмену' : 'обмен' }}
        </button>
        <button type="button" @click="emit('quests')">Квесты · {{ questCount }}</button>
    </div>
    <QuestTurnInWindow
        v-if="turnInVisible && social?.questTurnIn"
        :key="social.questTurnIn.id"
        :prompt="social.questTurnIn"
        :server-time="snapshot.serverTime"
        @command="command"
    />
    <QuestOfferWindow
        v-else-if="questOfferVisible && social?.questOffer"
        :key="social.questOffer.id"
        :offer="social.questOffer"
        :characters="characters"
        :server-time="snapshot.serverTime"
        :player-id="player.id"
        :conversation="whisper"
        :occupied="
            Boolean(
                snapshot.party?.activeJob &&
                ['active', 'ready', 'reward_missing'].includes(snapshot.party.activeJob.status)
            ) ||
            Boolean(
                social.quest && ['active', 'ready', 'reward_missing'].includes(social.quest.status)
            )
        "
        @command="command"
    />
    <ExchangeWindow
        v-else-if="exchangeVisible && exchange"
        :exchange="exchange"
        :player="player"
        :gold="snapshot.adventure?.gold ?? 0"
        :conversation="whisper"
        @close="closeExchange"
        @command="command"
    />
    <WhisperWindow
        v-else-if="whisperVisible && whisper"
        :conversation="whisper"
        :player-id="player.id"
        @close="closeWhisper"
        @command="command"
    />
</template>
