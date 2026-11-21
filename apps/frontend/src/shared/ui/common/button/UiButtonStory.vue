<script setup lang="ts">
import type { FantasyBorderVariant } from '@/shared/ui/external/fantasy-ui-borders/border'

import { UiButton, type UiButtonProps, type UiButtonVariant } from './index'

const props = withDefaults(
    defineProps<
        UiButtonProps & {
            section: string
            label?: string
            onButtonClick?: (event: MouseEvent) => void
        }
    >(),
    { highlighted: undefined, focusRing: undefined }
)
const variants: UiButtonVariant[] = ['secondary', 'primary', 'success', 'danger']
const borders = Array.from(
    { length: 32 },
    (_, index) => `border-${String(index).padStart(3, '0')}` as FantasyBorderVariant
)
const appearances: { id: string; caption: string; props: UiButtonProps }[] = [
    { id: 'filled', caption: 'filled', props: { appearance: 'filled' } },
    { id: 'ghost', caption: 'ghost', props: { appearance: 'ghost' } },
    { id: 'panel-solid', caption: 'panel · solid', props: { appearance: 'panel' } },
    {
        id: 'panel-transparent-center',
        caption: 'panel · transparent-center',
        props: { appearance: 'panel', panelAppearance: 'transparent-center' },
    },
]
const labels = {
    default: 'UiButton',
    appearances: 'Оформление кнопок',
    variants: 'Смысловые цвета',
    borders: 'Все 32 рамки',
    colors: 'Свои цвета и градиенты',
    states: 'Состояния кнопки',
    'panel-states': 'Состояния кнопок FantasyPanel',
} as const
function reportClick(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('.ui-button')) {
        props.onButtonClick?.(event)
    }
}
</script>

<template>
    <section
        class="ui-button-story"
        data-testid="ui-button-story"
        :aria-label="`UiButton: ${section}`"
        @click="reportClick"
    >
        <h2>{{ labels[section as keyof typeof labels] }}</h2>
        <template v-if="section === 'default'">
            <UiButton
                :border="border"
                :appearance="appearance"
                :panel="panel"
                :panel-appearance="panelAppearance"
                :variant="variant"
                :colors="colors"
                :highlighted="highlighted"
                :focus-ring="focusRing"
                :disabled="disabled"
                :type="type"
                data-testid="ui-button-default"
                >{{ label }}</UiButton
            >
        </template>
        <div v-else-if="section === 'appearances'" class="ui-button-story__grid">
            <figure v-for="mode in appearances" :key="mode.id">
                <UiButton v-bind="mode.props" :data-testid="`ui-button-${mode.id}`"
                    >Продолжить</UiButton
                >
                <figcaption>{{ mode.caption }}</figcaption>
            </figure>
        </div>
        <div v-else-if="section === 'variants'" class="ui-button-story__grid">
            <figure v-for="tone in variants" :key="tone">
                <UiButton :variant="tone">{{ tone }}</UiButton>
                <UiButton :variant="tone" appearance="ghost">{{ tone }}</UiButton>
            </figure>
        </div>
        <div v-else-if="section === 'borders'" class="ui-button-story__borders">
            <figure v-for="frame in borders" :key="frame">
                <UiButton :border="frame" :data-testid="`ui-button-${frame}`">{{ frame }}</UiButton>
            </figure>
        </div>
        <div v-else-if="section === 'colors'" class="ui-button-story__grid">
            <UiButton
                data-testid="ui-button-custom"
                :colors="{
                    normal: {
                        text: '#f2f5ff',
                        border: 'rgb(158 205 255)',
                        backgroundTop: '#325c83',
                        backgroundBottom: '#244260',
                    },
                    highlighted: {
                        border: 'var(--button-demo-accent)',
                        backgroundTop: '#3d6f9b',
                        backgroundBottom: '#315c83',
                    },
                    pressed: { backgroundTop: '#1b3249', backgroundBottom: '#325c83' },
                    focus: 'var(--button-demo-accent)',
                }"
                >Собственная палитра</UiButton
            >
            <UiButton
                appearance="ghost"
                data-testid="ui-button-custom-ghost"
                :colors="{
                    normal: { border: 'rgba(90, 55, 120, 0.8)', text: '#51356b' },
                    highlighted: {
                        border: '#ead9ff',
                        backgroundTop: '#705086',
                        backgroundBottom: '#51356b',
                    },
                }"
                >Цвет прозрачной кнопки</UiButton
            >
        </div>
        <div v-else-if="section === 'states'" class="ui-button-story__grid">
            <UiButton data-testid="ui-button-focus">Фокус</UiButton>
            <UiButton variant="primary" data-testid="ui-button-hover">Наведение</UiButton>
            <UiButton variant="danger" data-testid="ui-button-pressed">Нажатие</UiButton>
            <UiButton disabled data-testid="ui-button-disabled">Недоступно</UiButton>
            <UiButton appearance="ghost" :highlighted="true" data-testid="ui-button-controlled-on"
                >Подсветка включена</UiButton
            >
            <UiButton appearance="ghost" :highlighted="false" data-testid="ui-button-controlled-off"
                >Подсветка выключена</UiButton
            >
            <UiButton appearance="ghost" aria-pressed="true" data-testid="ui-button-toggle"
                >Состояние переключателя</UiButton
            >
            <UiButton appearance="ghost" :focus-ring="false" data-testid="ui-button-focus-no-ring"
                >Фокус без внешнего контура</UiButton
            >
        </div>
        <div v-else-if="section === 'panel-states'" class="ui-button-story__grid">
            <UiButton appearance="panel" variant="primary" data-testid="ui-button-panel-action"
                >Подтвердить</UiButton
            >
            <UiButton
                appearance="panel"
                panel-appearance="transparent-center"
                variant="success"
                data-testid="ui-button-panel-translucent-action"
                >Открыть журнал</UiButton
            >
            <UiButton appearance="panel" disabled data-testid="ui-button-panel-disabled"
                >Недоступно</UiButton
            >
            <UiButton appearance="panel" panel="panel-025" data-testid="ui-button-panel-long"
                >Вернуться к заданию и поговорить со смотрителем северных ворот</UiButton
            >
        </div>
    </section>
</template>

<style scoped>
.ui-button-story {
    --button-demo-accent: #c4dcff;
    display: grid;
    gap: 24px;
    align-content: start;
    box-sizing: border-box;
    width: 100%;
    padding: 24px;
    color: var(--ui-light-panel-text);
    font:
        14px/1.5 system-ui,
        sans-serif;
}
h2 {
    margin: 0;
    font: 24px/1.3 var(--ratata-font-family, sans-serif);
}
.ui-button-story > .ui-button {
    justify-self: start;
}
.ui-button-story__grid,
.ui-button-story__borders {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
    gap: 24px;
}
.ui-button-story__borders {
    grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
}
figure {
    display: grid;
    gap: 12px;
    min-width: 0;
    margin: 0;
}
figcaption {
    text-align: center;
}
p {
    margin: 0;
}
@media (max-width: 400px) {
    .ui-button-story {
        padding: 16px;
    }
}
</style>
