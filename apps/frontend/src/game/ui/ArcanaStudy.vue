<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'
const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const selectedId = ref('')
const teacher = computed(() => nearby.value.find((character) => character.tags.includes('scholar')))
const nearby = computed(() =>
    props.characters.filter(
        (character) =>
            character.id !== props.player.id &&
            character.alive &&
            character.faction === props.player.faction &&
            Math.hypot(
                character.position.x - props.player.position.x,
                character.position.y - props.player.position.y
            ) <= 64
    )
)
const students = computed(() =>
    nearby.value.filter(
        (character) =>
            !character.progression?.skills.some(
                (skill) => skill.id === 'fireball' && skill.unlocked
            )
    )
)
const student = computed(
    () => students.value.find((character) => character.id === selectedId.value) ?? students.value[0]
)
const canTeach = computed(
    () =>
        props.player.progression?.skills.some(
            (skill) => skill.id === 'fireball' && skill.unlocked
        ) ?? false
)
const chaptersRead = computed(() => props.player.progression?.magicChaptersRead ?? 0)
const chaptersTotal = computed(() => props.player.progression?.magicChaptersTotal ?? 3)
function study(): void {
    if (teacher.value) emit('command', { type: 'study_magic', targetId: teacher.value.id })
}
function teach(): void {
    if (student.value) emit('command', { type: 'teach_magic', targetId: student.value.id })
}
</script>
<template>
    <div class="arcana-study">
        <div class="knowledge-action">
            <button
                type="button"
                :disabled="!player.alive || !teacher || chaptersRead >= chaptersTotal"
                @click="study"
            >
                Читать главу · {{ chaptersRead }}/{{ chaptersTotal }}
            </button>
            <small>{{
                chaptersRead >= chaptersTotal
                    ? 'Все главы изучены. Передайте знания другому.'
                    : teacher
                      ? `Книга у ${teacher.nickname}`
                      : 'Книгу можно читать рядом с учёным.'
            }}</small>
        </div>
        <div v-if="canTeach" class="knowledge-target">
            <label for="magic-student">Ученик рядом</label>
            <select
                id="magic-student"
                :value="student?.id ?? ''"
                @change="selectedId = ($event.target as HTMLSelectElement).value"
            >
                <option v-if="!students.length" value="">Некого обучать</option>
                <option v-for="candidate in students" :key="candidate.id" :value="candidate.id">
                    {{ candidate.nickname }}
                </option>
            </select>
        </div>
        <div v-if="canTeach" class="knowledge-action">
            <button type="button" :disabled="!player.alive || !student" @click="teach">
                Научить огненному шару</button
            ><small>Знание получает ученик, практика — наставник.</small>
        </div>
    </div>
</template>
