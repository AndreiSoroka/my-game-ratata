<script setup lang="ts">
import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { getWorldLocationDefinition, worldLocationId } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import GameFrame from './primitives/GameFrame.vue'

const props = defineProps<{ location: NonNullable<WorldSnapshot['location']> }>()
const dangerNames = [
    'Безопасно',
    'Низкая опасность',
    'Опасные земли',
    'Высокая опасность',
    'Крайняя опасность',
]
const cells = computed(() =>
    Array.from({ length: props.location.rows * props.location.columns }, (_, index) => {
        const column = index % props.location.columns
        const row = Math.floor(index / props.location.columns)
        const definition = getWorldLocationDefinition(worldLocationId(column, row))
        return { column, row, ...definition }
    })
)
const dangerLabel = computed(() => dangerNames[props.location.dangerLevel] ?? 'Неизведанные земли')
function cellLabel(cell: (typeof cells.value)[number]): string {
    return `${cell.name ?? `Локация ${cell.column + 1}, ${cell.row + 1}`} · ${dangerNames[cell.dangerLevel ?? 0]}${cell.column === props.location.column && cell.row === props.location.row ? ' · Вы здесь' : ''}`
}
</script>

<template>
    <section class="world-location game-frame-host" aria-label="World location">
        <GameFrame variant="panel" />
        <div class="world-location__summary">
            <span class="world-location__region">{{ location.regionName }}</span>
            <strong :title="location.name">{{ location.name }}</strong>
            <span class="world-location__danger" :class="`danger-${location.dangerLevel}`">{{
                location.biome === 'city'
                    ? 'Город · безопасно'
                    : `${dangerLabel} · ${location.dangerLevel}/4`
            }}</span>
            <span class="world-location__coordinates"
                >{{ location.column + 1 }}, {{ location.row + 1 }} · {{ location.columns }} ×
                {{ location.rows }}</span
            >
        </div>
        <div class="world-location__map">
            <div
                class="world-location__grid"
                :style="{ gridTemplateColumns: `repeat(${location.columns}, var(--map-cell))` }"
                aria-label="Карта региона"
            >
                <span
                    v-for="cell in cells"
                    :key="`${cell.column}-${cell.row}`"
                    role="img"
                    :class="[
                        `danger-${cell.dangerLevel ?? 0}`,
                        {
                            'world-location__current':
                                cell.column === location.column && cell.row === location.row,
                            'world-location__city': cell.biome === 'city',
                        },
                    ]"
                    :title="cellLabel(cell)"
                    :aria-label="cellLabel(cell)"
                    :aria-current="
                        cell.column === location.column && cell.row === location.row
                            ? 'location'
                            : undefined
                    "
                />
            </div>
            <div class="world-location__legend" aria-label="Опасность: от 0 до 4">
                <span v-for="level in 5" :key="level" :class="`danger-${level - 1}`">{{
                    level - 1
                }}</span>
            </div>
        </div>
    </section>
</template>

<style scoped>
.world-location {
    --map-cell: 9px;
    position: absolute;
    z-index: 3;
    left: 16px;
    top: 58px;
    display: flex;
    align-items: center;
    gap: 14px;
    max-width: calc(100% - 32px);
    padding: 10px 12px;
    color: #f3e7bf;
    border: 1px solid transparent;
    box-sizing: border-box;
}
.world-location__summary {
    min-width: 0;
}
.world-location strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    margin: 3px 0 5px;
}
.world-location__region {
    display: block;
    color: #a8b7a2;
    font:
        10px/1.3 system-ui,
        sans-serif;
}
.world-location__danger {
    display: block;
    font:
        11px/1.4 system-ui,
        sans-serif;
}
.world-location__coordinates {
    display: block;
    margin-top: 5px;
    font:
        10px/1.3 system-ui,
        sans-serif;
    color: #8d9d88;
}
.world-location__map {
    flex: 0 0 auto;
}
.world-location__grid {
    display: grid;
    gap: 3px;
}
.world-location__grid span {
    width: var(--map-cell);
    height: var(--map-cell);
    border: 1px solid currentColor;
    box-sizing: border-box;
    background: currentColor;
    opacity: 0.65;
}
.world-location__grid .world-location__current {
    outline: 2px solid #ffe6a1;
    outline-offset: 1px;
    opacity: 1;
}
.world-location__grid .world-location__city {
    position: relative;
    opacity: 1;
}
.world-location__city::after {
    content: '';
    position: absolute;
    inset: 2px;
    background: #f0ecc8;
}
.world-location__legend {
    display: flex;
    justify-content: space-between;
    margin-top: 7px;
    font:
        8px/1 system-ui,
        sans-serif;
}
.danger-0 {
    color: #91caa0;
}
.danger-1 {
    color: #b1bd72;
}
.danger-2 {
    color: #d7b261;
}
.danger-3 {
    color: #d58c5c;
}
.danger-4 {
    color: #bd6370;
}
@media (max-width: 740px) {
    .world-location {
        --map-cell: 7px;
        top: 76px;
        left: 12px;
        width: calc(100% - 184px);
        padding: 8px;
        gap: 9px;
    }
    .world-location strong {
        font-size: 12px;
    }
    .world-location__region {
        font-size: 9px;
    }
    .world-location__danger {
        font-size: 9px;
    }
    .world-location__coordinates {
        font-size: 9px;
    }
    .world-location__grid {
        gap: 2px;
    }
    .world-location__city::after {
        inset: 1px;
    }
    .world-location__legend {
        display: none;
    }
}
</style>
