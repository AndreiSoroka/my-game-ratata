<script setup lang="ts">
import './fantasyBorder.css'

import { computed } from 'vue'

import { resolveFantasyBorder } from './borderVariants'
import { createFantasyBorderFilterId } from './filterId'
import type { FantasyBorderProps } from './types'

const props = withDefaults(defineProps<FantasyBorderProps>(), {
    border: 'border-026',
    color: 'currentColor',
})
const filterId = createFantasyBorderFilterId()
const variant = computed(() => resolveFantasyBorder(props.border))
const decoration = computed(() => ({
    '--fantasy-border-image': `url("${variant.value.src}")`,
    '--fantasy-border-slice': String(variant.value.slice),
    '--fantasy-border-size': `${variant.value.slice}px`,
    '--fantasy-border-filter': `url("#${filterId}")`,
}))
</script>

<template>
    <div class="fantasy-border" :data-fantasy-border="variant.key" :style="decoration">
        <svg
            class="fantasy-border__filters"
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
                    <feFlood :style="{ floodColor: color }" result="border-color" />
                    <feComposite in="border-color" in2="SourceAlpha" operator="in" />
                </filter>
            </defs>
        </svg>
        <slot />
    </div>
</template>
