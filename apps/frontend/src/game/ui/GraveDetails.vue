<script setup lang="ts">
import {
    type CharacterAbilitiesSnapshot,
    GRAVE_PURIFY_MANA_COST,
    gravePurifyCastMs,
    MATERIAL_DAMAGE_MULTIPLIERS,
    type MaterialImpact,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { healthBarPercent, healthText } from '@/entities/player-vitals'
import { tGame } from '@/shared/lib/i18n'

import { graveName } from './graveInteractions'

const props = defineProps<{
    grave: WorldGraveSnapshot
    serverTime: number
    compact?: boolean
    prayer?: CharacterAbilitiesSnapshot['prayer']
}>()
const remaining = computed(() =>
    Math.max(0, (props.grave.restoresAt ?? props.serverTime) - props.serverTime)
)
function percent(impact: MaterialImpact): string {
    return tGame('game.world.damagePercent', {
        percent: MATERIAL_DAMAGE_MULTIPLIERS[props.grave.material][impact] * 100,
    })
}
function duration(ms: number): string {
    const seconds = Math.ceil(ms / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
    <section class="grave-details" :aria-label="tGame('game.world.graveCondition')">
        <div class="grave-details__heading">
            <strong>{{ graveName(grave) }}</strong>
            <span v-if="grave.health.kind === 'exact'">{{ healthText(grave.health) }} HP</span>
        </div>
        <progress
            :value="healthBarPercent(grave.health)"
            :max="100"
            :aria-label="tGame('game.world.graveDurability')"
        />
        <p v-if="grave.phase === 'ruined'">
            {{ tGame('game.world.restoresIn') }} {{ duration(remaining) }}
        </p>
        <p v-else-if="grave.phase === 'purified'">
            {{ tGame('game.world.sourceUndeathHasBeenCleansed') }}
        </p>
        <p v-else>{{ tGame('game.world.skeletonSourceStone') }}</p>
        <div
            v-if="grave.purification"
            class="grave-purification"
            role="progressbar"
            :aria-label="tGame('game.world.graveCleansing')"
            :aria-valuenow="grave.purification.completed"
            :aria-valuemin="0"
            :aria-valuemax="grave.purification.required"
        >
            <svg viewBox="0 0 40 40" aria-hidden="true">
                <circle
                    v-for="step in grave.purification.required"
                    :key="step"
                    cx="20"
                    cy="20"
                    r="15"
                    fill="none"
                    :stroke="step <= grave.purification.completed ? '#f1d78c' : '#40564e'"
                    stroke-width="4"
                    :stroke-dasharray="`${(2 * Math.PI * 15) / grave.purification.required - 4} 100`"
                    :transform="`rotate(${-90 + ((step - 1) * 360) / grave.purification.required} 20 20)`"
                />
            </svg>
            <span
                >{{ tGame('game.world.cleansing') }} {{ grave.purification.completed }} /
                {{ grave.purification.required }}</span
            >
        </div>
        <template v-if="!compact && grave.phase !== 'purified'">
            <dl class="grave-details__resistance">
                <dt>{{ tGame('game.world.pickaxe') }}</dt>
                <dd>{{ percent('stone_tool') }}</dd>
                <dt>{{ tGame('game.world.weapon') }}</dt>
                <dd>{{ percent('weapon') }}</dd>
                <dt>{{ tGame('game.world.magic') }}</dt>
                <dd>{{ percent('arcane') }}</dd>
                <dt>{{ tGame('game.world.fists') }}</dt>
                <dd>{{ percent('unarmed') }}</dd>
                <dt>{{ tGame('game.world.arrows') }}</dt>
                <dd>{{ percent('projectile') }}</dd>
            </dl>
            <p class="grave-details__hint">
                {{ tGame('game.world.cleansing') }}
                {{ prayer?.manaCost ?? GRAVE_PURIFY_MANA_COST }} MP ·
                {{ (prayer?.durationMs ?? gravePurifyCastMs(grave.phase)) / 1000 }}
                {{ tGame('game.world.sWithoutMovingEscInterrupt') }}
            </p>
        </template>
    </section>
</template>

<style scoped>
.grave-details {
    color: #ece1c9;
    font:
        12px/1.5 system-ui,
        sans-serif;
}
.grave-details__heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
}
progress {
    width: 100%;
    height: 7px;
    accent-color: #a8b5a0;
}
p {
    margin: 6px 0;
}
.grave-details__resistance {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 12px;
    margin: 8px 0;
}
dd {
    margin: 0;
}
.grave-details__hint {
    color: #c7cfbb;
    font-size: 11px;
}
.grave-purification {
    display: flex;
    gap: 10px;
    align-items: center;
    color: #f1d78c;
}
.grave-purification svg {
    width: 40px;
    height: 40px;
}
</style>
