<script setup lang="ts">
import type { PrayerBuildFocus, PrayerBuildResult } from './constellationPrayerBuild'

defineProps<{ result: PrayerBuildResult; focus: PrayerBuildFocus }>()
const headings: Record<PrayerBuildFocus, string> = {
    prayer: 'Итог молитвы',
    harm: 'Итог кары',
    revival: 'Итог воскрешения',
}
const unavailable: Record<PrayerBuildFocus, string> = {
    prayer: 'Молитва не включена в набор. Включите её корень.',
    harm: 'Включите выбранную звезду Кары и корень молитвы.',
    revival: 'Включите корень молитвы и звезду воскрешения.',
}
</script>
<template>
    <section
        class="prayer-build"
        data-testid="debug-prayer-build"
        :aria-label="headings[focus]"
        aria-live="polite"
    >
        <h4>{{ headings[focus] }}</h4>
        <p v-if="!result.available" data-testid="debug-prayer-unavailable">
            {{ unavailable[focus] }}
        </p>
        <template v-else>
            <ul data-testid="debug-prayer-build-effects">
                <li v-for="effect in result.effects" :key="effect">{{ effect }}</li>
            </ul>
            <dl data-testid="debug-prayer-build-metrics">
                <div
                    v-for="metric in result.metrics"
                    :key="metric.label"
                    :data-build-metric="metric.label"
                >
                    <dt>{{ metric.label }}</dt>
                    <dd>{{ metric.value }}</dd>
                </div>
            </dl>
        </template>
    </section>
</template>
<style scoped>
.prayer-build {
    display: grid;
    gap: 12px;
}
h4,
p,
ul,
dl,
dd {
    margin: 0;
}
h4 {
    color: #e8d6aa;
    font-size: 14px;
}
ul {
    display: grid;
    gap: 5px;
    padding-left: 18px;
    color: #c6dadf;
}
dl {
    display: grid;
    gap: 8px;
}
dl > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    padding-bottom: 7px;
    border-bottom: 1px solid #345565;
}
dt {
    color: #adc3cd;
}
dd {
    max-width: 10em;
    overflow-wrap: anywhere;
    text-align: right;
    color: #f4dc9b;
    font-variant-numeric: tabular-nums;
}
</style>
