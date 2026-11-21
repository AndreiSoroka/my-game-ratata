<script setup lang="ts">
import { computed } from 'vue'

import {
    type PlayerEffectsSnapshot,
    PlayerEffectsStrip,
    projectPlayerEffects,
} from '@/entities/player-effects'

const props = defineProps<{
    character: PlayerEffectsSnapshot
    serverTime?: number | undefined
}>()

const effects = computed(() => projectPlayerEffects(props.character, props.serverTime))
</script>

<template>
    <PlayerEffectsStrip :effects="effects" />
</template>
