<script setup lang="ts">
import { lightUiColors } from '@/shared/ui/theme'

import { GameBar, type GameBarProps } from './index'

withDefaults(defineProps<Partial<GameBarProps> & { section?: string }>(), { shadow: undefined })
const resources = [
    { id: 'health', name: 'Здоровье', value: 82, color: lightUiColors.bar.health.color },
    { id: 'mana', name: 'Мана', value: 64, color: lightUiColors.bar.mana.color },
    { id: 'energy', name: 'Энергия', value: 47, color: lightUiColors.bar.energy.color },
]
const values = [0, 1, 25, 50, 100]
const sizes = [10, 18, 24, 34]
const headings: Record<string, string> = {
    default: 'GameBar',
    resources: 'Цветовые схемы ресурсов',
    values: 'Заполнение и окончания',
    colors: 'Произвольные цвета',
    sizes: 'Размеры и тени',
}
</script>

<template>
    <section class="game-bar-story" data-testid="game-bar-story" aria-label="GameBar">
        <h2>{{ headings[section ?? 'default'] }}</h2>
        <template v-if="section === 'resources'">
            <figure v-for="resource in resources" :key="resource.id">
                <figcaption>{{ resource.name }}</figcaption>
                <GameBar
                    :value="resource.value"
                    :color="resource.color"
                    :label="resource.name"
                    :data-testid="`game-bar-${resource.id}`"
                />
            </figure>
        </template>
        <template v-else-if="section === 'values'">
            <figure v-for="amount in values" :key="amount">
                <figcaption>{{ amount }}%</figcaption>
                <GameBar
                    :value="amount"
                    :label="`Заполнение ${amount}%`"
                    :data-testid="`game-bar-value-${amount}`"
                />
            </figure>
        </template>
        <template v-else-if="section === 'colors'">
            <figure>
                <figcaption>Тёплое заполнение и тёмная подложка</figcaption>
                <GameBar
                    :value="62"
                    color="#ed7b25"
                    track-color="#584631"
                    data-testid="game-bar-custom"
                />
            </figure>
            <figure>
                <figcaption>Два цвета из CSS-переменных</figcaption>
                <GameBar
                    :value="46"
                    color="var(--bar-demo-fill)"
                    track-color="var(--bar-demo-track)"
                    data-testid="game-bar-variable"
                />
            </figure>
            <figure>
                <figcaption>currentColor и полупрозрачная подложка</figcaption>
                <GameBar
                    :value="74"
                    color="currentColor"
                    track-color="rgba(60, 90, 100, .28)"
                    class="game-bar-story__current"
                />
            </figure>
        </template>
        <template v-else-if="section === 'sizes'">
            <figure v-for="size in sizes" :key="size">
                <figcaption>{{ size }} px</figcaption>
                <GameBar :value="66" :height="size" :label="`Высота ${size} px`" />
            </figure>
            <figure>
                <figcaption>Без теней</figcaption>
                <GameBar :value="66" :shadow="false" />
            </figure>
        </template>
        <GameBar
            v-else
            :value="value ?? 72"
            :max="max"
            :color="color"
            :track-color="trackColor"
            :text-color="textColor"
            :height="height"
            :label="label"
            :show-value="showValue"
            :shadow="shadow"
            data-testid="game-bar-default"
        />
    </section>
</template>

<style scoped>
.game-bar-story {
    --bar-demo-fill: #9873d9;
    --bar-demo-track: #3e344b;
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
.game-bar-story__current {
    color: #438786;
}
</style>
