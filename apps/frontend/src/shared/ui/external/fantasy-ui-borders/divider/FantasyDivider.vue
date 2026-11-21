<script setup lang="ts">
import './fantasyDivider.css'

import { computed } from 'vue'

import { resolveFantasyDivider } from './dividerVariants'
import type { FantasyDividerProps } from './fantasyDividerProps'
import { createFantasyDividerFilterId } from './filterId'

const props = withDefaults(defineProps<FantasyDividerProps>(), {
    divider: 'divider-000',
    fade: false,
    ends: 'right',
    color: 'currentColor',
})
const filterId = createFantasyDividerFilterId()
const variant = computed(() => resolveFantasyDivider(props.divider))
const ends = computed(() => (props.ends === 'left' || props.ends === 'both' ? props.ends : 'right'))
const decoration = computed(() => ({
    '--fantasy-divider-image': `url("${props.fade ? variant.value.fadeSrc : variant.value.src}")`,
    '--fantasy-divider-height': `${variant.value.height}px`,
    '--fantasy-divider-cap': String(variant.value.capWidth),
    '--fantasy-divider-cap-width': `${variant.value.capWidth}px`,
    '--fantasy-divider-filter': `url("#${filterId}")`,
}))
</script>

<template>
    <div
        class="fantasy-divider"
        :class="{
            'fantasy-divider--left': ends === 'left',
            'fantasy-divider--both': ends === 'both',
        }"
        :data-fantasy-divider="variant.key"
        :data-fantasy-divider-fade="fade"
        :data-fantasy-divider-ends="ends"
        :style="decoration"
        role="separator"
        aria-orientation="horizontal"
    >
        <svg
            class="fantasy-divider__filters"
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
                    <feFlood :style="{ floodColor: color }" result="divider-color" />
                    <feComposite in="divider-color" in2="SourceAlpha" operator="in" />
                </filter>
            </defs>
        </svg>
    </div>
</template>
