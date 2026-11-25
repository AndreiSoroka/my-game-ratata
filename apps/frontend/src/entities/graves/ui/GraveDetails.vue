<script setup lang="ts">
import type { WorldGraveSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { healthBarPercent, healthText } from '@/shared/lib/resource-display'
import { GameBar } from '@/shared/ui/common'

import { graveName } from '../model/graveName'

const props = defineProps<{
    grave: WorldGraveSnapshot
    serverTime: number
}>()
const remaining = computed(() =>
    Math.max(0, (props.grave.restoresAt ?? props.serverTime) - props.serverTime)
)
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
        <GameBar
            :value="healthBarPercent(grave.health)"
            :height="14"
            :label="tGame('game.world.graveDurability')"
            color="var(--ui-dark-panel-positive)"
            track-color="var(--ui-dark-bar-track)"
            :shadow="false"
        />
        <p v-if="grave.phase === 'ruined'">
            {{ tGame('game.world.restoresIn') }} {{ duration(remaining) }}
        </p>
        <p v-else-if="grave.phase === 'purified'">
            {{ tGame('game.world.sourceUndeathHasBeenCleansed') }}
        </p>
        <template v-else>
            <p>{{ tGame('game.world.graveSkeletons') }}</p>
            <p>{{ tGame('game.world.graveToolEffectiveness') }}</p>
        </template>
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
                    :stroke="
                        step <= grave.purification.completed
                            ? 'var(--ui-dark-panel-title)'
                            : 'var(--ui-dark-bar-track)'
                    "
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
    </section>
</template>

<style scoped>
.grave-details {
    color: var(--ui-dark-panel-text);
    font:
        12px/1.5 system-ui,
        sans-serif;
}
.grave-details__heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
}
p {
    margin: 6px 0;
}
.grave-purification {
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--ui-dark-panel-title);
}
.grave-purification svg {
    width: 40px;
    height: 40px;
}
</style>
