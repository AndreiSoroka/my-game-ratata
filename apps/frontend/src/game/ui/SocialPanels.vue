<script setup lang="ts">
import './socialWindows.css'

import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { ExchangeInvitationWidget } from '@/widgets/exchanges'

import ExchangeWindow from './ExchangeWindow.vue'
import { focusWorldInput } from './keyboardOwnership'
import GameButton from './primitives/GameButton.vue'
import QuestOfferWindow from './QuestOfferWindow.vue'
import QuestTurnInWindow from './QuestTurnInWindow.vue'
import WhisperWindow from './WhisperWindow.vue'

const props = defineProps<{
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    connected: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage]; open: [] }>()
const whisperTarget = ref<string>()
const openedExchangeId = ref<string>()
const hiddenExchangeId = ref<string>()
const hints = ref<HTMLElement>()
const notices = ref<HTMLElement>()
const social = computed(() => props.snapshot.social)
const whisper = computed(() => social.value?.whisper)
const exchange = computed(() => social.value?.exchange)
const available = computed(() => props.player.alive && props.connected)
const turnInVisible = computed(() => available.value && Boolean(social.value?.questTurnIn))
const questOfferVisible = computed(
    () => available.value && !turnInVisible.value && Boolean(social.value?.questOffer)
)
const canActOnInvitation = computed(
    () => available.value && !turnInVisible.value && !questOfferVisible.value
)
const visibleExchange = computed(() => {
    const current = exchange.value
    if (
        canActOnInvitation.value &&
        current &&
        hiddenExchangeId.value !== current.id &&
        (current.status === 'active' ||
            (current.status === 'cancelled' && openedExchangeId.value === current.id))
    )
        return current
    return undefined
})
const whisperVisible = computed(
    () =>
        available.value &&
        !turnInVisible.value &&
        !questOfferVisible.value &&
        !visibleExchange.value &&
        Boolean(whisper.value) &&
        whisper.value?.partnerId === whisperTarget.value
)
const hasOpenWindow = computed(() =>
    Boolean(
        visibleExchange.value ||
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
    emit('command', message)
}
function showWhisper(): void {
    whisperTarget.value = whisper.value?.partnerId
    prepare()
}
function answerInvitation(exchangeId: string, accept: boolean): void {
    const current = exchange.value
    if (
        !canActOnInvitation.value ||
        current?.id !== exchangeId ||
        current.status !== 'invited' ||
        !current.incoming
    )
        return
    emit('command', { type: 'exchange_answer', exchangeId, accept })
    if (!accept) restoreFocus()
}
function cancelInvitation(exchangeId: string): void {
    const current = exchange.value
    if (
        !canActOnInvitation.value ||
        current?.id !== exchangeId ||
        current.status !== 'invited' ||
        current.incoming
    )
        return
    emit('command', { type: 'exchange_cancel', exchangeId })
    restoreFocus()
}
function restoreFocus(): void {
    void nextTick(() => focusWorldInput())
}
function closeWhisper(): void {
    whisperTarget.value = undefined
    emit('command', { type: 'whisper_close' })
    restoreFocus()
}
function closeExchange(): void {
    const current = visibleExchange.value
    hiddenExchangeId.value = current?.id
    openedExchangeId.value = undefined
    if (current?.status === 'active')
        emit('command', { type: 'exchange_cancel', exchangeId: current.id })
    restoreFocus()
}
watch(
    () => props.player.id,
    () => {
        whisperTarget.value = undefined
        openedExchangeId.value = undefined
        hiddenExchangeId.value = undefined
    }
)
watch(
    () => (visibleExchange.value?.status === 'active' ? visibleExchange.value.id : undefined),
    (id) => {
        if (id === undefined || openedExchangeId.value === id) return
        openedExchangeId.value = id
        prepare()
    },
    { immediate: true }
)
watch(
    () => `${exchange.value?.id ?? ''}:${exchange.value?.status ?? ''}`,
    () => {
        if (exchange.value?.status !== 'completed') return
        hiddenExchangeId.value = exchange.value.id
        openedExchangeId.value = undefined
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
watch(
    [notices, hints],
    ([noticePanel, hintPanel], _, onCleanup) => {
        const container = (noticePanel ?? hintPanel)?.closest<HTMLElement>('.game-screen')
        if (!container) return
        const measure = (): void => {
            container.style.setProperty(
                '--ratata-social-notices-height',
                `${Math.ceil(noticePanel?.getBoundingClientRect().height ?? 0)}px`
            )
            container.style.setProperty(
                '--ratata-social-hints-height',
                `${Math.ceil(hintPanel?.getBoundingClientRect().height ?? 0)}px`
            )
        }
        measure()
        const resize =
            typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
        if (noticePanel) resize?.observe(noticePanel)
        if (hintPanel) resize?.observe(hintPanel)
        onCleanup(() => {
            resize?.disconnect()
            container.style.removeProperty('--ratata-social-notices-height')
            container.style.removeProperty('--ratata-social-hints-height')
        })
    },
    { flush: 'post' }
)
defineExpose({ command, hasOpenWindow })
</script>
<template>
    <div
        v-if="available && exchange?.status === 'invited'"
        ref="notices"
        class="social-notices"
        role="group"
        aria-label="Приглашения к торговле"
    >
        <ExchangeInvitationWidget
            :exchange="exchange"
            class="social-notices__invitation"
            :class="{ 'social-notices__invitation--over-whisper': whisperVisible }"
            :inert="!canActOnInvitation || undefined"
            data-game-input-owner
            @pointerdown.stop
            @accept="answerInvitation($event, true)"
            @decline="answerInvitation($event, false)"
            @cancel="cancelInvitation"
        />
    </div>
    <div v-if="available && whisper && !hasOpenWindow" ref="hints" class="social-hints">
        <GameButton variant="success" @click="showWhisper">
            Шёпот: {{ whisper.partnerName }}{{ whisper.messages.length ? ' · новые реплики' : '' }}
        </GameButton>
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
        v-else-if="visibleExchange"
        :key="visibleExchange.id"
        :exchange="visibleExchange"
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
