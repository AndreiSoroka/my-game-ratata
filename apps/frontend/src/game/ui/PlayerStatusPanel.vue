<script setup lang="ts">
import './interfaceStory.css'

import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { healthBarPercent, healthText } from './healthPresentation'
import SoulBadge from './SoulBadge.vue'
import TheftStatus from './TheftStatus.vue'

type ResourceKind = 'energy' | 'hp' | 'mana'

const props = defineProps<{
    character: CharacterSnapshot
}>()

const resources = computed(() => [
    {
        value: props.character.health,
        kind: 'hp' as const,
    },
    {
        value: props.character.resources.mana,
        kind: 'mana' as const,
    },
    {
        value: props.character.resources.energy,
        kind: 'energy' as const,
    },
])

function resourceLabel(kind: ResourceKind): string {
    return kind === 'energy' ? 'EN' : kind === 'mana' ? 'MP' : 'HP'
}

function resourceClass(kind: ResourceKind): string {
    return `ratata-ui-resource__value--${kind}`
}

function resourceAria(kind: ResourceKind): string {
    return kind === 'energy' ? 'Energy' : kind === 'mana' ? 'Mana' : 'Health'
}
</script>

<template>
    <section
        class="ratata-ui-panel ratata-ui-status ratata-kenney-window player-status"
        aria-label="Player status"
    >
        <div class="ratata-ui-status__header ratata-kenney-title ratata-kenney-title--compact">
            <h2 class="ratata-ui-status__name" :title="character.nickname">
                {{ character.nickname }}
            </h2>
            <SoulBadge :soul="character.soul" compact />
        </div>
        <div class="ratata-ui-status__bars">
            <div v-for="resource in resources" :key="resource.kind" class="ratata-ui-resource">
                <span class="ratata-ui-resource__label">
                    {{ resourceLabel(resource.kind) }}
                </span>
                <span
                    class="ratata-ui-resource__track ratata-kenney-bar"
                    role="progressbar"
                    :aria-label="resourceAria(resource.kind)"
                    :aria-valuenow="healthBarPercent(resource.value)"
                    :aria-valuetext="healthText(resource.value) || undefined"
                    :aria-valuemin="0"
                    :aria-valuemax="100"
                >
                    <span
                        class="ratata-ui-resource__value ratata-kenney-bar__fill"
                        :class="resourceClass(resource.kind)"
                        :style="{ width: `${healthBarPercent(resource.value)}%` }"
                    ></span>
                    <span
                        v-if="resource.value.kind === 'exact'"
                        class="ratata-ui-resource__text ratata-kenney-bar__text"
                        aria-hidden="true"
                    >
                        {{ healthText(resource.value) }}
                    </span>
                </span>
            </div>
        </div>
        <TheftStatus :theft="character.theft" />
    </section>
</template>

<style scoped>
.player-status {
    position: absolute;
    grid-template-columns: minmax(0, 1fr);
    top: 58px;
    right: 14px;
    z-index: 3;
    width: min(330px, calc(100vw - 28px));
    min-width: 280px;
    padding: 8px 12px 10px;
    border-width: 10px;
    gap: 6px;
}

.player-status .ratata-ui-status__header {
    --identity-slot: 27px;
    display: grid;
    grid-template-columns: var(--identity-slot) minmax(0, 1fr) var(--identity-slot);
    min-width: 0;
    width: 100%;
    height: 32px;
    gap: 6px;
    margin: 0;
    padding: 0 16px;
    color: #fff4dc;
    line-height: 1;
    white-space: nowrap;
    font-size: 15px;
    text-shadow: 0 1px 0 #8e3f38;
    background-image: url('/game/map/assets/KenneyUiPackPixelAdventure/Tiles/Large tiles/Thick outline/tile_0044.png');
    background-size: 32px 32px;
    background-position: center calc(50% - 2px);
}

.player-status .ratata-ui-status__header::before,
.player-status .ratata-ui-status__header::after {
    height: 32px;
    background-size: 16px 32px;
    background-position: center calc(50% - 2px);
}

.player-status .ratata-ui-status__header::before {
    background-image: url('/game/map/assets/KenneyUiPackPixelAdventure/Tiles/Large tiles/Thick outline/tile_0043.png');
}

.player-status .ratata-ui-status__header::after {
    background-image: url('/game/map/assets/KenneyUiPackPixelAdventure/Tiles/Large tiles/Thick outline/tile_0045.png');
}

.player-status .ratata-ui-status__name {
    grid-column: 2;
    display: block;
    min-width: 0;
    width: 100%;
    margin: 0;
    color: inherit;
    font-size: 15px;
    line-height: 1;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
}

.player-status .ratata-ui-status__bars {
    gap: 4px;
}

.player-status .ratata-ui-resource {
    grid-template-columns: 34px 1fr;
    gap: 7px;
}

.player-status .ratata-ui-resource__label,
.player-status .ratata-ui-resource__text {
    font-size: 12px;
}

.player-status .ratata-ui-resource__track {
    height: 28px;
    min-width: 0;
}

.player-status .ratata-ui-resource__value {
    min-width: 0;
}

.player-status :deep(.soul-badge) {
    grid-column: 3;
    justify-self: end;
    gap: 3px;
    color: #fff4dc;
}
.player-status :deep(.soul-badge span) {
    color: inherit;
}
.player-status :deep(.soul-badge__icon),
.player-status :deep(.soul-badge__icon svg) {
    width: 12px;
    height: 12px;
    font-size: 12px;
}
@media (max-width: 740px) {
    .player-status {
        top: 76px;
        right: 12px;
        width: 150px;
        min-width: 0;
        padding: 6px;
        border-width: 8px;
        gap: 5px;
    }
    .player-status .ratata-ui-status__header {
        --identity-slot: 23px;
        height: 24px;
        min-height: 24px;
        gap: 4px;
        padding: 0 12px;
        font-size: 12px;
        background-size: 24px 24px;
    }
    .player-status .ratata-ui-status__header::before,
    .player-status .ratata-ui-status__header::after {
        width: 12px;
        height: 24px;
        background-size: 12px 24px;
    }
    .player-status .ratata-ui-status__name {
        font-size: 12px;
    }
    .player-status :deep(.soul-badge__icon),
    .player-status :deep(.soul-badge__icon svg) {
        width: 10px;
        height: 10px;
        font-size: 10px;
    }
    .player-status .ratata-ui-resource {
        grid-template-columns: 16px minmax(0, 1fr);
        gap: 4px;
    }
    .player-status .ratata-ui-resource__track {
        height: 17px;
        border-width: 3px;
    }
    .player-status .ratata-ui-resource__label,
    .player-status .ratata-ui-resource__text {
        font-size: 9px;
    }
}
</style>
