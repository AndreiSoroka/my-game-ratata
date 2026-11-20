<script setup lang="ts">
import { lightUiColors } from '@/shared/ui/theme'

import { FantasyBorder, type FantasyBorderVariant } from './index'

defineProps<{
    section: 'default' | 'variants' | 'colors' | 'composition' | 'sizes'
    border?: FantasyBorderVariant
    borderWidth?: number
    color?: string
    foreground?: string
}>()
const variants = Array.from(
    { length: 32 },
    (_, index) => `border-${String(index).padStart(3, '0')}` as FantasyBorderVariant
)
const colorExamples = [
    { id: 'red', name: 'CSS name: red', color: 'red' },
    { id: 'hex', name: 'HEX red', color: '#ff0000' },
    { id: 'rgba', name: 'RGBA: half-transparent red', color: 'rgba(255, 0, 0, 0.5)' },
    { id: 'current', name: 'Inherited currentColor', color: 'currentColor' },
    { id: 'variable', name: 'CSS variable', color: 'var(--border-demo-color)' },
    { id: 'hsl', name: 'HSL orange', color: 'hsl(30 100% 50%)' },
] as const
const themeColors = ['white', 'cream', 'gold', 'copper'] as const
const largeCorners = ['border-020', 'border-025'] as const
const sizeExamples = [
    { id: 'min', label: '0 × 0 → minimum 40 × 40' },
    { id: 'small', label: '64 × 64' },
    { id: 'wide', label: '240 × 64' },
    { id: 'tall', label: '64 × 160' },
] as const
</script>

<template>
    <section
        class="border-story-stage"
        data-testid="fantasy-border-story"
        :aria-label="`FantasyBorder: ${section}`"
        :style="{ color: foreground ?? lightUiColors.button.text }"
    >
        <template v-if="section === 'default'">
            <h2>FantasyBorder</h2>
            <FantasyBorder
                :border="border"
                :border-width="borderWidth"
                :color="color"
                class="border-default"
                data-testid="border-default"
            >
                <strong>Одна рамка, любое содержимое</strong>
                <p>Вариант и цвет задаются через публичные props.</p>
            </FantasyBorder>
        </template>
        <template v-else-if="section === 'variants'">
            <h2>32 варианта рамок</h2>
            <div class="border-variant-grid">
                <figure v-for="variant in variants" :key="variant">
                    <FantasyBorder :border="variant" class="border-variant" :data-testid="variant">
                        <span aria-hidden="true">✦</span>
                    </FantasyBorder>
                    <figcaption>{{ variant }}</figcaption>
                </figure>
            </div>
        </template>
        <template v-else-if="section === 'colors'">
            <h2>Цвет только рамки</h2>
            <p class="border-story-description">Центральный синий образец сохраняет свой цвет.</p>
            <h3>Светлая палитра</h3>
            <div class="border-color-grid border-theme-grid">
                <figure v-for="name in themeColors" :key="name">
                    <FantasyBorder
                        :color="lightUiColors.border[name]"
                        class="border-color-probe"
                        :style="{ background: lightUiColors.button.wood.bottom }"
                        :data-testid="`border-theme-${name}`"
                    >
                        <span
                            class="border-color-content"
                            role="img"
                            aria-label="Синий образец содержимого"
                        />
                    </FantasyBorder>
                    <figcaption>{{ name }}</figcaption>
                </figure>
            </div>
            <h3>Произвольные CSS-цвета</h3>
            <div class="border-color-grid">
                <figure v-for="example in colorExamples" :key="example.id">
                    <FantasyBorder
                        :color="example.color"
                        class="border-color-probe"
                        :class="`border-color-probe--${example.id}`"
                        :data-testid="`border-color-${example.id}`"
                    >
                        <span
                            class="border-color-content"
                            role="img"
                            aria-label="Синий образец содержимого"
                        />
                    </FantasyBorder>
                    <figcaption>{{ example.name }}</figcaption>
                </figure>
            </div>
        </template>
        <template v-else-if="section === 'composition'">
            <h2>Композиция</h2>
            <FantasyBorder
                border="border-020"
                :color="lightUiColors.button.edge"
                class="border-composition"
                :style="{
                    background: lightUiColors.panel.parchment,
                    color: lightUiColors.panel.text,
                }"
                data-testid="border-composition"
            >
                <h3 :style="{ color: lightUiColors.panel.title }">Письмо путешественнику</h3>
                <p>Рамка оборачивает обычное содержимое и не меняет его цвета.</p>
                <FantasyBorder
                    border="border-010"
                    :color="lightUiColors.button.edge"
                    class="border-composition-inner"
                >
                    <strong>Вложенная область</strong>
                    <div
                        class="border-composition-scroll"
                        tabindex="0"
                        aria-label="Прокручиваемое письмо"
                    >
                        <p>Текст, иллюстрации и другие компоненты остаются независимыми.</p>
                        <p>
                            Прокрутка принадлежит внутреннему содержимому, поэтому декоративные углы
                            остаются видимыми.
                        </p>
                        <p>
                            Длинное письмо помещается в свою область, сохраняя внешнюю рамку
                            целиком.
                        </p>
                    </div>
                </FantasyBorder>
            </FantasyBorder>
        </template>
        <template v-else>
            <h2>Естественные углы в разных размерах</h2>
            <section v-for="variant in largeCorners" :key="variant" class="border-size-section">
                <h3>{{ variant }} · углы 20 px</h3>
                <div class="border-size-grid">
                    <figure v-for="size in sizeExamples" :key="size.id">
                        <FantasyBorder
                            :border="variant"
                            :class="`border-size border-size--${size.id}`"
                            :data-testid="`border-size-${variant.slice(-3)}-${size.id}`"
                        />
                        <figcaption>{{ size.label }}</figcaption>
                    </figure>
                </div>
            </section>
        </template>
    </section>
