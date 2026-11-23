<script setup lang="ts">
import type {
    CharacterSnapshot,
    GameEventPayload,
    GameLocale,
    LocalizedMessage,
    SpeechTranslationServerMessage,
    WorkerActivitySnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { speechDisplayText } from '@/entities/chats'
import { characterName, gameLocale, tGame } from '@/shared/lib/i18n'

import { chatDuration } from '../runtime/chatInput'
import type { RatataGame } from '../runtime/ratataGame'
import { returnFromSpeech } from './dialogueSpeechKeys'
import GameFrame from './primitives/GameFrame.vue'
import { speechBubbleId } from './speechReceipts'
import { useEscapeOwner } from './uiEscapeOwners'
const props = defineProps<{
    game?: RatataGame
    snapshot?: WorldSnapshot
    player: CharacterSnapshot
}>()
const ambient = ref<
    {
        id: string
        receipt: string | number
        text: string
        until: number
        language?: GameLocale | undefined
        textMessage?: LocalizedMessage
        workerActivity?: WorkerActivitySnapshot
    }[]
>([])
const frame = ref(0)
const heights = ref(new Map<string, number>())
const elements = new Map<string, HTMLElement>()
useEscapeOwner({
    priority: 90,
    active: () =>
        document.activeElement instanceof HTMLElement &&
        document.activeElement.closest('.speech-text') !== null,
    escape: () => document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus(),
})
const resize =
    typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver((entries) => {
              for (const entry of entries) measure(entry.target)
          })
function measure(element: Element): void {
    if (!elements.has(element.id)) return
    const height = element.getBoundingClientRect().height
    if (height > 0 && heights.value.get(element.id) !== height)
        heights.value.set(element.id, height)
}
function bindBubble(key: string, value: unknown): void {
    const previous = elements.get(key)
    if (!(value instanceof HTMLElement)) {
        if (previous) resize?.unobserve(previous)
        elements.delete(key)
        heights.value.delete(key)
        return
    }
    if (previous !== value) {
        if (previous) resize?.unobserve(previous)
        elements.set(key, value)
        resize?.observe(value)
    }
    measure(value)
}
onBeforeUnmount(() => {
    resize?.disconnect()
    elements.clear()
})
const timer = window.setInterval(() => {
    frame.value++
    ambient.value = ambient.value.filter((entry) => entry.until > Date.now())
}, 50)
onBeforeUnmount(() => window.clearInterval(timer))
const dialogue = computed(() => props.snapshot?.adventure?.dialogue)
let fallbackReceipt = 0
const received = new Map<string, number>()
watch([() => props.snapshot?.serverEpoch, () => props.player.id], () => {
    received.clear()
    clear()
})
watch(
    () => [dialogue.value?.npcId, dialogue.value?.speechId],
    () => {
        ambient.value = ambient.value.filter((entry) => entry.id !== dialogue.value?.npcId)
        if (dialogue.value?.speechId !== undefined)
            received.set(dialogue.value.npcId, dialogue.value.speechId)
    },
    { immediate: true }
)
const bubbles = computed(() => {
    void frame.value
    const conversation = dialogue.value?.kind !== 'sign' ? dialogue.value : undefined
    const entries = ambient.value.filter((entry) => entry.id !== conversation?.npcId)
    if (conversation)
        entries.push({
            id: conversation.npcId,
            receipt: conversation.speechId ?? 'active',
            text: conversation.text,
            until: Infinity,
            ...(conversation.textMessage === undefined
                ? {}
                : { textMessage: conversation.textMessage }),
            ...(conversation.workerActivity === undefined
                ? {}
                : { workerActivity: conversation.workerActivity }),
        })
    return entries.flatMap((entry) => {
        const anchor = props.game?.projectCharacter(entry.id)
        const character = props.snapshot?.characters.find((candidate) => candidate.id === entry.id)
        if (!anchor || !character) return []
        const width = Math.min(360, anchor.width - 24)
        const x = Math.max(12, Math.min(anchor.width - width - 12, anchor.x - width / 2))
        const height = heights.value.get(speechBubbleId(entry.id, entry.receipt)) ?? 0
        const below = anchor.y - height - 12 < 12 && 'lowerY' in anchor
        const y = Math.max(
            12,
            Math.min(
                anchor.height - height - 12,
                below ? anchor.lowerY + 12 : anchor.y - height - 12
            )
        )
        return [
            {
                ...entry,
                text: speechDisplayText(entry),
                language: entry.textMessage === undefined ? entry.language : gameLocale.value,
                name: characterName(character.id, character.nickname),
                active: entry.id === conversation?.npcId,
                below,
                style: {
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${width}px`,
                    '--speech-tail': `${Math.max(14, Math.min(width - 14, anchor.x - x))}px`,
                },
            },
        ]
    })
})
const typing = computed(() => {
    void frame.value
    const speaking = new Set(bubbles.value.map((bubble) => bubble.id))
    return (props.snapshot?.social?.speechActivity ?? []).flatMap((entry) => {
        if (speaking.has(entry.actorId)) return []
        const actor = props.snapshot?.characters.find((character) => character.id === entry.actorId)
        const anchor = props.game?.projectCharacter(entry.actorId)
        if (!actor?.alive || !anchor) return []
        return [
            {
                ...entry,
                name: characterName(actor.id, actor.nickname),
                style: {
                    left: `${Math.max(14, Math.min(anchor.width - 48, anchor.x - 21))}px`,
                    top: `${Math.max(8, Math.min(anchor.height - 34, anchor.y - 34 >= 8 ? anchor.y - 34 : 'lowerY' in anchor ? anchor.lowerY + 8 : 8))}px`,
                },
            },
        ]
    })
})
function receive(event: GameEventPayload): void {
    if (event.kind !== 'chat' || !event.actorId || !event.text) return
    if (event.targetId && event.targetId !== props.player.id) return
    if (!acceptReceipt(event.actorId, event.speechId)) return
    if (dialogue.value?.npcId === event.actorId) return
    ambient.value = [
        ...ambient.value.filter((entry) => entry.id !== event.actorId),
        {
            id: event.actorId,
            receipt: event.speechId ?? `local-${++fallbackReceipt}`,
            text: event.text,
            until: Date.now() + chatDuration(event.text),
            language: event.language,
            ...(event.textMessage === undefined ? {} : { textMessage: event.textMessage }),
            ...(event.workerActivity === undefined ? {} : { workerActivity: event.workerActivity }),
        },
    ].slice(-8)
}
function translate({ actorId, speechId, locale, text }: SpeechTranslationServerMessage): void {
    const entry = ambient.value.find(
        (speech) =>
            speech.id === actorId && speech.receipt === speechId && speech.until > Date.now()
    )
    if (entry) {
        entry.text = text
        entry.language = locale
    }
}
function acceptReceipt(actorId: string, receipt: number | undefined): boolean {
    if (receipt === undefined) return true
    if (receipt <= (received.get(actorId) ?? -1)) return false
    received.set(actorId, receipt)
    if (received.size > 128) received.delete(received.keys().next().value!)
    return true
}
function clear(): void {
    ambient.value = []
}
defineExpose({ receive, translate, clear })
</script>
<template>
    <div class="speech-layer">
        <div
            v-for="activity in typing"
            :key="`${activity.actorId}:${activity.id}`"
            class="speech-typing game-frame-host"
            :style="activity.style"
            :aria-label="
                tGame(activity.kind === 'thinking' ? 'game.chat.thinking' : 'game.chat.typing', {
                    name: activity.name,
                })
            "
            aria-live="off"
            role="img"
        >
            <GameFrame variant="speech" />
            <span class="speech-typing__dot" aria-hidden="true"></span
            ><span class="speech-typing__dot" aria-hidden="true"></span
            ><span class="speech-typing__dot" aria-hidden="true"></span>
        </div>
        <article
            v-for="bubble in bubbles"
            :id="speechBubbleId(bubble.id, bubble.receipt)"
            :key="speechBubbleId(bubble.id, bubble.receipt)"
            :ref="(element) => bindBubble(speechBubbleId(bubble.id, bubble.receipt), element)"
            class="speech-bubble game-frame-host"
            :class="{ 'speech-bubble--below': bubble.below }"
            :style="bubble.style"
            :aria-label="bubble.name"
            :aria-live="bubble.active ? 'polite' : 'off'"
            aria-atomic="true"
        >
            <GameFrame variant="speech" />
            <strong>{{ bubble.name }}</strong>
            <div
                :tabindex="bubble.active ? 0 : -1"
                :lang="bubble.language"
                class="speech-text"
                @keydown.stop="returnFromSpeech($event, speechBubbleId(bubble.id, bubble.receipt))"
                @keyup.stop
            >
                {{ bubble.text }}
            </div>
        </article>
    </div>
</template>
<style scoped src="./speechBubbles.css"></style>
