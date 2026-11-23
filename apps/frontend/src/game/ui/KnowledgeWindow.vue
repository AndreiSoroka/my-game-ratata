<script setup lang="ts">
import './knowledgeWindow.css'

import {
    canLearnDiscipline,
    type CharacterSnapshot,
    type ClientMessage,
    type ConstellationId,
    type SpellSkillId,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { abilityName, characterName, masteryName, tGame } from '@/shared/lib/i18n'

import AbilityKnowledge from './AbilityKnowledge.vue'
import { abilityUsage } from './abilityUsage'
import ArcanaStudy from './ArcanaStudy.vue'
import FaithKnowledge from './FaithKnowledge.vue'
import { displayMasteryExperience, masteryProgressPercent } from './masteryPresentation'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import GameSelect from './primitives/GameSelect.vue'

const props = defineProps<{
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    embedded?: boolean
    constellationId?: ConstellationId
}>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const targetId = ref('')
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
const target = computed(
    () => enemies.value.find((character) => character.id === targetId.value) ?? enemies.value[0]
)
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
function distance(character: CharacterSnapshot): number {
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
    if (target.value) emit('command', { type: 'cast_spell', skillId, targetId: target.value.id })
}
function learnFireball(): void {
    if (teacher.value && canLearnMagic.value)
        emit('command', { type: 'learn_skill', skillId: 'fireball', targetId: teacher.value.id })
}
</script>
<template>
    <section
        :class="
            embedded ? 'embedded-knowledge' : 'adventure-window adventure-knowledge game-frame-host'
        "
        :role="embedded ? undefined : 'dialog'"
        :aria-modal="embedded ? undefined : false"
        :aria-label="tGame('game.knowledge.heroKnowledge')"
    >
        <GameFrame v-if="!embedded" variant="window" />
        <header v-if="!embedded" class="adventure-window__header">
            <span>{{ tGame('game.knowledge.knowledgeConstellations') }}</span
            ><GameButton
                icon
                :aria-label="tGame('game.knowledge.closeKnowledge')"
                @click="emit('close')"
                >×</GameButton
            >
        </header>
        <p v-if="!embedded" class="knowledge-intro">
            {{ tGame('game.knowledge.meaningfulActionsEarnExperienceLevels') }}
        </p>
        <AbilityKnowledge
            :player="player"
            :characters="characters"
            :constellation-id="constellationId"
            @command="emit('command', $event)"
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
                <label :for="`practice-${mastery.id}`"
                    >{{ tGame('game.knowledge.experience') }}
                    <span
                        >{{ displayMasteryExperience(mastery.experience) }} /
                        {{ displayMasteryExperience(mastery.experienceToNext) }}</span
                    ></label
                >
                <progress
                    :id="`practice-${mastery.id}`"
                    :value="masteryProgressPercent(mastery)"
                    max="100"
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
                @command="emit('command', $event)"
            />
            <template v-if="mastery.id === 'magic'">
                <ArcanaStudy
                    :player="player"
                    :characters="characters"
                    @command="emit('command', $event)"
                />
                <div v-if="!player.abilities?.known.includes('fireball')" class="knowledge-action">
                    <GameButton
                        :disabled="!player.alive || !teacher || !canLearnMagic || magicLevel < 3"
                        @click="learnFireball"
                    >
                        {{ tGame('game.knowledge.learnFirebolt') }}
                    </GameButton>
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
                    <label for="spell-target">{{ tGame('game.knowledge.spellTarget') }}</label
                    ><GameSelect
                        id="spell-target"
                        :value="target?.id ?? ''"
                        @change="targetId = ($event.target as HTMLSelectElement).value"
                    >
                        <option v-if="!enemies.length" value="">
                            {{ tGame('game.knowledge.noEnemiesNearby') }}
                        </option>
                        <option v-for="enemy in enemies" :key="enemy.id" :value="enemy.id">
                            {{ characterName(enemy.id, enemy.nickname) }}
                        </option>
                    </GameSelect>
                </div>
                <div v-for="id in knownSpells" :key="id" class="knowledge-action">
                    <GameButton :disabled="!canCast(id)" @click="cast(id)">
                        {{ abilityName(id) }} · {{ abilityUsage(player, id).mana }} MP
                    </GameButton>
                </div>
            </template>
        </article>
    </section>
</template>
<style scoped>
.embedded-knowledge {
    margin-top: 20px;
    color: #dbe3d8;
}
.embedded-knowledge :deep(button),
.embedded-knowledge :deep(select) {
    min-height: 36px;
    padding: 7px 12px;
    border: 1px solid transparent;
    cursor: pointer;
}
.embedded-knowledge :deep(button:disabled) {
    opacity: 0.45;
    cursor: default;
}
</style>
