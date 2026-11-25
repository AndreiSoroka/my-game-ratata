<script setup lang="ts">
import {
    canLearnDiscipline,
    type ConstellationId,
    isArcaneAbility,
    isArrowAbility,
    isAshRiteId,
    isPrayerAbility,
    type LearnAbilityId,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityIds,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { abilityName, tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'

import { abilityUsage } from '../model/abilityUsage'
import type { LearnAbilitySelection } from '../model/knowledgeActions'
import type { KnowledgeParticipant } from '../model/knowledgeParticipant'
const props = defineProps<{
    player: KnowledgeParticipant
    characters: readonly KnowledgeParticipant[]
    constellationId?: ConstellationId
}>()
const emit = defineEmits<{ learnAbility: [selection: LearnAbilitySelection] }>()
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
            (props.constellationId === 'prayer' && id === 'pray_woven') ||
            (props.constellationId === 'prayer_grave' && isAshRiteId(id))
    )
)
const canLearnMagic = computed(() =>
    canLearnDiscipline(props.player.abilities?.known ?? [], 'magic')
)
function teacher(ability: LearnAbilityId): KnowledgeParticipant | undefined {
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
function teaches(actor: KnowledgeParticipant, ability: LearnAbilityId): boolean {
    if (isPrayerAbility(ability)) return actor.abilities?.known.includes(ability) === true
    if (ability === 'shot') return actor.id === 'npc_veteran_1' || actor.tags.includes('veteran')
    return actor.tags.includes('scholar')
}
function learn(abilityId: LearnAbilityId): void {
    if (isArcaneAbility(abilityId) && !canLearnMagic.value) return
    const target = teacher(abilityId)
    if (target) emit('learnAbility', { abilityId, targetId: target.id })
}
function manaPrice(id: Parameters<typeof abilityUsage>[1]): string {
    const usage = abilityUsage(props.player, id)
    if (usage.manaFraction !== undefined && usage.mana === 0) {
        return tGame('game.knowledge.maximumMana', {
            percent: Math.round(100 * usage.manaFraction),
        })
    }
    return `${usage.mana} MP`
}
</script>
<template>
    <section
        v-if="learnable.length"
        class="ability-knowledge"
        :aria-label="tGame('game.knowledge.characterAbilities')"
    >
        <h3>{{ tGame('game.knowledge.abilities') }}</h3>
        <ul>
            <li v-for="id in known" :key="id">
                <strong>{{ abilityName(id) }}</strong> · {{ manaPrice(id) }} ·
                {{ abilityUsage(player, id).energy }} EN ·
                {{ abilityUsage(player, id).cooldownMs / 1000 }} {{ tGame('game.knowledge.s') }}
            </li>
        </ul>
        <div
            v-for="id in learnable.filter(
                (ability) => !known.includes(ability) && !isPrayerAbility(ability)
            )"
            :key="id"
        >
            <UiButton
                size="small"
                :disabled="!player.alive || !teacher(id) || (isArcaneAbility(id) && !canLearnMagic)"
                @click="learn(id)"
            >
                {{ tGame('game.knowledge.learn') }} {{ abilityName(id) }}</UiButton
            ><small
                >{{
                    id === 'pray'
                        ? tGame('game.knowledge.clericTeacher')
                        : id === 'shot'
                          ? tGame('game.knowledge.veteranTeacher')
                          : tGame('game.knowledge.scholarTeacher')
                }}
                {{ tGame('game.knowledge.moveCloser') }}</small
            >
            <small v-if="isArcaneAbility(id) && !canLearnMagic">{{
                tGame('game.knowledge.youCannotStudyMagicAfter')
            }}</small>
        </div>
    </section>
</template>
<style scoped>
.ability-knowledge {
    border-bottom: 1px solid var(--ui-dark-panel-divider);
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
