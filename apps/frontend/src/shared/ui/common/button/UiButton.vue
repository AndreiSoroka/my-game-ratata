<script setup lang="ts">
import './uiButton.css'

import { computed } from 'vue'

import {
    FantasyBorder,
    getFantasyBorderMetrics,
} from '@/shared/ui/external/fantasy-ui-borders/border'
import { FantasyPanel } from '@/shared/ui/external/fantasy-ui-borders/panel'

import { uiButtonColors } from './buttonColors'
import type { UiButtonProps } from './uiButtonProps'

const props = withDefaults(defineProps<UiButtonProps>(), {
    border: 'border-026',
    appearance: 'filled',
    panel: 'panel-004',
    panelAppearance: 'solid',
    variant: 'secondary',
    size: 'default',
    highlighted: undefined,
    focusRing: true,
    disabled: false,
    type: 'button',
})
const buttonStyle = computed(() => {
    const colors = uiButtonColors(props)
    if (props.appearance === 'panel') return colors

    const metrics = getFantasyBorderMetrics(props.border)
    return {
        ...colors,
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
        :class="[
            `ui-button--${appearance}`,
            `ui-button--${variant}`,
            `ui-button--${size}`,
            { 'ui-button--icon': icon },
        ]"
        :data-highlight-managed="highlighted !== undefined"
        :data-highlighted="highlighted"
        :data-selected="selected"
        :data-focus-ring="focusRing"
        :style="buttonStyle"
    >
        <FantasyPanel
            v-if="appearance === 'panel'"
            as="span"
            class="ui-button__panel"
            :panel="panel"
            :appearance="panelAppearance"
            border-color="var(--ui-button-current-border)"
            background-color="var(--ui-button-panel-color)"
            :background-gradient="['var(--ui-button-panel-top)', 'var(--ui-button-panel-bottom)']"
        >
            <span class="ui-button__content"><slot /></span>
        </FantasyPanel>
        <template v-else>
            <FantasyBorder
                as="span"
                class="ui-button__border"
                :border="border"
                :border-width="size === 'default' || nativeBorderWidth ? undefined : 5"
                color="var(--ui-button-current-border)"
                aria-hidden="true"
            />
            <span class="ui-button__content"><slot /></span>
        </template>
    </button>
</template>
