<script setup lang="ts">
import './fantasyPanel.css'

import { computed } from 'vue'

import { createFantasyPanelFilterId } from './filterId'
import { resolveFantasyPanel } from './panelVariants'
import type { FantasyPanelProps } from './types'

const props = withDefaults(defineProps<FantasyPanelProps>(), {
    panel: 'panel-026',
    appearance: 'solid',
    color: 'currentColor',
})
const filterId = createFantasyPanelFilterId()
const variant = computed(() => resolveFantasyPanel(props.panel, props.appearance))
const decoration = computed(() => ({
    '--fantasy-panel-image': `url("${variant.value.src}")`,
    '--fantasy-panel-slice': String(variant.value.slice),
    '--fantasy-panel-size': `${variant.value.slice}px`,
    '--fantasy-panel-filter': `url("#${filterId}")`,
    '--fantasy-panel-color': props.color,
    '--fantasy-panel-center-opacity':
        variant.value.appearance === 'transparent-center' ? `${(127 / 255) * 100}%` : '100%',
}))
</script>

<template>
    <div
        class="fantasy-panel"
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
                    <feFlood :style="{ floodColor: color }" result="panel-color" />
                    <feComposite in="panel-color" in2="SourceAlpha" operator="in" />
                </filter>
            </defs>
        </svg>
        <slot />
    </div>
</template>
