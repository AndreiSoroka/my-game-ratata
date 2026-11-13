<script setup lang="ts">
import type { CharacterSnapshot, GameEventPayload, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { chatDuration } from '../runtime/chatInput'
import type { RatataGame } from '../runtime/ratataGame'
import { returnFromSpeech } from './dialogueSpeechKeys'
import { speechBubbleId } from './speechReceipts'
const props = defineProps<{
    game?: RatataGame
    snapshot?: WorldSnapshot
    player: CharacterSnapshot
}>()
const ambient = ref<{ id: string; receipt: string | number; text: string; until: number }[]>([])
const frame = ref(0)
const heights = ref(new Map<string, number>())
const elements = new Map<string, HTMLElement>()
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
        })
    return entries.flatMap((entry) => {
        const anchor = props.game?.projectCharacter(entry.id)
        const character = props.snapshot?.characters.find((candidate) => candidate.id === entry.id)
        if (!anchor || !character) return []
        const width = Math.min(360, anchor.width - 24)
        const x = Math.max(12, Math.min(anchor.width - width - 12, anchor.x - width / 2))
        const height = heights.value.get(speechBubbleId(entry.id, entry.receipt)) ?? 0
        const y = Math.max(12, Math.min(anchor.height - height - 12, anchor.y - height - 20))
        return [
            {
                ...entry,
                name: character.nickname,
                active: entry.id === conversation?.npcId,
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
        },
    ].slice(-8)
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
defineExpose({ receive, clear })
</script>
<template>
    <div class="speech-layer">
        <article
            v-for="bubble in bubbles"
            :id="speechBubbleId(bubble.id, bubble.receipt)"
            :key="speechBubbleId(bubble.id, bubble.receipt)"
            :ref="(element) => bindBubble(speechBubbleId(bubble.id, bubble.receipt), element)"
            class="speech-bubble"
            :style="bubble.style"
            :aria-label="bubble.name"
            :aria-live="bubble.active ? 'polite' : 'off'"
            aria-atomic="true"
        >
            <strong>{{ bubble.name }}</strong>
            <div
                :tabindex="bubble.active ? 0 : -1"
                class="speech-text"
                @keydown.stop="returnFromSpeech($event, speechBubbleId(bubble.id, bubble.receipt))"
                @keyup.stop
            >
                {{ bubble.text }}
            </div>
        </article>
    </div>
</template>
<style scoped>
.speech-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 8;
}
.speech-bubble {
    position: absolute;
    background: var(--rpg-speech, #f5efe3);
    color: #263126;
    border: 2px solid var(--rpg-brass, #b09664);
    border-radius: 0;
    padding: 11px 13px;
    box-sizing: border-box;
    box-shadow: 3px 3px 0 #15211880;
    pointer-events: auto;
    font:
        14px/1.5 system-ui,
        sans-serif;
}
.speech-bubble::after {
    content: '';
    position: absolute;
    left: calc(var(--speech-tail) - 7px);
    bottom: -10px;
    width: 14px;
    height: 14px;
    background: var(--rpg-speech, #f5efe3);
    border-right: 2px solid var(--rpg-brass, #b09664);
    border-bottom: 2px solid var(--rpg-brass, #b09664);
    transform: rotate(45deg);
}
strong {
    display: block;
    color: #655431;
    font:
        14px/1.2 'Pixelify Sans',
        system-ui;
    margin-bottom: 3px;
}
.speech-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: min(28vh, 220px);
    overflow: auto;
}
.speech-text:focus-visible {
    outline: 2px solid #7c693c;
    outline-offset: 3px;
}
</style>
