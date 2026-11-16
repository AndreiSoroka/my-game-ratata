<script setup lang="ts">
import {
    ABILITY_DEFINITIONS,
    type CharacterSnapshot,
    type ClientMessage,
    type ConstellationId,
    isPrayerAbility,
    type LearnAbilityId,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityIds,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { abilityUsage } from './abilityUsage'
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
            learnable.value.includes(id as LearnAbilityId) ||
            (props.constellationId === 'prayer' && id === 'pray_woven')
    )
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
    const target = teacher(abilityId)
    if (target) emit('command', { type: 'learn_ability', abilityId, targetId: target.id })
}
</script>
<template>
    <section v-if="learnable.length" class="ability-knowledge" aria-label="Умения персонажа">
        <h3>Умения</h3>
        <ul>
            <li v-for="id in known" :key="id">
                <strong>{{ ABILITY_DEFINITIONS[id].name }}</strong> ·
                {{ abilityUsage(player, id).mana }} MP · {{ abilityUsage(player, id).energy }} EN ·
                {{ abilityUsage(player, id).cooldownMs / 1000 }} с
            </li>
        </ul>
        <div
            v-for="id in learnable.filter(
                (ability) => !known.includes(ability) && !isPrayerAbility(ability)
            )"
            :key="id"
        >
            <button type="button" :disabled="!player.alive || !teacher(id)" @click="learn(id)">
                Изучить: {{ ABILITY_DEFINITIONS[id].name }}</button
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
