<script setup lang="ts">
import type { DeityMood } from '@my-game-ratata/contracts'

defineProps<{ mood: DeityMood }>()

const moods = {
    benevolent: {
        label: 'Благосклонность',
        path: 'M5 1h2v1h1v2h1v3h1v1h1v3H9v-1H8V9H7V8H5v1H4v1H3v1H1V8h1V7h1V4h1V2h1z M5 3h1v4h1v1H5z M3 8h1v1H3z M8 8h1v1H8z',
    },
    neutral: {
        label: 'Спокойствие',
        path: 'M4 1h4v1h2v2h1v4h-1v2H8v1H4v-1H2V8H1V4h1V2h2z M4 3v1H3v4h1v1h4V8h1V4H8V3z M5 5h2v2H5z',
    },
    wrathful: {
        label: 'Гнев',
        path: 'M6 0h3v2H8v2H7v1h4v2h-1v1H9v1H8v1H7v1H6v1H4v-2h1V8h1V7H2V5h1V4h1V3h1V2h1z',
    },
} satisfies Record<DeityMood, { label: string; path: string }>
</script>

<template>
    <span
        class="patron-mood"
        :data-patron-mood="mood"
        role="img"
        :aria-label="moods[mood].label"
        :title="moods[mood].label"
    >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 12 12" shape-rendering="crispEdges">
            <path :d="moods[mood].path" fill="currentColor" fill-rule="evenodd" />
        </svg>
    </span>
</template>

<style scoped>
.patron-mood {
    display: inline-flex;
    color: var(--character-hud-text, var(--ui-light-panel-text));
}

.patron-mood svg {
    width: var(--faith-status-icon-size, 12px);
    height: var(--faith-status-icon-size, 12px);
}

.patron-mood[data-patron-mood='benevolent'] {
    color: var(--character-hud-positive, var(--ui-light-panel-positive));
}

.patron-mood[data-patron-mood='wrathful'] {
    color: var(--character-hud-warning, var(--ui-light-panel-warning));
}
</style>
