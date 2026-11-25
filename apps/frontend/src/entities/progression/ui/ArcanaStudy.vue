<script setup lang="ts">
import './knowledgeWindow.css'

import { canLearnDiscipline } from '@my-game-ratata/contracts'
import { computed, useId } from 'vue'

import { characterName, tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'
import { UiSelect } from '@/shared/ui/common'

import type { KnowledgeParticipant } from '../model/knowledgeParticipant'
import { createKnowledgeSelectionStore } from '../model/knowledgeSelection'
const props = defineProps<{
    player: KnowledgeParticipant
    characters: readonly KnowledgeParticipant[]
}>()
const emit = defineEmits<{ study: [teacherId: string]; teach: [studentId: string] }>()
const studentInputId = useId()
const studentSelection = createKnowledgeSelectionStore()
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
const student = computed(() => studentSelection.current(students.value))
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
    if (teacher.value && canStudy.value) emit('study', teacher.value.id)
}
function teach(): void {
    if (student.value) emit('teach', student.value.id)
}
</script>
<template>
    <div class="arcana-study">
        <div class="knowledge-action">
            <UiButton
                size="small"
                :disabled="!player.alive || !teacher || !canStudy || chaptersRead >= chaptersTotal"
                @click="study"
            >
                {{ tGame('game.knowledge.readChapter') }} {{ chaptersRead }}/{{ chaptersTotal }}
            </UiButton>
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
            <label :for="studentInputId">{{ tGame('game.knowledge.studentNearby') }}</label>
            <UiSelect
                :border-width="4"
                :id="studentInputId"
                :model-value="student?.id ?? ''"
                @update:model-value="studentSelection.select"
            >
                <option v-if="!students.length" value="">
                    {{ tGame('game.knowledge.noOneTeach') }}
                </option>
                <option v-for="candidate in students" :key="candidate.id" :value="candidate.id">
                    {{ characterName(candidate.id, candidate.nickname) }}
                </option>
            </UiSelect>
        </div>
        <div v-if="canTeach" class="knowledge-action">
            <UiButton
                size="small"
                :disabled="!player.alive || !student || !studentReady"
                @click="teach"
            >
                {{ tGame('game.knowledge.teachFirebolt') }}</UiButton
            ><small>{{
                student && !studentReady
                    ? tGame('game.knowledge.studentMagicLevel')
                    : tGame('game.knowledge.knowledgeAndExperience')
            }}</small>
        </div>
    </div>
</template>
