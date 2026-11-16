<script setup lang="ts">
import './knowledgeWindow.css'
import './companionWindow.css'

import type {
    CharacterSnapshot,
    ClientMessage,
    CompanionOrder,
    CompanionRequest,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import SoulBadge from './SoulBadge.vue'

const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const selectedId = ref('')
const message = ref('')
const residents = computed(() =>
    props.characters.filter(
        (character) =>
            character.id !== props.player.id &&
            character.alive &&
            character.faction === props.player.faction &&
            (distance(character) <= 160 || character.soul?.companion?.leaderId === props.player.id)
    )
)
const selected = computed(
    () =>
        residents.value.find((character) => character.id === selectedId.value) ?? residents.value[0]
)
const inReach = computed(
    () => props.player.alive && selected.value !== undefined && distance(selected.value) <= 64
)
const orders: Record<CompanionOrder, string> = {
    idle: 'Занят своими делами',
    follow: 'Идёт за спутником',
    guard: 'Охраняет место',
    help: 'Помогает в бою',
}
const requests: { id: CompanionRequest; label: string }[] = [
    { id: 'follow', label: 'Пойдём вместе' },
    { id: 'help', label: 'Помоги в бою' },
    { id: 'guard', label: 'Охраняй это место' },
    { id: 'dismiss', label: 'Попрощаться' },
]
function distance(character: CharacterSnapshot): number {
    return Math.hypot(
        character.position.x - props.player.position.x,
        character.position.y - props.player.position.y
    )
}
function request(request: CompanionRequest): void {
    if (!selected.value) return
    emit('command', {
        type: 'companion_request',
        targetId: selected.value.id,
        request,
        ...(request === 'talk' && message.value.trim() ? { text: message.value.trim() } : {}),
    })
    if (request === 'talk') message.value = ''
}
</script>
<template>
    <section
        class="adventure-window adventure-companions"
        role="dialog"
        aria-modal="false"
        aria-label="Спутники и жители"
    >
        <header class="adventure-window__header">
            <span>СПУТНИКИ И ЖИТЕЛИ</span>
            <button type="button" aria-label="Закрыть спутников" @click="emit('close')">×</button>
        </header>
        <p class="companion-intro">
            У жителей разные привычки и условия помощи. Сначала познакомьтесь и попросите о помощи.
            Речь и готовность сражаться — разные качества.
        </p>
        <div class="companion-roster" aria-label="Жители поблизости">
            <button
                v-for="character in residents"
                :key="character.id"
                type="button"
                :aria-pressed="selected?.id === character.id"
                @click="selectedId = character.id"
            >
                {{ character.nickname }}
            </button>
        </div>
        <p v-if="!selected" class="companion-empty">
            Рядом никого нет. В Новогороде можно встретить принцессу, ветерана, стражника, учёного и
            говорящего слизня.
        </p>
        <template v-if="selected">
            <div class="companion-heading">
                <h2>{{ selected.nickname }}</h2>
                <small>{{ Math.round(distance(selected)) }} шагов</small>
            </div>
            <SoulBadge :soul="selected.soul" />
            <p class="companion-personality">{{ selected.soul?.personality }}</p>
            <dl v-if="selected.soul?.companion" class="companion-status">
                <dt>Сейчас</dt>
                <dd>{{ orders[selected.soul.companion.order] }}</dd>
                <dt>В бою</dt>
                <dd>{{ selected.soul.companion.canFight ? 'Может сражаться' : 'Не сражается' }}</dd>
                <dt v-if="selected.soul.companion.leaderId">Спутник</dt>
                <dd v-if="selected.soul.companion.leaderId">
                    {{
                        selected.soul.companion.leaderId === player.id
                            ? 'Путешествует с вами'
                            : 'Другой путешественник'
                    }}
                </dd>
            </dl>
            <blockquote
                v-if="selected.soul?.companion?.lastReply"
                class="companion-reply"
                aria-live="polite"
            >
                <span>Ответ {{ selected.nickname }}</span
                >{{ selected.soul.companion.lastReply }}
            </blockquote>
            <p v-if="!inReach" class="companion-distance">Подойдите ближе, чтобы поговорить.</p>
            <form
                v-if="selected.soul?.canSpeak"
                class="companion-conversation"
                @submit.prevent="request('talk')"
            >
                <label for="companion-message">Что сказать</label>
                <div>
                    <input
                        id="companion-message"
                        v-model="message"
                        maxlength="100"
                        placeholder="Познакомимся?"
                        autocomplete="off"
                    /><button type="submit" :disabled="!inReach">Поговорить</button>
                </div>
            </form>
            <p v-else class="companion-intro">
                Этот житель не говорит. Его намерения можно понять по действиям.
            </p>
            <div class="companion-requests">
                <button
                    v-for="action in requests"
                    :key="action.id"
                    type="button"
                    :disabled="!inReach"
                    @click="request(action.id)"
                >
                    {{ action.label }}
                </button>
            </div>
            <p class="companion-footnote">
                Просьба не гарантирует согласия. Характер и знакомство влияют на ответ.
            </p>
        </template>
    </section>
</template>
