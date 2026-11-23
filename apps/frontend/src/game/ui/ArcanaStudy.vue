<script setup lang="ts">
import {
    canLearnDiscipline,
    type CharacterSnapshot,
    type ClientMessage,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { characterName, tGame } from '@/shared/lib/i18n'

import GameButton from './primitives/GameButton.vue'
import GameSelect from './primitives/GameSelect.vue'
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
            !character.abilities?.known.includes('fireball') &&
            canLearnDiscipline(character.abilities?.known ?? [], 'magic')
    )
)
const student = computed(
    () => students.value.find((character) => character.id === selectedId.value) ?? students.value[0]
)
const studentReady = computed(
    () =>
        (student.value?.progression?.masteries.find((entry) => entry.id === 'magic')?.level ?? 0) >=
        3
)
const canTeach = computed(() => props.player.abilities?.known.includes('fireball') ?? false)
const chaptersRead = computed(() => props.player.progression?.magicChaptersRead ?? 0)
const chaptersTotal = computed(() => props.player.progression?.magicChaptersTotal ?? 3)
const canStudy = computed(() => canLearnDiscipline(props.player.abilities?.known ?? [], 'magic'))
function study(): void {
    if (teacher.value && canStudy.value)
        emit('command', { type: 'study_magic', targetId: teacher.value.id })
}
function teach(): void {
    if (student.value) emit('command', { type: 'teach_magic', targetId: student.value.id })
}
</script>
<template>
    <div class="arcana-study">
        <div class="knowledge-action">
            <GameButton
                :disabled="!player.alive || !teacher || !canStudy || chaptersRead >= chaptersTotal"
                @click="study"
            >
                {{ tGame('game.knowledge.readChapter') }} {{ chaptersRead }}/{{ chaptersTotal }}
            </GameButton>
            <small>{{
                !canStudy
                    ? tGame('game.knowledge.youCannotStudyMagicAfter')
                    : chaptersRead >= chaptersTotal
                      ? tGame('game.knowledge.allChaptersRead')
                      : teacher
                        ? tGame('game.knowledge.bookWithTeacher', {
                              name: characterName(teacher.id, teacher.nickname),
                          })
                        : tGame('game.knowledge.readNearScholar')
            }}</small>
        </div>
        <div v-if="canTeach" class="knowledge-target">
            <label for="magic-student">{{ tGame('game.knowledge.studentNearby') }}</label>
            <GameSelect
                id="magic-student"
                :value="student?.id ?? ''"
                @change="selectedId = ($event.target as HTMLSelectElement).value"
            >
                <option v-if="!students.length" value="">
                    {{ tGame('game.knowledge.noOneTeach') }}
                </option>
                <option v-for="candidate in students" :key="candidate.id" :value="candidate.id">
                    {{ characterName(candidate.id, candidate.nickname) }}
                </option>
            </GameSelect>
        </div>
        <div v-if="canTeach" class="knowledge-action">
            <GameButton :disabled="!player.alive || !student || !studentReady" @click="teach">
                {{ tGame('game.knowledge.teachFirebolt') }}</GameButton
            ><small>{{
                student && !studentReady
                    ? tGame('game.knowledge.studentMagicLevel')
                    : tGame('game.knowledge.knowledgeAndExperience')
            }}</small>
        </div>
    </div>
</template>
