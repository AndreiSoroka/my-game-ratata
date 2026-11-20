<script setup lang="ts">
import { computed } from 'vue'

import { FantasyDivider } from '@/shared/ui/external/fantasy-ui-borders/divider'
import { lightUiColors } from '@/shared/ui/theme'

import { resourceNumbersText } from '../model/healthPresentation'
import { playerResourceKinds, type PlayerStatusViewProps } from '../model/playerStatus'
import CharacterHudFrame from './CharacterHudFrame.vue'
import FaithStatus from './FaithStatus.vue'
import PlayerStatusBar from './PlayerStatusBar.vue'
import PlayerStatusRow from './PlayerStatusRow.vue'

const props = defineProps<PlayerStatusViewProps>()

const sortedPatrons = computed(() =>
    (props.patrons ?? [])
        .filter((patron) => patron.name.trim())
        .sort((left, right) => (right.level ?? 0) - (left.level ?? 0))
)

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
    <component
        :is="compact ? 'section' : CharacterHudFrame"
        class="player-status"
        :class="{ 'player-status--compact': compact }"
        role="region"
        aria-label="Player status"
    >
        <div class="player-status__layout">
            <div class="player-status__header">
                <FantasyDivider
                    v-if="!compact"
                    class="player-status__divider player-status__divider--before"
                    divider="divider-005"
                    ends="right"
                    fade
                    color="var(--character-hud-border, var(--ui-dark-panel-ornament))"
                    aria-hidden="true"
                />
                <h2 class="player-status__name" :title="nickname">
                    {{ nickname }}
                </h2>
                <FantasyDivider
                    v-if="!compact"
                    class="player-status__divider player-status__divider--after"
                    divider="divider-005"
                    ends="left"
                    fade
                    color="var(--character-hud-border, var(--ui-dark-panel-ornament))"
                    aria-hidden="true"
                />
            </div>
            <div class="player-status__resources">
                <PlayerStatusRow
                    v-for="bar in bars"
                    :key="bar.kind"
                    class="player-status__resource"
                >
                    <template #leading>
                        <span class="player-status__resource-label" aria-hidden="true">{{
                            bar.label
                        }}</span>
                    </template>
                    <PlayerStatusBar
                        class="player-status__bar"
                        :value="bar.percent"
                        :label="bar.name"
                        :color="bar.color"
                        track-color="var(--ui-dark-bar-track)"
                        :height="compact ? bar.compactHeight : undefined"
                        :value-text="bar.text"
                        :animated="bar.animated"
                        :dimmed="bar.kind !== 'hp' && dimSecondaryResources"
                    />
                </PlayerStatusRow>
            </div>
            <div v-if="sortedPatrons.length" class="player-status__details">
                <PlayerStatusRow>
                    <FantasyDivider
                        class="player-status__faith-divider"
                        divider="divider-002"
                        ends="right"
                        fade
                        color="var(--ui-dark-panel-divider)"
                        aria-hidden="true"
                    />
                </PlayerStatusRow>
                <FaithStatus
                    v-for="patron in sortedPatrons"
                    :key="patron.id"
                    :patron-name="patron.name"
                    :patron-mastery-level="patron.level"
                    :patron-mood="patron.mood"
                />
            </div>
        </div>
    </component>
</template>

<style scoped>
.player-status {
    font-family: var(--ratata-font-family, sans-serif);
}

.player-status__layout {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 8px 12px 10px;
}

.player-status__header {
    display: grid;
    grid-template-columns: minmax(25px, 1fr) minmax(0, max-content) minmax(25px, 1fr);
    align-items: center;
    gap: 2px 7px;
    min-width: 0;
    padding: 3px 6px;
    color: var(--ui-dark-panel-title);
}

.player-status__name {
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

.player-status__resources {
    display: grid;
    gap: 10px;
}

.player-status__resource-label {
    color: var(--ui-dark-panel-title);
    font-weight: 700;
    line-height: 1;
}

.player-status__details {
    --player-status-detail-icon-size: 12px;
    display: grid;
    gap: 6px;
    min-width: 0;
}

@container (max-width: 180px) {
    .player-status__layout {
        padding: 0;
    }

    .player-status__header {
        grid-template-columns: 14px minmax(0, 1fr) 14px;
        gap: 0 1px;
        padding: 0;
    }

    .player-status__divider {
        width: 25px;
        transform: scale(0.56);
    }

    .player-status__divider--before {
        justify-self: start;
        transform-origin: left center;
    }

    .player-status__divider--after {
        justify-self: end;
        transform-origin: right center;
    }

    .player-status__name {
        font-size: 11px;
    }

    .player-status__details {
        --player-status-detail-icon-size: 10px;
        gap: 4px;
    }
}

@container (max-width: 110px) {
    .player-status__header {
        grid-template-columns: 9px minmax(0, 1fr) 9px;
    }

    .player-status__divider {
        transform: scale(0.36);
    }
}

.player-status--compact {
    flex: none;
    min-width: 0;
}

.player-status--compact .player-status__layout {
    gap: 4px;
    padding: 0;
}

.player-status--compact .player-status__header {
    display: block;
    padding: 0;
}

.player-status--compact .player-status__name {
    font-size: 13px;
}

.player-status--compact .player-status__resources {
    gap: 3px;
}

.player-status--compact .player-status__details {
    --player-status-detail-icon-size: 10px;
    gap: 3px;
}

.player-status--compact .player-status__resource,
.player-status--compact .player-status__details :deep(.player-status-row) {
    --player-status-row-leading-width: 16px;
    column-gap: 4px;
    font-size: 10px;
}

.player-status--compact .player-status__faith-divider {
    height: 4px;
    min-height: 4px;
}

@container (max-width: 160px) {
    .player-status--compact .player-status__name {
        font-size: 11px;
    }
}
</style>
