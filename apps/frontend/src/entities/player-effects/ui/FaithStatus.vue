<script setup lang="ts">
import type { DeityMood } from '@my-game-ratata/contracts'

import { HudRow } from '@/shared/ui/common/hud-row'

import PatronMood from './PatronMood.vue'

defineProps<{
    patronName?: string
    patronMasteryLevel?: number
    patronMood?: DeityMood
}>()
</script>
<template>
    <div v-if="patronName" class="faith-status" aria-label="Покровитель и развитие">
        <HudRow class="faith-status__title" align="start">
            <template #leading>
                <svg
                    class="faith-status__icon"
                    viewBox="0 0 12 12"
                    shape-rendering="crispEdges"
                    aria-hidden="true"
                    focusable="false"
                >
                    <path
                        d="M5 1h2v2h1v1h1v1h2v2H9v1H8v1H7v2H5V9H4V8H3V7H1V5h2V4h1V3h1z"
                        fill="currentColor"
                    />
                </svg>
            </template>
            <span
                class="faith-status__name"
                :title="`${patronName} · ур. ${patronMasteryLevel ?? 0}`"
            >
                <span class="faith-status__patron">{{ patronName }}</span>
                <span class="faith-status__progress"
                    >· <span class="faith-status__mastery">ур. </span
                    >{{ patronMasteryLevel ?? 0 }}</span
                >
            </span>
            <template v-if="patronMood" #trailing>
                <PatronMood class="faith-status__mood" :mood="patronMood" />
            </template>
        </HudRow>
    </div>
</template>
<style scoped>
.faith-status {
    color: var(--character-hud-text, var(--ui-light-panel-text));
    font-family: var(--ratata-font-family, sans-serif);
    line-height: 1.4;
}
.faith-status__icon {
    width: var(--faith-status-icon-size, 12px);
    height: var(--faith-status-icon-size, 12px);
}
.faith-status__icon,
.faith-status__mood {
    margin-block-start: calc((1lh - var(--faith-status-icon-size, 12px)) / 2);
}
.faith-status__name {
    display: flex;
    gap: 4px;
    white-space: nowrap;
}
.faith-status__patron {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
.faith-status__progress {
    flex: none;
}
@container (max-width: 180px) {
    .faith-status__name {
        gap: 3px;
    }
    .faith-status__mastery {
        display: none;
    }
}
</style>
