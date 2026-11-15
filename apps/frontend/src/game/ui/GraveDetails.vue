<script setup lang="ts">
import {
    GRAVE_PURIFY_MANA_COST,
    gravePurifyCastMs,
    MATERIAL_DAMAGE_MULTIPLIERS,
    type MaterialImpact,
    type WorldGraveSnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { graveName } from './graveInteractions'
import { healthBarPercent, healthText } from './healthPresentation'

const props = defineProps<{ grave: WorldGraveSnapshot; serverTime: number; compact?: boolean }>()
const remaining = computed(() =>
    Math.max(0, (props.grave.restoresAt ?? props.serverTime) - props.serverTime)
)
function percent(impact: MaterialImpact): string {
    return `${MATERIAL_DAMAGE_MULTIPLIERS[props.grave.material][impact] * 100}% урона`
}
function duration(ms: number): string {
    const seconds = Math.ceil(ms / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
    <section class="grave-details" aria-label="Состояние могилы">
        <div class="grave-details__heading">
            <strong>{{ graveName(grave) }}</strong>
            <span v-if="grave.health.kind === 'exact'">{{ healthText(grave.health) }} HP</span>
        </div>
        <progress
            :value="healthBarPercent(grave.health)"
            :max="100"
            aria-label="Прочность могилы"
        />
        <p v-if="grave.phase === 'ruined'">Восстановится через {{ duration(remaining) }}</p>
        <p v-else-if="grave.phase === 'purified'">Источник нежити очищен навсегда.</p>
        <p v-else>Источник скелетов · камень</p>
        <template v-if="!compact && grave.phase !== 'purified'">
            <dl class="grave-details__resistance">
                <dt>Кирка</dt>
                <dd>{{ percent('stone_tool') }}</dd>
                <dt>Оружие</dt>
                <dd>{{ percent('weapon') }}</dd>
                <dt>Магия</dt>
                <dd>{{ percent('arcane') }}</dd>
                <dt>Кулаки</dt>
                <dd>{{ percent('unarmed') }}</dd>
                <dt>Стрелы</dt>
                <dd>{{ percent('projectile') }}</dd>
            </dl>
            <p class="grave-details__hint">
                Очищение: {{ GRAVE_PURIFY_MANA_COST }} MP ·
                {{ gravePurifyCastMs(grave.phase) / 1000 }} с без движения. Esc — прервать.
            </p>
        </template>
    </section>
</template>

<style scoped>
.grave-details {
    color: #ece1c9;
    font:
        12px/1.5 system-ui,
        sans-serif;
}
.grave-details__heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
}
progress {
    width: 100%;
    height: 7px;
    accent-color: #a8b5a0;
}
p {
    margin: 6px 0;
}
.grave-details__resistance {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 12px;
    margin: 8px 0;
}
dd {
    margin: 0;
}
.grave-details__hint {
    color: #c7cfbb;
    font-size: 11px;
}
</style>
