<script setup lang="ts">
import './interfaceStory.css'

import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

type ResourceKind = 'energy' | 'hp' | 'mana'

const props = defineProps<{
    character: CharacterSnapshot
    status: string
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
const stats = computed(() => [
    {
        label: 'DMG',
        value: `${String(props.character.stats.minDamage)}-${String(props.character.stats.maxDamage)}`,
    },
    {
        label: 'Dodge',
        value: formatPercent(props.character.stats.dodgeChance),
    },
    {
        label: 'Crit',
        value: formatPercent(props.character.stats.critChance),
    },
    {
        label: 'Speed',
        value: String(Math.round(props.character.stats.moveSpeed)),
    },
    {
        label: 'CD',
        value: `${String(Math.round(props.character.stats.attackCooldownMs / 100) / 10)}s`,
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

function formatPercent(value: number): string {
    return `${String(Math.round(value * 100))}%`
}
</script>

<template>
    <section
        class="ratata-ui-panel ratata-ui-status ratata-kenney-window player-status"
        aria-label="Player status"
    >
        <div class="ratata-ui-status__header">
            <span class="ratata-ui-status__name ratata-kenney-title">
                {{ character.nickname }}
            </span>
            <span class="ratata-ui-status__server">{{ status }}</span>
        </div>
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
        <dl class="ratata-ui-status__stats">
            <div v-for="stat in stats" :key="stat.label" class="ratata-ui-stat">
                <dt>{{ stat.label }}</dt>
                <dd>{{ stat.value }}</dd>
            </div>
        </dl>
    </section>
</template>

<style scoped>
.player-status {
    position: absolute;
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
    font-size: 15px;
}

.player-status .ratata-ui-status__server {
    font-size: 12px;
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

.player-status .ratata-ui-status__stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 5px;
    margin: 8px 0 0;
}

.player-status .ratata-ui-stat {
    min-width: 0;
    padding: 5px 4px;
    background: #0b1018;
    border: 1px solid #323d4d;
}

.player-status .ratata-ui-stat dt,
.player-status .ratata-ui-stat dd {
    margin: 0;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.player-status .ratata-ui-stat dt {
    color: #96a8bc;
    font-size: 9px;
    font-weight: 800;
}

.player-status .ratata-ui-stat dd {
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
}
</style>
