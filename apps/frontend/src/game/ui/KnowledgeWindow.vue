<script setup lang="ts">
import './knowledgeWindow.css'

import {
    type CharacterSnapshot,
    type ClientMessage,
    type SkillBranch,
    type SkillId,
    THEFT_RULES,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import AbilityKnowledge from './AbilityKnowledge.vue'
import ArcanaStudy from './ArcanaStudy.vue'
import FaithKnowledge from './FaithKnowledge.vue'

const props = defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const targetId = ref('')
const skills = computed(() => props.player.progression?.skills ?? [])
const arcanaLevel = computed(() => skills.value.find((skill) => skill.id === 'arcana')?.level ?? 0)
const teacher = computed(() =>
    props.characters.find(
        (character) =>
            character.alive && character.tags.includes('scholar') && distance(character) <= 64
    )
)
const enemies = computed(() =>
    props.characters.filter(
        (character) =>
            character.alive &&
            character.faction !== props.player.faction &&
            distance(character) <= 192
    )
)
const target = computed(
    () => enemies.value.find((character) => character.id === targetId.value) ?? enemies.value[0]
)
const branchLabels: Record<SkillBranch, string> = {
    warfare: 'Воинское дело',
    faith: 'Вера',
    arcana: 'Магия',
    cunning: 'Хитрость',
}
const practicedBranches = computed(
    () =>
        props.player.progression?.practicedBranches
            .map((branch) => branchLabels[branch])
            .join(', ') || 'пока нет'
)
const descriptions: Record<SkillId, string> = {
    stealth:
        'Растёт от движения крадучись рядом с враждебными существами. Безопасная прогулка по городу не даёт практики. C — тихий ход; рывок выдаёт себя громче.',
    theft: `Растёт от настоящих попыток кражи. Подойдите крадучись, нажмите E и выберите цель. Замеченная попытка может вызвать отпор и стражу. За ${String(THEFT_RULES.evidenceMs / 60_000)} минут жертва может подать жалобу: городская стража станет врагом, торговцы откажут. Отпущение у клирика стоит ${String(THEFT_RULES.absolutionGold)} золотых. Чужие вещи заранее не видны.`,

    faith: 'Молитвы укрепляют веру. С опытом знамения раскрывают настроение божества и вероятность его ответа.',
    arcana: 'Понимание магии растёт от чтения конечного числа глав и передачи изученного заклинания ученикам.',
    swordsmanship: 'Практика за успешные удары мечом. Возьмите оружие и вступите в бой.',
    miracles:
        'Практика за принятый дар божества. На 5-м уровне можно воскрешать союзников: Очаг возвращает органические виды, Хранитель Праха — нежить.',
    fireball:
        'Изучите у учёного в Новогороде. Практика за попадания; 10-й уровень открывает следующую ветвь.',
    greater_fireball:
        'Открывается после 10-го уровня огненного шара. Более сильное и дальнее заклинание.',
}
function distance(character: CharacterSnapshot): number {
    return Math.hypot(
        character.position.x - props.player.position.x,
        character.position.y - props.player.position.y
    )
}
function canCast(skillId: SkillId): boolean {
    const cost = skillId === 'greater_fireball' ? 24 : 12
    const range = skillId === 'greater_fireball' ? 192 : 160
    return (
        props.player.alive &&
        target.value !== undefined &&
        distance(target.value) <= range &&
        props.player.resources.mana >= cost
    )
}
function cast(skillId: SkillId): void {
    if (target.value && (skillId === 'fireball' || skillId === 'greater_fireball'))
        emit('command', { type: 'cast_spell', skillId, targetId: target.value.id })
}
function learnFireball(): void {
    if (teacher.value)
        emit('command', { type: 'learn_skill', skillId: 'fireball', targetId: teacher.value.id })
}
</script>

<template>
    <section
        class="adventure-window adventure-knowledge"
        role="dialog"
        aria-modal="false"
        aria-label="Знания героя"
    >
        <header class="adventure-window__header">
            <span>ЗНАНИЯ · ПРАКТИКА МЕНЯЕТ ГЕРОЯ</span>
            <button type="button" aria-label="Закрыть знания" @click="emit('close')">×</button>
        </header>
        <p class="knowledge-intro">
            Любое прошлое, любой путь. Навыки растут от применения, а новые знания открывают
            следующую ступень.
        </p>
        <div class="knowledge-target">
            <label for="spell-target">Цель заклинаний</label>
            <select
                id="spell-target"
                :value="target?.id ?? ''"
                @change="targetId = ($event.target as HTMLSelectElement).value"
            >
                <option v-if="!enemies.length" value="">Врагов поблизости нет</option>
                <option v-for="enemy in enemies" :key="enemy.id" :value="enemy.id">
                    {{ enemy.nickname }} · {{ Math.round(distance(enemy)) }} шагов
                </option>
            </select>
        </div>
        <AbilityKnowledge
            :player="player"
            :characters="characters"
            @command="emit('command', $event)"
        />
        <article
            v-for="skill in skills"
            :key="skill.id"
            class="knowledge-skill"
            :class="{ 'knowledge-skill--locked': !skill.unlocked }"
            :data-skill="skill.id"
        >
            <div class="knowledge-skill__heading">
                <h2>{{ skill.name }}</h2>
                <span>{{ skill.unlocked ? `Ур. ${skill.level} / 10` : 'Не изучено' }}</span>
            </div>
            <div class="knowledge-steps" aria-hidden="true">
                <i
                    v-for="step in 10"
                    :key="step"
                    :class="{ learned: skill.unlocked && step <= skill.level }"
                ></i>
            </div>
            <p>{{ descriptions[skill.id] }}</p>
            <div v-if="skill.unlocked && skill.level < 10" class="knowledge-practice">
                <label :for="`practice-${skill.id}`"
                    >Практика <span>{{ skill.practice }} / {{ skill.practiceToNext }}</span></label
                >
                <progress
                    :id="`practice-${skill.id}`"
                    :value="skill.practice"
                    :max="skill.practiceToNext"
                />
            </div>
            <p v-else-if="skill.unlocked" class="knowledge-mastery">Мастерство достигнуто</p>
            <FaithKnowledge
                v-if="skill.id === 'faith'"
                :player="player"
                :characters="characters"
                @command="emit('command', $event)"
            />
            <ArcanaStudy
                v-else-if="skill.id === 'arcana'"
                :player="player"
                :characters="characters"
                @command="emit('command', $event)"
            />
            <div v-else-if="skill.id === 'fireball' && !skill.unlocked" class="knowledge-action">
                <button
                    type="button"
                    :disabled="!player.alive || !teacher || arcanaLevel < 3"
                    @click="learnFireball"
                >
                    Изучить огненный шар
                </button>
                <small>{{
                    arcanaLevel < 3
                        ? 'Нужна магия 3-го уровня. Изучайте главы у учёного.'
                        : teacher
                          ? `Учитель: ${teacher.nickname}`
                          : 'Подойдите к учёному в Новогороде.'
                }}</small>
            </div>
            <div
                v-else-if="
                    (skill.id === 'fireball' || skill.id === 'greater_fireball') && skill.unlocked
                "
                class="knowledge-action"
            >
                <button type="button" :disabled="!canCast(skill.id)" @click="cast(skill.id)">
                    Сотворить · {{ skill.id === 'greater_fireball' ? 24 : 12 }} MP
                </button>
                <small
                    >{{
                        skill.id === 'greater_fireball'
                            ? 'Дальность 192 · раз в 2 сек.'
                            : 'Дальность 160 · раз в 1 сек.'
                    }}
                    Препятствия закрывают цель.</small
                >
            </div>
        </article>
        <p class="knowledge-footer">
            Ветви: {{ practicedBranches }}. Накоплено ступеней:
            {{ player.progression?.totalEarnedLevels ?? 0 }} · сложность практики ×{{
                player.progression?.trainingMultiplier ?? 1
            }}
        </p>
    </section>
</template>
