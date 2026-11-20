<script setup lang="ts">
import { GameBar } from '@/shared/ui/common/game-bar'

withDefaults(
    defineProps<{
        value: number
        label: string
        color: string
        trackColor: string
        height?: number | undefined
        valueText?: string | undefined
        animated?: boolean
        dimmed?: boolean
    }>(),
    { height: 18 }
)
</script>

<template>
    <GameBar
        class="player-status-bar"
        :value="value"
        :label="label"
        :color="color"
        :track-color="trackColor"
        :height="height"
        :aria-valuetext="valueText"
        :data-animated="animated ? 'true' : 'false'"
        :data-dimmed="dimmed ? 'true' : 'false'"
    >
        <template v-if="valueText" #default>{{ valueText }}</template>
    </GameBar>
</template>

<style scoped>
.player-status-bar :deep(.game-bar__label) {
    font-family: var(--ratata-font-family, sans-serif);
}

.player-status-bar[data-dimmed='true'] {
    opacity: 0.92;
}

@media (prefers-reduced-motion: no-preference) {
    .player-status-bar[data-animated='true'] {
        animation: player-status-bar-blink 1.2s ease-in-out infinite;
    }
}

@keyframes player-status-bar-blink {
    50% {
        opacity: 0.55;
    }
}
</style>
