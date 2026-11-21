<script setup lang="ts">
import { lightUiColors } from '@/shared/ui/theme'

import { BarFill } from './index'

defineProps<{ section: 'colors' | 'sizes' }>()
const colors = [
    { label: 'Здоровье', color: lightUiColors.bar.health.color },
    { label: 'Бирюзовый', color: 'hsl(178 30% 42%)' },
    { label: 'Полупрозрачный лиловый', color: 'rgb(105 74 144 / 65%)' },
]
const heights = [10, 18, 24, 34]
</script>

<template>
    <section class="bar-fill-story" data-testid="bar-fill-story" aria-label="BarFill">
        <h2>{{ section === 'colors' ? 'Цвета заполнения' : 'Высота и кромка' }}</h2>
        <template v-if="section === 'colors'">
            <figure v-for="sample in colors" :key="sample.label">
                <figcaption>{{ sample.label }}</figcaption>
                <BarFill :color="sample.color" />
            </figure>
        </template>
        <template v-else>
            <figure v-for="size in heights" :key="size">
                <figcaption>{{ size }} px</figcaption>
                <BarFill :height="size" />
            </figure>
            <figure>
                <figcaption>Без внутренней кромки</figcaption>
                <BarFill :shadow="false" />
            </figure>
        </template>
    </section>
</template>

<style scoped>
.bar-fill-story {
    display: grid;
    gap: 24px;
    width: 100%;
    max-width: 560px;
    min-width: 0;
    margin: 0 auto;
    color: var(--ui-light-panel-title);
    font:
        14px/1.5 system-ui,
        sans-serif;
}
h2 {
    margin: 0 0 2px;
    font: 500 26px/1.2 var(--ratata-font-family, sans-serif);
}
figure {
    min-width: 0;
    margin: 0;
}
figcaption {
    margin-bottom: 9px;
}
</style>
