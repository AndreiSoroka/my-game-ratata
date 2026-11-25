<script setup lang="ts">
import './knowledgeWindow.css'

import {
    canLearnDiscipline,
    type ConstellationId,
    type SpellSkillId,
} from '@my-game-ratata/contracts'
import { computed, useId } from 'vue'

import { abilityName, characterName, masteryName, tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'
import { DarkWindowFrame, GameBar } from '@/shared/ui/common'
import { UiSelect } from '@/shared/ui/common'

import { abilityUsage } from '../model/abilityUsage'
import type {
    CastSpellSelection,
    ChooseDeitySelection,
    LearnAbilitySelection,
} from '../model/knowledgeActions'
import type { KnowledgeParticipant } from '../model/knowledgeParticipant'
import { createKnowledgeSelectionStore } from '../model/knowledgeSelection'
import { displayMasteryExperience, masteryProgressPercent } from '../model/masteryPresentation'
import AbilityKnowledge from './AbilityKnowledge.vue'
import ArcanaStudy from './ArcanaStudy.vue'
import FaithKnowledge from './FaithKnowledge.vue'
const props = defineProps<{
    player: KnowledgeParticipant
    characters: readonly KnowledgeParticipant[]
    embedded?: boolean
    constellationId?: ConstellationId
}>()
const emit = defineEmits<{
    close: []
    learnAbility: [selection: LearnAbilitySelection]
    learnSpell: [teacherId: string]
    castSpell: [selection: CastSpellSelection]
    chooseDeity: [selection: ChooseDeitySelection]
    study: [teacherId: string]
    teach: [studentId: string]
}>()
const inputId = useId()
const targetSelection = createKnowledgeSelectionStore()
const masteries = computed(() =>
    (props.player.progression?.masteries ?? []).filter(
        (entry) => !props.constellationId || entry.id === props.constellationId
    )
)
const magicLevel = computed(
    () => props.player.progression?.masteries.find((entry) => entry.id === 'magic')?.level ?? 0
)
const canLearnMagic = computed(() =>
    canLearnDiscipline(props.player.abilities?.known ?? [], 'magic')
)
const teacher = computed(() =>
    props.characters.find(
        (character) =>
            character.id !== props.player.id &&
            character.alive &&
            character.faction === props.player.faction &&
            character.tags.includes('scholar') &&
            distance(character) <= 64
    )
)
const spells: SpellSkillId[] = ['fireball', 'greater_fireball']
const knownSpells = computed(() =>
    spells.filter((id) => props.player.abilities?.known.includes(id))
)
const enemies = computed(() =>
    props.characters.filter(
        (character) =>
            character.alive &&
            character.faction !== props.player.faction &&
            distance(character) <=
                Math.max(...spells.map((id) => abilityUsage(props.player, id).range))
    )
)
const target = computed(() => targetSelection.current(enemies.value))
const descriptions: Record<ConstellationId, string> = {
    get blade() {
        return tGame('game.knowledge.bladeExperience')
    },
    get magic() {
        return tGame('game.knowledge.magicExperience')
    },
    get prayer() {
        return tGame('game.knowledge.hearthExperience')
    },
    get prayer_road() {
        return tGame('game.knowledge.roadExperience')
    },
    get prayer_lantern() {
        return tGame('game.knowledge.lanternExperience')
    },
    get prayer_grave() {
        return tGame('game.knowledge.ashPrayerExperience')
    },
    get undead() {
        return tGame('game.knowledge.undeadExperience')
    },
    get arrow() {
        return tGame('game.knowledge.arrowExperience')
    },
    get life() {
        return tGame('game.knowledge.lifeExperience')
    },
    get shadow() {
        return tGame('game.knowledge.stealthExperience')
    },
    get theft() {
        return tGame('game.knowledge.theftExperience')
    },
}
function distance(character: KnowledgeParticipant): number {
    return Math.hypot(
        character.position.x - props.player.position.x,
        character.position.y - props.player.position.y
    )
}
function canCast(id: SpellSkillId): boolean {
    return (
        props.player.alive &&
        target.value !== undefined &&
        distance(target.value) <= abilityUsage(props.player, id).range &&
        props.player.resourceChecks?.abilities[id] === 'ready'
    )
}
function cast(skillId: SpellSkillId): void {
    if (target.value) emit('castSpell', { skillId, targetId: target.value.id })
}
function learnFireball(): void {
    if (teacher.value && canLearnMagic.value) emit('learnSpell', teacher.value.id)
}
</script>
<template>
    <section
        :class="embedded ? 'embedded-knowledge' : 'adventure-knowledge'"
        :role="embedded ? undefined : 'dialog'"
        :aria-modal="embedded ? undefined : false"
        :aria-label="tGame('game.knowledge.heroKnowledge')"
    >
        <component
            :is="embedded ? 'div' : DarkWindowFrame"
            v-bind="
                embedded
                    ? {}
                    : {
                          title: tGame('game.knowledge.knowledgeConstellations'),
                          closeLabel: tGame('game.knowledge.closeKnowledge'),
                      }
            "
            @close="emit('close')"
        >
            <p v-if="!embedded" class="knowledge-intro">
                {{ tGame('game.knowledge.meaningfulActionsEarnExperienceLevels') }}
            </p>
            <AbilityKnowledge
                :player="player"
                :characters="characters"
                :constellation-id="constellationId"
                @learn-ability="emit('learnAbility', $event)"
            />
            <article
                v-for="mastery in masteries"
                :key="mastery.id"
                class="knowledge-skill"
                :data-mastery="mastery.id"
            >
                <div class="knowledge-skill__heading">
                    <h2>{{ masteryName(mastery.id) }}</h2>
                    <span>{{ tGame('game.knowledge.lvLabel') }} {{ mastery.level }}</span>
                </div>
                <p>{{ descriptions[mastery.id] }}</p>
                <div class="knowledge-practice">
                    <div
                        class="knowledge-practice__label"
                        :id="`${inputId}-practice-${mastery.id}`"
                    >
                        {{ tGame('game.knowledge.experience') }}
                        <span
                            >{{ displayMasteryExperience(mastery.experience) }} /
                            {{ displayMasteryExperience(mastery.experienceToNext) }}</span
                        >
                    </div>
                    <GameBar
                        :aria-labelledby="`${inputId}-practice-${mastery.id}`"
                        :value="masteryProgressPercent(mastery)"
                        :height="5"
                        color="var(--ui-dark-panel-positive)"
                        track-color="var(--ui-dark-bar-track)"
                        :shadow="false"
                    />
                </div>
                <p>
                    {{ tGame('game.knowledge.conflict')
                    }}{{ ((1 - mastery.conflictMultiplier) * 100).toFixed(1).replace('.', ',')
                    }}{{ tGame('game.knowledge.unusedDiscoveries') }} {{ mastery.pendingOpenings }}
                </p>
                <FaithKnowledge
                    v-if="mastery.id.startsWith('prayer')"
                    :player="player"
                    :characters="characters"
                    @choose-deity="emit('chooseDeity', $event)"
                />
                <template v-if="mastery.id === 'magic'">
                    <ArcanaStudy
                        :player="player"
                        :characters="characters"
                        @study="emit('study', $event)"
                        @teach="emit('teach', $event)"
                    />
                    <div
                        v-if="!player.abilities?.known.includes('fireball')"
                        class="knowledge-action"
                    >
                        <UiButton
                            size="small"
                            :disabled="
                                !player.alive || !teacher || !canLearnMagic || magicLevel < 3
                            "
                            @click="learnFireball"
                        >
                            {{ tGame('game.knowledge.learnFirebolt') }}
                        </UiButton>
                        <small>{{
                            !canLearnMagic
                                ? tGame('game.knowledge.youCannotStudyMagicAfter')
                                : magicLevel < 3
                                  ? tGame('game.knowledge.requiresMagicLevel')
                                  : teacher
                                    ? tGame('game.knowledge.namedTeacher', {
                                          name: characterName(teacher.id, teacher.nickname),
                                      })
                                    : tGame('game.knowledge.approachScholar')
                        }}</small>
                    </div>
                    <div v-if="knownSpells.length" class="knowledge-target">
                        <label :for="inputId">{{ tGame('game.knowledge.spellTarget') }}</label
                        ><UiSelect
                            :border-width="4"
                            :id="inputId"
                            :model-value="target?.id ?? ''"
                            @update:model-value="targetSelection.select"
                        >
                            <option v-if="!enemies.length" value="">
                                {{ tGame('game.knowledge.noEnemiesNearby') }}
                            </option>
                            <option v-for="enemy in enemies" :key="enemy.id" :value="enemy.id">
                                {{ characterName(enemy.id, enemy.nickname) }}
                            </option>
                        </UiSelect>
                    </div>
                    <div v-for="id in knownSpells" :key="id" class="knowledge-action">
                        <UiButton size="small" :disabled="!canCast(id)" @click="cast(id)">
                            {{ abilityName(id) }} · {{ abilityUsage(player, id).mana }} MP
                        </UiButton>
                    </div>
                </template>
            </article>
        </component>
    </section>
</template>
<style scoped>
.embedded-knowledge {
    margin-top: 20px;
    color: var(--ui-dark-panel-text);
}
</style>
