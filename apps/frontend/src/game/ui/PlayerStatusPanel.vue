<script setup lang="ts">
import './interfaceStory.css'

import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import SoulBadge from './SoulBadge.vue'
import TheftStatus from './TheftStatus.vue'

type ResourceKind = 'energy' | 'hp' | 'mana'

const props = defineProps<{
    character: CharacterSnapshot
}>()

const resources = computed(() => [
    {
        current: props.character.hp,
        kind: 'hp' as const,
        max: props.character.maxHp,
    },
    {
        current: props.character.resources.mana,
        kind: 'mana' as const,
        max: props.character.resources.maxMana,
    },
    {
        current: props.character.resources.energy,
        kind: 'energy' as const,
        max: props.character.resources.maxEnergy,
    },
])

function resourcePercent(resource: { current: number; max: number }): string {
    const max = Math.max(resource.max, 1)
    const current = Math.max(0, Math.min(resource.current, max))

    return `${String(Math.round((current / max) * 100))}%`
}

function resourceLabel(kind: ResourceKind): string {
    return kind === 'energy' ? 'EN' : kind === 'mana' ? 'MP' : 'HP'
}

function resourceClass(kind: ResourceKind): string {
    return `ratata-ui-resource__value--${kind}`
}

function resourceText(resource: { current: number; max: number }): string {
    return `${String(resource.current)}/${String(resource.max)}`
}

function resourceAria(resource: { current: number; kind: ResourceKind; max: number }): string {
    const label =
        resource.kind === 'energy' ? 'Energy' : resource.kind === 'mana' ? 'Mana' : 'Health'

    return `${label}: ${String(resource.current)} of ${String(resource.max)}`
}
</script>

<template>
    <section
        class="ratata-ui-panel ratata-ui-status ratata-kenney-window player-status"
        aria-label="Player status"
    >
        <div class="ratata-ui-status__header">
            <h2 class="ratata-ui-status__name" :title="character.nickname">
                {{ character.nickname }}
            </h2>
        </div>
        <SoulBadge :soul="character.soul" compact />
        <div class="ratata-ui-status__bars">
            <div v-for="resource in resources" :key="resource.kind" class="ratata-ui-resource">
                <span class="ratata-ui-resource__label">
                    {{ resourceLabel(resource.kind) }}
                </span>
                <span class="ratata-ui-resource__track ratata-kenney-bar">
                    <span
                        class="ratata-ui-resource__value ratata-kenney-bar__fill"
                        :class="resourceClass(resource.kind)"
                        :style="{ width: resourcePercent(resource) }"
                    ></span>
                    <span
                        class="ratata-ui-resource__text ratata-kenney-bar__text"
                        :aria-label="resourceAria(resource)"
                    >
                        {{ resourceText(resource) }}
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
}

.player-status .ratata-ui-status__header {
    margin-bottom: 6px;
}

.player-status .ratata-ui-status__name {
    display: block;
    min-width: 0;
    flex: 1 1 0;
    margin: 0;
    padding: 0;
    color: #65472b;
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 15px;
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

.player-status :deep(.soul-badge) {
    color: #786340;
}
.player-status :deep(.soul-badge span) {
    color: #63705d;
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
        margin-bottom: 0;
    }
    .player-status .ratata-ui-status__name {
        min-height: 18px;
        padding: 0;
        font-size: 12px;
        color: #65472b;
        background: none;
        text-shadow: none;
        text-align: left;
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
