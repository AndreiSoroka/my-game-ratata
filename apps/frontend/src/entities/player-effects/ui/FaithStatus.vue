<script setup lang="ts">
import type { DeityMood } from '@my-game-ratata/contracts'

import { HudRow } from '@/shared/ui/common'

import type { PatronPrayerChances } from '../model/patronStatus'
import PatronMood from './PatronMood.vue'

defineProps<{
    patronName?: string
    patronMasteryLevel?: number
    patronMood?: DeityMood
    moodChangeId?: number | undefined
    prayerChances?: PatronPrayerChances | undefined
    changesInMs?: number | undefined
}>()

const percentageFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })

function formatChance(chance: number): string {
    return `${percentageFormat.format(chance * 100)}%`
}
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
                :class="{ 'faith-status__name--timed': patronMood && changesInMs !== undefined }"
                :title="`${patronName} · ур. ${patronMasteryLevel ?? 0}`"
            >
                <span
                    :key="moodChangeId"
                    class="faith-status__patron"
                    :data-mood-change-id="
                        moodChangeId !== undefined && moodChangeId > 0 ? moodChangeId : undefined
                    "
                    >{{ patronName }}</span
                >
                <span class="faith-status__progress"
                    >· <span class="faith-status__mastery">ур. </span
                    >{{ patronMasteryLevel ?? 0 }}</span
                >
            </span>
            <template v-if="patronMood" #trailing>
                <span
                    v-if="changesInMs !== undefined"
                    class="faith-status__timer"
                    role="timer"
                    aria-label="До смены настроения"
                >
                    {{ Math.ceil(changesInMs / 1000) }} с
                </span>
                <PatronMood class="faith-status__mood" :mood="patronMood" />
            </template>
        </HudRow>
        <ul
            v-if="prayerChances"
            class="faith-status__chances"
            role="list"
            aria-label="Шансы молитвы"
        >
            <li>Шанс лечения {{ formatChance(prayerChances.healing) }}</li>
            <li>
                Шанс очищения могилы
                <span class="faith-status__per-step">
                    {{ formatChance(prayerChances.purificationPerStep) }} за шаг
                </span>
            </li>
            <li v-if="prayerChances.resurrection !== null">
                Шанс воскрешения {{ formatChance(prayerChances.resurrection) }}
            </li>
        </ul>
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
.faith-status__patron[data-mood-change-id] {
    animation: faith-status-mood-pulse 240ms ease-in-out 2;
}
.faith-status__progress {
    flex: none;
}
.faith-status__timer {
    margin-inline-end: 4px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.faith-status__chances {
    margin: 2px 0 0;
    margin-inline-start: var(--faith-status-text-inset, 33px);
    padding: 0;
    list-style: none;
    overflow-wrap: anywhere;
    font-size: var(--faith-status-font-size, 12px);
    font-variant-numeric: tabular-nums;
}
.faith-status__per-step {
    white-space: nowrap;
}

@keyframes faith-status-mood-pulse {
    0%,
    100% {
        background-color: transparent;
    }
    50% {
        background-color: color-mix(in srgb, currentColor 24%, transparent);
    }
}
@keyframes faith-status-mood-hold {
    from {
        background-color: color-mix(in srgb, currentColor 24%, transparent);
    }
    to {
        background-color: transparent;
    }
}
@media (prefers-reduced-motion: reduce) {
    .faith-status__patron[data-mood-change-id] {
        animation: faith-status-mood-hold 480ms steps(1, end);
    }
}
@container (max-width: 180px) {
    .faith-status__name {
        gap: 3px;
    }
    .faith-status__mastery {
        display: none;
    }
    .faith-status__name--timed {
        display: block;
        white-space: normal;
    }
    .faith-status__name--timed .faith-status__patron {
        overflow-wrap: anywhere;
    }
    .faith-status__name--timed .faith-status__progress {
        display: inline-block;
        margin-inline-start: 3px;
        white-space: nowrap;
    }
    .faith-status__chances {
        margin-inline-start: 8px;
    }
}
</style>
