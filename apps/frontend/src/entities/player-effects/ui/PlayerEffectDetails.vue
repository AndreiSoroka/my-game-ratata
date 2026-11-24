<script setup lang="ts">
import { useId } from 'vue'

import { HudFrame } from '@/shared/ui/common'

import type { PlayerEffectPresentation } from './playerEffectPresentation'

defineProps<{
    effect: Pick<PlayerEffectPresentation, 'kind' | 'path' | 'tone' | 'title' | 'detail' | 'timer'>
}>()
const titleId = useId()
</script>

<template>
    <HudFrame
        class="player-effect-details"
        border="border-008"
        role="region"
        :aria-labelledby="titleId"
        :data-player-effect-detail="effect.kind"
        :data-tone="effect.tone"
    >
        <div class="player-effect-details__heading">
            <svg
                class="player-effect-details__icon"
                viewBox="0 0 12 12"
                shape-rendering="crispEdges"
                aria-hidden="true"
                focusable="false"
            >
                <path :d="effect.path" fill="currentColor" fill-rule="evenodd" />
            </svg>
            <h2 :id="titleId" class="player-effect-details__title">{{ effect.title }}</h2>
            <span v-if="effect.timer" class="player-effect-details__timer">{{ effect.timer }}</span>
        </div>
        <p v-if="effect.detail" class="player-effect-details__description">{{ effect.detail }}</p>
    </HudFrame>
</template>

<style scoped>
.player-effect-details {
    --player-effect-accent: var(--ui-dark-panel-title);
    inline-size: 224px;
    max-inline-size: 100%;
    padding: 4px;
    font: 13px/1.35 var(--ratata-font-family, sans-serif);
    overflow-wrap: anywhere;
    pointer-events: auto;
}

.player-effect-details[data-tone='positive'] {
    --player-effect-accent: var(--ui-dark-panel-positive);
}

.player-effect-details[data-tone='warning'] {
    --player-effect-accent: var(--ui-dark-panel-warning);
}

.player-effect-details__heading {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    padding: 1px 1px 2px;
}

.player-effect-details__icon {
    inline-size: 16px;
    block-size: 16px;
    color: var(--player-effect-accent);
}

.player-effect-details__title {
    margin: 0;
    color: var(--ui-dark-panel-title);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.25;
}

.player-effect-details__timer {
    padding: 1px 4px;
    background: var(--ui-dark-bar-track);
    color: var(--player-effect-accent);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.player-effect-details__description {
    margin: 4px 1px 0;
    border-block-start: 1px solid var(--ui-dark-panel-divider);
    padding-block-start: 4px;
    font-size: 12px;
    text-wrap: pretty;
}
</style>
