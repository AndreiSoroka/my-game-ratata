<script setup lang="ts">
import {
    ABILITY_DEFINITIONS,
    canLearnDiscipline,
    type CharacterSnapshot,
    type ClientMessage,
    type ConstellationId,
    isArcaneAbility,
    isArrowAbility,
    isPrayerAbility,
    type LearnAbilityId,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityIds,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { abilityUsage } from './abilityUsage'
import GameButton from './primitives/GameButton.vue'
const props = defineProps<{
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    constellationId?: ConstellationId
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const learnable = computed<LearnAbilityId[]>(() => {
    const prayer = prayerAbilityIds.find(
        (id) => PRAYER_SCHOOL_DEFINITIONS[id].constellationId === props.constellationId
    )
    return prayer
        ? [prayer]
        : props.constellationId === 'magic'
          ? ['spark', 'barrier']
          : props.constellationId === 'arrow'
            ? ['shot']
            : props.constellationId
              ? []
              : [...prayerAbilityIds, 'spark', 'barrier', 'shot']
})
const known = computed(() =>
    (props.player.abilities?.known ?? []).filter(
        (id) =>
            !props.constellationId ||
            (props.constellationId === 'magic' && isArcaneAbility(id)) ||
            learnable.value.includes(id as LearnAbilityId) ||
            (props.constellationId === 'arrow' && isArrowAbility(id)) ||
            (props.constellationId === 'prayer' && id === 'pray_woven')
    )
)
const canLearnMagic = computed(() =>
    canLearnDiscipline(props.player.abilities?.known ?? [], 'magic')
)
function teacher(ability: LearnAbilityId): CharacterSnapshot | undefined {
    return props.characters.find(
        (actor) =>
            actor.id !== props.player.id &&
            actor.alive &&
            actor.faction === props.player.faction &&
            Math.hypot(
                actor.position.x - props.player.position.x,
                actor.position.y - props.player.position.y
            ) <= 64 &&
            teaches(actor, ability)
    )
}
function teaches(actor: CharacterSnapshot, ability: LearnAbilityId): boolean {
    if (isPrayerAbility(ability)) return actor.abilities?.known.includes(ability) === true
    if (ability === 'shot') return actor.id === 'npc_veteran_1' || actor.tags.includes('veteran')
    return actor.tags.includes('scholar')
}
function learn(abilityId: LearnAbilityId): void {
    if (isArcaneAbility(abilityId) && !canLearnMagic.value) return
    const target = teacher(abilityId)
    if (target) emit('command', { type: 'learn_ability', abilityId, targetId: target.id })
}
function manaPrice(id: Parameters<typeof abilityUsage>[1]): string {
    const usage = abilityUsage(props.player, id)
    if (usage.manaFraction !== undefined && usage.mana === 0) {
        return `${Math.round(100 * usage.manaFraction)}% максимальной маны`
    }
    return `${usage.mana} MP`
}
</script>
<template>
    <section v-if="learnable.length" class="ability-knowledge" aria-label="Умения персонажа">
        <h3>Умения</h3>
        <ul>
            <li v-for="id in known" :key="id">
                <strong>{{ ABILITY_DEFINITIONS[id].name }}</strong> · {{ manaPrice(id) }} ·
                {{ abilityUsage(player, id).energy }} EN ·
                {{ abilityUsage(player, id).cooldownMs / 1000 }} с
            </li>
        </ul>
        <div
            v-for="id in learnable.filter(
                (ability) => !known.includes(ability) && !isPrayerAbility(ability)
            )"
            :key="id"
        >
            <GameButton
                :disabled="!player.alive || !teacher(id) || (isArcaneAbility(id) && !canLearnMagic)"
                @click="learn(id)"
            >
                Изучить: {{ ABILITY_DEFINITIONS[id].name }}</GameButton
            ><small
                >{{
                    id === 'pray'
                        ? 'Учитель: клирик'
                        : id === 'shot'
                          ? 'Учитель: ветеран'
                          : 'Учитель: учёный'
                }}
                · подойдите ближе</small
            >
            <small v-if="isArcaneAbility(id) && !canLearnMagic"
                >Магию нельзя изучать после молитв.</small
            >
        </div>
    </section>
</template>
<style scoped>
.ability-knowledge {
    border-bottom: 1px solid #8b8058;
    padding-bottom: 12px;
}
.ability-knowledge p,
small {
    font:
        14px/1.45 system-ui,
        sans-serif;
}
.ability-knowledge li {
    margin: 5px 0;
}
.ability-knowledge button {
    margin: 4px 8px 4px 0;
}
small {
    display: block;
}
</style>
