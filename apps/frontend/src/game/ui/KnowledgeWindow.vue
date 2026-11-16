<script setup lang="ts">
import './knowledgeWindow.css'

import {
    type CharacterSnapshot,
    type ClientMessage,
    type ConstellationId,
    type SpellSkillId,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import AbilityKnowledge from './AbilityKnowledge.vue'
import { abilityUsage } from './abilityUsage'
import ArcanaStudy from './ArcanaStudy.vue'
import FaithKnowledge from './FaithKnowledge.vue'
import { displayMasteryExperience, masteryProgressPercent } from './masteryPresentation'

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
    blade: 'Опыт за полезные удары клинком.',
    magic: 'Опыт за полезные боевые заклинания, защиту Барьером, новые главы и обучение других.',
    prayer: 'Опыт за полезное лечение, очищение могил, Кару и воскрешение. Каждый получатель учитывается отдельно.',
    prayer_road: 'Опыт за восстановление полезно потраченной энергии.',
    prayer_lantern: 'Опыт за восстановление полезно потраченной маны.',
    prayer_grave: 'Опыт за полезное лечение и воскрешение нежити.',
    arrow: 'Опыт за полезные попадания стрелами.',
    life: 'Опыт за учтённые вражеские раны и их восстановление.',
    shadow: 'Опыт за скрытное перемещение рядом с врагами и успешные кражи предметов. C — тихий ход, F — взаимодействие.',
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
    if (teacher.value)
        emit('command', { type: 'learn_skill', skillId: 'fireball', targetId: teacher.value.id })
}
</script>
<template>
    <section
        :class="embedded ? 'embedded-knowledge' : 'adventure-window adventure-knowledge'"
        :role="embedded ? undefined : 'dialog'"
        :aria-modal="embedded ? undefined : false"
        aria-label="Знания героя"
    >
        <header v-if="!embedded" class="adventure-window__header">
            <span>ЗНАНИЯ · СОЗВЕЗДИЯ</span
            ><button type="button" aria-label="Закрыть знания" @click="emit('close')">×</button>
        </header>
        <p v-if="!embedded" class="knowledge-intro">
            Полезные действия дают опыт. Уровни дают открытия звёзд; неиспользованные открытия
            сохраняются. Развитие нескольких ветвей создаёт конфликт.
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
                <h2>{{ mastery.name }}</h2>
                <span>Ур. {{ mastery.level }}</span>
            </div>
            <p>{{ descriptions[mastery.id] }}</p>
            <div class="knowledge-practice">
                <label :for="`practice-${mastery.id}`"
                    >Опыт
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
                Конфликт −{{
                    ((1 - mastery.conflictMultiplier) * 100).toFixed(1).replace('.', ',')
                }}% · Неиспользованных открытий: {{ mastery.pendingOpenings }}
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
                    <button
                        type="button"
                        :disabled="!player.alive || !teacher || magicLevel < 3"
                        @click="learnFireball"
                    >
                        Изучить огненный шар
                    </button>
                    <small>{{
                        magicLevel < 3
                            ? 'Требуется Магия 3.'
                            : teacher
                              ? `Учитель: ${teacher.nickname}`
                              : 'Подойдите к учёному.'
                    }}</small>
                </div>
                <div v-if="knownSpells.length" class="knowledge-target">
                    <label for="spell-target">Цель заклинаний</label
                    ><select
                        id="spell-target"
                        :value="target?.id ?? ''"
                        @change="targetId = ($event.target as HTMLSelectElement).value"
                    >
                        <option v-if="!enemies.length" value="">Врагов поблизости нет</option>
                        <option v-for="enemy in enemies" :key="enemy.id" :value="enemy.id">
                            {{ enemy.nickname }}
                        </option>
                    </select>
                </div>
                <div v-for="id in knownSpells" :key="id" class="knowledge-action">
                    <button type="button" :disabled="!canCast(id)" @click="cast(id)">
                        {{ id === 'fireball' ? 'Огненный шар' : 'Большой огненный шар' }} ·
                        {{ abilityUsage(player, id).mana }} MP
                    </button>
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
    border: 1px solid #788775;
    background: #233a3c;
    color: #eee6cf;
    cursor: pointer;
}
.embedded-knowledge :deep(button:disabled) {
    opacity: 0.45;
    cursor: default;
}
.embedded-knowledge :deep(button:focus-visible),
.embedded-knowledge :deep(select:focus-visible) {
    outline: 2px solid #f0d287;
    outline-offset: 2px;
}
</style>
