<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, DeityId } from '@my-game-ratata/contracts'
import { computed } from 'vue'
const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const patron = computed(() => props.player.progression?.deity)
const shrine = computed(() =>
    props.characters.find(
        (character) =>
            character.id !== props.player.id &&
            character.alive &&
            character.faction === props.player.faction &&
            (character.heroClass === 'cleric' ||
                character.tags.some((tag) => tag === 'cleric' || tag === 'shrine')) &&
            Math.hypot(
                character.position.x - props.player.position.x,
                character.position.y - props.player.position.y
            ) <= 64
    )
)
const deities: { id: DeityId; label: string }[] = [
    { id: 'hearth', label: 'Очаг · исцеление' },
    { id: 'road', label: 'Дорога · энергия' },
    { id: 'lantern', label: 'Фонарь · мана' },
    { id: 'grave', label: 'Хранитель Праха · нежить' },
]
const moods = { benevolent: 'Благосклонен', neutral: 'Спокоен', wrathful: 'Разгневан' }
function choose(deityId: DeityId): void {
    if (shrine.value) emit('command', { type: 'choose_deity', deityId, targetId: shrine.value.id })
}
</script>
<template>
    <div v-if="patron" class="faith-knowledge">
        <p class="faith-patron">
            <strong>{{ patron.name }}</strong> · {{ patron.domain }}
        </p>
        <p class="faith-omen">{{ patron.omen }}</p>
        <div class="faith-secrets">
            <span v-if="patron.mood !== null">{{ moods[patron.mood] }}</span>
            <span v-if="patron.successChance !== null"
                >Шанс ответа: {{ Math.round(patron.successChance * 100) }}%</span
            >
            <span v-if="patron.changesInMs !== null"
                >Перемена через {{ Math.ceil(patron.changesInMs / 1000) }} сек.</span
            >
        </div>
        <p>
            Выберите цель: Shift+T — союзник, F — себя. Назначьте молитву через Shift+1–4. Слот
            показывает дар, цель, цену и возможную карающую волну до применения.
        </p>
        <details class="faith-patrons">
            <summary>Сменить покровителя</summary>
            <div>
                <button
                    v-for="deity in deities"
                    :key="deity.id"
                    type="button"
                    :aria-pressed="patron.id === deity.id"
                    :disabled="!player.alive || !shrine || patron.id === deity.id"
                    @click="choose(deity.id)"
                >
                    {{ deity.label }}
                </button>
            </div>
            <small
                >{{
                    shrine ? `У обряда: ${shrine.nickname}` : 'Подойдите к клирику или святилищу.'
                }}
                Очаг воскрешает живые виды, Хранитель Праха — нежить. Выберите цель и назначьте
                молитву на 1–4.</small
            >
        </details>
    </div>
</template>
