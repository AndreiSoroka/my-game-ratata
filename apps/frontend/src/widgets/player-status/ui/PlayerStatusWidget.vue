<script setup lang="ts">
import { computed, watchEffect } from 'vue'

import {
    createPlayerStatusStore,
    type PlayerStatusData,
    PlayerStatusView,
} from '@/entities/character'

const LOW_HEALTH_PERCENT = 30
const LOW_RESOURCE_PERCENT = 20
const props = defineProps<PlayerStatusData & { compact?: boolean }>()
const { resources: displayedResources, update } = createPlayerStatusStore(props)
watchEffect(() => update(props))
const statusBars = computed(() => {
    const resources = displayedResources.value
    const hpAnimated = resources.hpPercent < LOW_HEALTH_PERCENT
    const manaAnimated = resources.manaPercent < LOW_RESOURCE_PERCENT
    const energyAnimated = resources.energyPercent < LOW_RESOURCE_PERCENT
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
    <PlayerStatusView
        v-bind="statusBars"
        :nickname="nickname"
        :patrons="patrons"
        :compact="compact"
    />
</template>
