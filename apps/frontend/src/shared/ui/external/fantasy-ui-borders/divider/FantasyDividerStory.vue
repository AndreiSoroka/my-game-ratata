<script setup lang="ts">
import { lightUiColors } from '@/shared/ui/theme'

import { FantasyDivider, type FantasyDividerVariant } from './index'

defineProps<{
    section: 'variants' | 'directions' | 'colors' | 'sizes'
    foreground?: string
}>()
const variants = Array.from(
    { length: 6 },
    (_, index) => `divider-${String(index).padStart(3, '0')}` as FantasyDividerVariant
)
const colorExamples = [
    { id: 'red', name: 'CSS name: red', color: 'red' },
    { id: 'hex', name: 'HEX red', color: '#ff0000' },
    { id: 'rgba', name: 'RGBA: half-transparent red', color: 'rgba(255, 0, 0, 0.5)' },
    { id: 'current', name: 'Inherited currentColor', color: 'currentColor' },
    { id: 'variable', name: 'CSS variable', color: 'var(--divider-demo-color)' },
    { id: 'hsl', name: 'HSL orange', color: 'hsl(30 100% 50%)' },
] as const
const themeColors = ['white', 'cream', 'gold', 'copper'] as const
const directions = [
    { id: 'normal', label: 'Орнамент справа', ends: 'right', fade: false },
    { id: 'mirrored', label: 'Орнамент слева', ends: 'left', fade: false },
    { id: 'both', label: 'Орнаменты с обеих сторон', ends: 'both', fade: false },
    { id: 'both-fade', label: 'Затухание к центру с обеих сторон', ends: 'both', fade: true },
] as const
const sizes = [
    { id: 'short', label: '96 px', width: '96px', ends: 'right' },
    { id: 'wide', label: '240 px', width: '240px', ends: 'right' },
    { id: 'fluid', label: '100% ширины контейнера', width: '100%', ends: 'right' },
    { id: 'min', label: '0 px → минимальная ширина 17 px', width: '0px', ends: 'right' },
    { id: 'both-min', label: 'Два орнамента: 0 px → минимум 34 px', width: '0px', ends: 'both' },
] as const
</script>

<template>
    <section
        class="divider-story-stage"
        data-testid="fantasy-divider-story"
        :aria-label="`FantasyDivider: ${section}`"
        :style="{ color: foreground ?? lightUiColors.button.text }"
    >
        <template v-if="section === 'variants'">
            <h2>Шесть вариантов и затухание</h2>
            <section v-for="variant in variants" :key="variant" class="divider-comparison">
                <h3>{{ variant }}</h3>
                <div v-for="mode in ['solid', 'fade'] as const" :key="mode" class="divider-example">
                    <span>{{ mode === 'fade' ? 'С затуханием' : 'Обычный' }}</span>
                    <FantasyDivider
                        :divider="variant"
                        :fade="mode === 'fade'"
                        :data-testid="`${variant}-${mode}`"
                        :aria-label="`${variant} · ${mode}`"
                    />
                </div>
            </section>
        </template>
        <template v-else-if="section === 'directions'">
            <h2>Расположение орнаментов</h2>
            <section v-for="variant in variants" :key="variant" class="divider-comparison">
                <h3>{{ variant }}</h3>
                <div v-for="direction in directions" :key="direction.id" class="divider-example">
                    <span>{{ direction.label }}</span>
                    <FantasyDivider
                        :divider="variant"
                        :ends="direction.ends"
                        :fade="direction.fade"
                        :data-testid="`${variant}-${direction.id}`"
                    />
                </div>
            </section>
        </template>
        <template v-else-if="section === 'colors'">
            <h2>Цвет только орнамента</h2>
            <h3>Светлая палитра</h3>
            <div class="divider-color-grid divider-theme-grid">
                <figure v-for="name in themeColors" :key="name">
                    <div
                        class="divider-color-probe"
                        :style="{ background: lightUiColors.button.wood.bottom }"
                    >
                        <FantasyDivider
                            :color="lightUiColors.border[name]"
                            :data-testid="`divider-theme-${name}`"
                        />
                        <span
                            class="divider-color-content"
                            role="img"
                            aria-label="Синий образец содержимого"
                        />
                    </div>
                    <figcaption>{{ name }}</figcaption>
                </figure>
            </div>
            <h3>Произвольные CSS-цвета</h3>
            <div class="divider-color-grid">
                <figure v-for="example in colorExamples" :key="example.id">
                    <div
                        class="divider-color-probe"
                        :class="`divider-color-probe--${example.id}`"
                        :data-testid="`divider-probe-${example.id}`"
                    >
                        <FantasyDivider
                            :color="example.color"
                            :data-testid="`divider-color-${example.id}`"
                        />
                        <span
                            class="divider-color-content"
                            role="img"
                            aria-label="Синий образец содержимого"
                        />
                    </div>
                    <figcaption>{{ example.name }}</figcaption>
                </figure>
            </div>
        </template>
        <template v-else>
            <h2>Гибкая ширина и исходная высота</h2>
            <figure v-for="size in sizes" :key="size.id" class="divider-size-example">
                <figcaption>{{ size.label }}</figcaption>
                <FantasyDivider
                    :style="{ width: size.width }"
                    :ends="size.ends"
                    :data-testid="`divider-size-${size.id}`"
                />
            </figure>
        </template>
    </section>
</template>

<style scoped>
.divider-story-stage {
    box-sizing: border-box;
    width: 100%;
    max-width: 850px;
    min-width: 0;
    padding: 24px;
    font:
        14px/1.5 system-ui,
        sans-serif;
}
h2 {
    margin: 0 0 22px;
    font-size: 24px;
}
h3 {
    margin: 0 0 12px;
    font-size: 18px;
}
p {
    margin: 0 0 20px;
}
figure {
    min-width: 0;
    margin: 0;
}
figcaption {
    margin-top: 8px;
    overflow-wrap: anywhere;
    font-size: 12px;
}
.divider-comparison + .divider-comparison {
    margin-top: 26px;
}
.divider-example {
    display: grid;
    gap: 8px;
    margin-top: 12px;
}
.divider-example > span {
    font-size: 12px;
}
.divider-color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, 160px);
    gap: 24px;
}
.divider-theme-grid {
    margin-bottom: 28px;
}
.divider-color-probe {
    display: grid;
    grid-template-rows: 40px 40px;
    width: 160px;
    height: 80px;
    place-items: center;
    background: white;
}
.divider-color-probe > .fantasy-divider {
    width: 96px;
}
.divider-color-probe--current {
    color: rgb(0 128 0);
}
.divider-color-probe--variable {
    --divider-demo-color: rgb(128 0 128);
}
.divider-color-content {
    display: block;
    width: 20px;
    height: 20px;
    background: blue;
}
.divider-size-example {
    width: 100%;
    max-width: 400px;
    margin-bottom: 24px;
}
.divider-size-example figcaption {
    margin: 0 0 8px;
}
@media (max-width: 500px) {
    .divider-story-stage {
        padding: 16px;
    }
}
</style>
