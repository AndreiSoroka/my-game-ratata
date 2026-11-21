<script setup lang="ts">
import './fantasyPanel.css'

import { computed } from 'vue'

import { createFantasyPanelFilterId } from './filterId'
import gradientAlpha from './gradient-alpha.svg?inline'
import { FANTASY_PANEL_VARIANTS, resolveFantasyPanel } from './panelVariants'
import type { FantasyPanelProps } from './types'

const props = withDefaults(defineProps<FantasyPanelProps>(), {
    as: 'div',
    panel: 'panel-026',
    appearance: 'solid',
    color: 'currentColor',
})
const filterId = createFantasyPanelFilterId()
const gradientFilterId = `${filterId}-gradient`
const variant = computed(() => resolveFantasyPanel(props.panel, props.appearance))
const borderColor = computed(() => props.borderColor ?? props.color)
const backgroundColor = computed(() => props.backgroundColor ?? props.color)
const splitColors = computed(
    () => props.backgroundGradient !== undefined || borderColor.value !== backgroundColor.value
)
const transparentOpacity = 127 / 255
const borderOpacity = computed(() =>
    variant.value.appearance === 'transparent-border' ? transparentOpacity : 1
)
const backgroundOpacity = computed(() =>
    variant.value.appearance === 'transparent-center' ? transparentOpacity : 1
)
const image = computed(() =>
    splitColors.value
        ? FANTASY_PANEL_VARIANTS[variant.value.key].transparentCenterSrc
        : variant.value.src
)
const decoration = computed(() => ({
    '--fantasy-panel-image': `url("${image.value}")`,
    '--fantasy-panel-slice': String(variant.value.slice),
    '--fantasy-panel-size': `${variant.value.slice}px`,
    '--fantasy-panel-filter': `url("#${filterId}")`,
    '--fantasy-panel-gradient-filter': props.backgroundGradient
        ? `url("#${gradientFilterId}")`
        : undefined,
    '--fantasy-panel-color': backgroundColor.value,
    '--fantasy-panel-center-opacity': `${backgroundOpacity.value * 100}%`,
}))
</script>

<template>
    <component
        :is="as"
        class="fantasy-panel"
        :class="{ 'fantasy-panel--gradient': backgroundGradient }"
        :data-fantasy-panel="variant.key"
        :data-fantasy-panel-appearance="variant.appearance"
        :style="decoration"
    >
        <svg
            class="fantasy-panel__filters"
            xmlns="http://www.w3.org/2000/svg"
            width="0"
            height="0"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <filter
                    :id="filterId"
                    x="0"
                    y="0"
                    width="1"
                    height="1"
                    color-interpolation-filters="sRGB"
                >
                    <template v-if="splitColors">
                        <!-- The transparent-center PNG marks cutouts, fill and ornament with alpha 0, 127 and 255. -->
                        <feComponentTransfer in="SourceAlpha" result="panel-border-mask">
                            <feFuncA type="discrete" :tableValues="`0 0 ${borderOpacity}`" />
                        </feComponentTransfer>
                        <feFlood :style="{ floodColor: borderColor }" result="panel-border-color" />
                        <feComposite
                            in="panel-border-color"
                            in2="panel-border-mask"
                            operator="in"
                            result="panel-ornament"
                        />
                        <template v-if="!backgroundGradient">
                            <feComponentTransfer in="SourceAlpha" result="panel-fill-mask">
                                <feFuncA
                                    type="discrete"
                                    :tableValues="`0 ${backgroundOpacity} 0`"
                                />
                            </feComponentTransfer>
                            <feFlood
                                :style="{ floodColor: backgroundColor }"
                                result="panel-fill-color"
                            />
                            <feComposite
                                in="panel-fill-color"
                                in2="panel-fill-mask"
                                operator="in"
                                result="panel-fill"
                            />
                            <feMerge>
                                <feMergeNode in="panel-fill" />
                                <feMergeNode in="panel-ornament" />
                            </feMerge>
                        </template>
                    </template>
                    <template v-else>
                        <feFlood :style="{ floodColor: borderColor }" result="panel-color" />
                        <feComposite in="panel-color" in2="SourceAlpha" operator="in" />
                    </template>
                </filter>
                <filter
                    v-if="backgroundGradient"
                    :id="gradientFilterId"
                    x="0"
                    y="0"
                    width="1"
                    height="1"
                    primitiveUnits="objectBoundingBox"
                    color-interpolation-filters="sRGB"
                >
                    <feComponentTransfer in="SourceAlpha" result="panel-fill-mask">
                        <feFuncA type="discrete" :tableValues="`0 ${backgroundOpacity} 0`" />
                    </feComponentTransfer>
                    <!-- Blend the theme colors with complementary weights before applying the surface alpha. -->
                    <feImage
                        :href="gradientAlpha"
                        x="0"
                        y="0"
                        width="1"
                        height="1"
                        preserveAspectRatio="none"
                        result="panel-gradient-alpha"
                    />
                    <feFlood
                        :style="{ floodColor: backgroundGradient[0] }"
                        result="panel-top-color"
                    />
                    <feComposite in2="panel-gradient-alpha" operator="in" result="panel-top" />
                    <feFlood
                        :style="{ floodColor: backgroundGradient[1] }"
                        result="panel-bottom-color"
                    />
                    <feComposite in2="panel-gradient-alpha" operator="out" />
                    <feComposite in2="panel-top" operator="arithmetic" k2="1" k3="1" />
                    <feComposite in2="panel-fill-mask" operator="in" />
                </filter>
            </defs>
        </svg>
        <slot />
    </component>
</template>
