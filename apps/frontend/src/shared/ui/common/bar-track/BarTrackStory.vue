<script setup lang="ts">
import { BarTrack } from './index'

defineProps<{ section: 'colors' | 'sizes' }>()
const colors = ['#785b3c', '#284154', '#c8b68c', 'rgba(60, 90, 100, .5)']
const sizes = [10, 18, 24, 34]
</script>

<template>
    <section class="bar-track-story" data-testid="bar-track-story" aria-label="BarTrack">
        <h2>{{ section === 'colors' ? 'Цвета подложки' : 'Размеры подложки' }}</h2>
        <template v-if="section === 'colors'">
            <figure v-for="(sample, index) in colors" :key="sample">
                <BarTrack :color="sample" :data-testid="index === 0 ? 'track-custom' : undefined" />
                <figcaption>{{ sample }}</figcaption>
            </figure>
        </template>
        <template v-else>
            <figure v-for="size in sizes" :key="size">
                <BarTrack :height="size" />
                <figcaption>{{ size }} px</figcaption>
            </figure>
            <figure>
                <BarTrack :shadow="false" />
                <figcaption>Без теней</figcaption>
            </figure>
        </template>
    </section>
</template>

<style scoped>
.bar-track-story {
    display: grid;
    gap: 26px;
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
    margin: 0;
    font: 500 26px/1.2 var(--ratata-font-family, sans-serif);
}
figure {
    min-width: 0;
    margin: 0;
}
figcaption {
    margin-top: 8px;
    overflow-wrap: anywhere;
}
</style>