</template>

<style scoped>
.border-story-stage {
    box-sizing: border-box;
    width: 100%;
    max-width: 1100px;
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
    margin: 8px 0 0;
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
.border-default {
    width: min(480px, 100%);
    padding: 22px;
}
.border-default strong {
    display: block;
    font-size: 18px;
}
.border-variant-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 24px;
}
.border-variant {
    display: grid;
    width: 100%;
    height: 90px;
    place-items: center;
}
.border-story-description {
    margin-bottom: 20px;
}
.border-color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, 160px);
    gap: 24px;
}
.border-theme-grid {
    margin-bottom: 28px;
}
.border-color-probe {
    display: grid;
    width: 160px;
    height: 80px;
    place-items: center;
    background: white;
}
.border-color-probe--current {
    color: rgb(0 128 0);
}
.border-color-probe--variable {
    --border-demo-color: rgb(128 0 128);
}
.border-color-content {
    display: block;
    width: 20px;
    height: 20px;
    background: blue;
}
.border-composition {
    width: min(620px, 100%);
    padding: 20px;
}
.border-composition-inner {
    margin-top: 18px;
    padding: 14px;
}
.border-composition-scroll {
    max-height: 100px;
    overflow: auto;
    overscroll-behavior: contain;
}
.border-size-section + .border-size-section {
    margin-top: 30px;
}
.border-size-grid {
    display: flex;
    flex-wrap: wrap;
    align-items: start;
    gap: 24px;
}
.border-size {
    display: block;
}
.border-size--min {
    width: 0;
    height: 0;
}
.border-size--small {
    width: 64px;
    height: 64px;
}
.border-size--wide {
    width: 240px;
    height: 64px;
}
.border-size--tall {
    width: 64px;
    height: 160px;
}
@media (max-width: 500px) {
    .border-story-stage {
        padding: 16px;
    }
}
</style>
