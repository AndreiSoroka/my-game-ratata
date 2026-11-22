<script setup lang="ts">
import { computed } from 'vue'

import { HudRow } from '@/shared/ui/common'
import { FantasyDivider } from '@/shared/ui/external'
import { lightUiColors } from '@/shared/ui/theme'

import { playerResourceKinds } from '../model/playerVitals'
import { resourceNumbersText } from './healthPresentation'
import PlayerVitalsBar from './PlayerVitalsBar.vue'
import type { PlayerVitalsViewProps } from './playerVitalsViewProps'

const props = defineProps<PlayerVitalsViewProps>()

const resourcePresentation = {
    hp: { label: 'HP', name: 'Health', color: lightUiColors.bar.health.color, compactHeight: 13 },
    mana: { label: 'MP', name: 'Mana', color: lightUiColors.bar.mana.color, compactHeight: 10 },
    energy: {
        label: 'EN',
        name: 'Energy',
        color: lightUiColors.bar.energy.color,
        compactHeight: 10,
    },
}

const bars = computed(() =>
    playerResourceKinds.map((kind) => {
        const current = props[`${kind}Current`]
        const max = props[`${kind}Max`]
        return {
            kind,
            ...resourcePresentation[kind],
            percent: props[`${kind}Percent`],
            segments: props[`${kind}Segments`],
            animated: props[`${kind}Animated`],
            text:
                current !== undefined && max !== undefined
                    ? resourceNumbersText({ current, max })
                    : undefined,
        }
    })
)
</script>

<template>
    <section
        class="player-vitals"
        :class="{ 'player-vitals--compact': compact }"
        role="region"
        aria-label="Player vitals"
    >
        <div class="player-vitals__layout">
            <div class="player-vitals__header">
                <FantasyDivider
                    v-if="!compact"
                    class="player-vitals__divider player-vitals__divider--before"
                    divider="divider-005"
                    ends="right"
                    fade
                    color="var(--character-hud-border, var(--ui-dark-panel-ornament))"
                    aria-hidden="true"
                />
                <h2 class="player-vitals__name" :title="nickname">
                    {{ nickname }}
                </h2>
                <FantasyDivider
                    v-if="!compact"
                    class="player-vitals__divider player-vitals__divider--after"
                    divider="divider-005"
                    ends="left"
                    fade
                    color="var(--character-hud-border, var(--ui-dark-panel-ornament))"
                    aria-hidden="true"
                />
            </div>
            <div class="player-vitals__resources">
                <HudRow v-for="bar in bars" :key="bar.kind" class="player-vitals__resource">
                    <template #leading>
                        <span class="player-vitals__resource-label" aria-hidden="true">{{
                            bar.label
                        }}</span>
                    </template>
                    <PlayerVitalsBar
                        class="player-vitals__bar"
                        :value="bar.percent"
                        :segments="bar.segments"
                        :label="bar.name"
                        :color="bar.color"
                        track-color="var(--ui-dark-bar-track)"
                        :height="compact ? bar.compactHeight : undefined"
                        :value-text="bar.text"
                        :animated="bar.animated"
                        :dimmed="bar.kind !== 'hp' && dimSecondaryResources"
                    />
                </HudRow>
            </div>
        </div>
    </section>
</template>

<style scoped>
.player-vitals {
    font-family: var(--ratata-font-family, sans-serif);
}

.player-vitals:not(.player-vitals--compact) {
    container-type: inline-size;
}

.player-vitals__layout {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 8px 12px 10px;
}

.player-vitals__header {
    display: grid;
    grid-template-columns: minmax(25px, 1fr) minmax(0, max-content) minmax(25px, 1fr);
    align-items: center;
    gap: 2px 7px;
    min-width: 0;
    padding: 3px 6px;
    color: var(--ui-dark-panel-title);
}

.player-vitals__name {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: inherit;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.player-vitals__resources {
    display: grid;
    gap: 10px;
}

.player-vitals__resource-label {
    color: var(--ui-dark-panel-title);
    font-weight: 700;
    line-height: 1;
}

@container (max-width: 180px) {
    .player-vitals__layout {
        padding: 0;
    }

    .player-vitals__header {
        grid-template-columns: 14px minmax(0, 1fr) 14px;
        gap: 0 1px;
        padding: 0;
    }

    .player-vitals__divider {
        width: 25px;
        transform: scale(0.56);
    }

    .player-vitals__divider--before {
        justify-self: start;
        transform-origin: left center;
    }

    .player-vitals__divider--after {
        justify-self: end;
        transform-origin: right center;
    }

    .player-vitals__name {
        font-size: 11px;
    }
}

@container (max-width: 110px) {
    .player-vitals__header {
        grid-template-columns: 9px minmax(0, 1fr) 9px;
    }

    .player-vitals__divider {
        transform: scale(0.36);
    }
}

.player-vitals--compact {
    flex: none;
    min-width: 0;
}

.player-vitals--compact .player-vitals__layout {
    gap: 4px;
    padding: 0;
}

.player-vitals--compact .player-vitals__header {
    display: block;
    padding: 0;
}

.player-vitals--compact .player-vitals__name {
    font-size: 13px;
}

.player-vitals--compact .player-vitals__resources {
    gap: 3px;
}

.player-vitals--compact .player-vitals__resource {
    --hud-row-leading-width: 16px;
    column-gap: 4px;
    font-size: 10px;
}

@container (max-width: 160px) {
    .player-vitals--compact .player-vitals__name {
        font-size: 11px;
    }
}
</style>
