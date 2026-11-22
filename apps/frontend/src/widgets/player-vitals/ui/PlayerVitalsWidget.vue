<script setup lang="ts">
import { computed, watchEffect } from 'vue'

import {
    createPlayerVitalsStore,
    type PlayerVitalsData,
    PlayerVitalsView,
} from '@/entities/player-vitals'

const LOW_HEALTH_PERCENT = 30
const LOW_RESOURCE_PERCENT = 20

function isLow(percent: number, threshold: number, segments?: readonly number[]): boolean {
    const firstSegment = segments?.[0]
    return percent < threshold || (firstSegment !== undefined && percent <= firstSegment)
}

const props = defineProps<PlayerVitalsData & { compact?: boolean }>()
const { resources: displayedResources, update } = createPlayerVitalsStore(props)
watchEffect(() => update(props))
const vitalBars = computed(() => {
    const resources = displayedResources.value
    const hpAnimated = isLow(resources.hpPercent, LOW_HEALTH_PERCENT, resources.hpSegments)
    const manaAnimated = isLow(resources.manaPercent, LOW_RESOURCE_PERCENT, resources.manaSegments)
    const energyAnimated = isLow(
        resources.energyPercent,
        LOW_RESOURCE_PERCENT,
        resources.energySegments
    )
    return {
        ...resources,
        hpAnimated,
        manaAnimated,
        energyAnimated,
        dimSecondaryResources: hpAnimated && !manaAnimated && !energyAnimated,
    }
})
</script>

<template>
    <PlayerVitalsView v-bind="vitalBars" :nickname="nickname" :compact="compact" />
</template>
