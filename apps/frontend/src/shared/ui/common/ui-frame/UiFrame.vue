<script setup lang="ts">
import './uiFrame.css'

import { computed } from 'vue'

import { FantasyBorder } from '@/shared/ui/external/fantasy-ui-borders/border'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

const props = withDefaults(
    defineProps<{
        variant?: 'window' | 'panel' | 'inset' | 'speech'
        skin?: 'default' | 'parchment'
    }>(),
    { variant: 'panel', skin: 'default' }
)
const inheritedTheme = useDarkPanelTheme()
const theme = computed(() =>
    props.skin === 'default' && props.variant !== 'speech' ? inheritedTheme.value : undefined
)
const border = computed(() => {
    if (theme.value) return theme.value.border
    if (props.skin !== 'default') return undefined
    if (props.variant === 'window') return 'border-014'
    if (props.variant === 'panel') return 'border-015'
    return undefined
})
</script>

<template>
    <span
        class="game-frame"
        :class="[
            `game-frame--${variant}`,
            { 'game-frame--parchment': skin === 'parchment', 'game-frame--themed': theme },
        ]"
        :style="darkPanelThemeStyle(theme)"
        aria-hidden="true"
    >
        <FantasyBorder
            v-if="border"
            as="span"
            class="game-frame__theme-border"
            :border="border"
            :color="theme?.accent ?? 'var(--ui-dark-panel-border)'"
        />
    </span>
</template>
