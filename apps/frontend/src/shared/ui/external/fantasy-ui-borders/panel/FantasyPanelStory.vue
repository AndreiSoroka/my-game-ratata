<script setup lang="ts">
import { lightUiColors } from '@/shared/ui/theme'

import { FantasyPanel, type FantasyPanelAppearance, type FantasyPanelVariant } from './index'

defineProps<{
    section: 'default' | 'variants' | 'appearances' | 'colors' | 'composition' | 'sizes'
    panel?: FantasyPanelVariant
    appearance?: FantasyPanelAppearance
    borderColor?: string
    backgroundColor?: string
    foreground?: string
}>()
const variants = Array.from(
    { length: 32 },
    (_, index) => `panel-${String(index).padStart(3, '0')}` as FantasyPanelVariant
)
const appearances = [
    { id: 'solid', label: 'Непрозрачная панель' },
    { id: 'transparent-border', label: 'Полупрозрачный орнамент' },
    { id: 'transparent-center', label: 'Полупрозрачная середина' },
] as const
const colorExamples = [
    { id: 'red', label: 'CSS name: red', color: 'red' },
    { id: 'hex', label: 'HEX red', color: '#ff0000' },
    { id: 'rgba', label: 'RGBA: half-transparent red', color: 'rgba(255, 0, 0, 0.5)' },
    { id: 'current', label: 'Inherited currentColor', color: 'currentColor' },
    { id: 'variable', label: 'CSS variable', color: 'var(--panel-demo-color)' },
    { id: 'hsl', label: 'HSL orange', color: 'hsl(30 100% 50%)' },
] as const
const themeColors = ['white', 'cream', 'gold', 'copper'] as const
const largeCorners = ['panel-020', 'panel-025'] as const
const sizes = [
    { id: 'min', label: '0 × 0 → минимум 44 × 44' },
    { id: 'small', label: '64 × 64' },
    { id: 'wide', label: '240 × 64' },
    { id: 'tall', label: '64 × 160' },
] as const
</script>

<template>
    <section
        class="panel-story-stage"
        data-testid="fantasy-panel-story"
        :aria-label="`FantasyPanel: ${section}`"
        :style="{ color: foreground ?? lightUiColors.button.text }"
    >
        <template v-if="section === 'default'">
            <h2>FantasyPanel</h2>
            <FantasyPanel
                :panel="panel"
                :appearance="appearance"
                :border-color="borderColor || undefined"
                :background-color="backgroundColor || undefined"
                class="panel-default"
                data-testid="panel-default"
            >
                <div class="panel-copy">
                    <h3>Панель с любым содержимым</h3>
                    <p>Форма, оформление и цвет меняются через Controls.</p>
                    <p>Цвет текста задаётся содержимому отдельно от заливки панели.</p>
                </div>
            </FantasyPanel>
        </template>
        <template v-else-if="section === 'variants'">
            <h2>32 формы панелей</h2>
            <div class="panel-variant-grid">
                <figure v-for="variant in variants" :key="variant">
                    <FantasyPanel
                        :panel="variant"
                        :color="lightUiColors.panel.parchment"
                        class="panel-variant"
                        :data-testid="variant"
                    >
                        <span class="panel-copy" aria-hidden="true">✦</span>
                    </FantasyPanel>
                    <figcaption>{{ variant }}</figcaption>
                </figure>
            </div>
        </template>
        <template v-else-if="section === 'appearances'">
            <h2>Три оформления одной формы</h2>
            <p class="panel-description">
                Цвет задаётся панели; синий образец внутри сохраняет свой цвет.
            </p>
            <div class="panel-appearance-grid">
                <figure v-for="example in appearances" :key="example.id">
                    <div class="panel-appearance-probe">
                        <FantasyPanel
                            panel="panel-026"
                            :appearance="example.id"
                            color="red"
                            class="panel-appearance"
                            :data-testid="`panel-appearance-${example.id}`"
                        >
                            <span
                                class="panel-blue-content"
                                role="img"
                                aria-label="Синий образец содержимого"
                            />
                        </FantasyPanel>
                    </div>
                    <figcaption>{{ example.label }}</figcaption>
                </figure>
            </div>
        </template>
        <template v-else-if="section === 'colors'">
            <h2>Цвет панели и независимое содержимое</h2>
            <h3>Светлая палитра</h3>
            <div class="panel-color-grid panel-theme-grid">
                <figure v-for="name in themeColors" :key="name">
                    <div class="panel-color-probe panel-theme-probe">
                        <FantasyPanel
                            :color="lightUiColors.border[name]"
                            class="panel-color"
                            :data-testid="`panel-theme-${name}`"
                        >
                            <span
                                class="panel-blue-content"
                                role="img"
                                aria-label="Синий образец содержимого"
                            />
                        </FantasyPanel>
                    </div>
                    <figcaption>{{ name }}</figcaption>
                </figure>
            </div>
            <h3>Произвольные CSS-цвета</h3>
            <div class="panel-color-grid">
                <figure v-for="example in colorExamples" :key="example.id">
                    <div
                        class="panel-color-probe"
                        :class="`panel-color-probe--${example.id}`"
                        :data-testid="`panel-probe-${example.id}`"
                    >
                        <FantasyPanel
                            :color="example.color"
                            class="panel-color"
                            :data-testid="`panel-color-${example.id}`"
                        >
                            <span
                                class="panel-blue-content"
                                role="img"
                                aria-label="Синий образец содержимого"
                            />
                        </FantasyPanel>
                    </div>
                    <figcaption>{{ example.label }}</figcaption>
                </figure>
            </div>
        </template>
        <template v-else-if="section === 'composition'">
            <h2>Вложенные панели и прокрутка</h2>
            <FantasyPanel
                panel="panel-020"
                :color="lightUiColors.panel.parchment"
                class="panel-composition"
                data-testid="panel-composition"
            >
                <div class="panel-copy">
                    <h3>Письмо путешественнику</h3>
                    <p>Внешняя панель сохраняет орнамент при переносах текста.</p>
                </div>
                <FantasyPanel
                    panel="panel-026"
                    appearance="transparent-center"
                    :color="lightUiColors.border.copper"
                    class="panel-composition-inner"
                    data-testid="panel-composition-inner"
                >
                    <div class="panel-copy">
                        <h3>Вложенная панель</h3>
                        <div
                            class="panel-scroll"
                            tabindex="0"
                            role="region"
                            aria-label="Прокручиваемое письмо"
                        >
                            <p>Полупрозрачная середина показывает поверхность внешней панели.</p>
                            <p>Текст, картинки и другие компоненты сохраняют собственные цвета.</p>
                            <p>
                                Прокручивается только содержимое: декоративные углы остаются на
                                месте.
                            </p>
                            <p>Длинная запись переносится и помещается в отведённую область.</p>
                        </div>
                    </div>
                </FantasyPanel>
            </FantasyPanel>
        </template>
        <template v-else>
            <h2>Размеры и исходные углы</h2>
            <section v-for="variant in largeCorners" :key="variant" class="panel-size-section">
                <h3>{{ variant }} · углы 22 px</h3>
                <div class="panel-size-grid">
                    <figure v-for="size in sizes" :key="size.id">
                        <FantasyPanel
                            :panel="variant"
                            :color="lightUiColors.panel.parchment"
                            :class="`panel-size panel-size--${size.id}`"
                            :data-testid="`panel-size-${variant.slice(-3)}-${size.id}`"
                        />
                        <figcaption>{{ size.label }}</figcaption>
                    </figure>
                </div>
            </section>
        </template>
    </section>
</template>

<style scoped src="./fantasyPanelStory.css"></style>
