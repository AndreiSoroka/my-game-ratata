<script setup lang="ts">
import './uiButton.css'

import { computed } from 'vue'

import {
    FantasyBorder,
    getFantasyBorderMetrics,
} from '@/shared/ui/external/fantasy-ui-borders/border'

import { uiButtonColors } from './buttonColors'
import type { UiButtonProps } from './types'

const props = withDefaults(defineProps<UiButtonProps>(), {
    border: 'border-026',
    appearance: 'filled',
    variant: 'secondary',
    highlighted: undefined,
    focusRing: true,
    disabled: false,
    type: 'button',
})
const colors = computed(() => {
    const metrics = getFantasyBorderMetrics(props.border)
    return {
        ...uiButtonColors(props),
        '--ui-button-border-corner': `${metrics.cornerSize}px`,
        '--ui-button-border-edge': `${metrics.edgeSize}px`,
    }
})
</script>

<template>
    <button
        :type="type"
        :disabled="disabled"
        class="ui-button"
        :class="[`ui-button--${appearance}`, `ui-button--${variant}`]"
        :data-highlight-managed="highlighted !== undefined"
        :data-highlighted="highlighted"
        :data-focus-ring="focusRing"
        :style="colors"
    >
        <FantasyBorder
            as="span"
            class="ui-button__border"
            :border="border"
            color="var(--ui-button-current-border)"
            aria-hidden="true"
        />
        <span class="ui-button__content"><slot /></span>
    </button>
</template>
