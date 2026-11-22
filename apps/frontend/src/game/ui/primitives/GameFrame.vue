<script setup lang="ts">
import './gameUi.css'

import { computed } from 'vue'

import { FantasyBorder } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

const props = withDefaults(
    defineProps<{
        variant?: 'window' | 'panel' | 'inset' | 'speech'
        skin?: 'default' | 'parchment'
        borderWidth?: number
    }>(),
    { variant: 'panel', skin: 'default' }
)
const inheritedTheme = useDarkPanelTheme()
const theme = computed(() =>
    props.skin === 'default' && props.variant !== 'speech' ? inheritedTheme.value : undefined
)
const borderWidths = { window: 9, panel: 7, inset: 5, speech: 5 }
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
            v-if="theme"
            as="span"
            class="game-frame__theme-border"
            :border="theme.border"
            :color="theme.accent"
            :border-width="borderWidth ?? borderWidths[variant]"
        />
    </span>
</template>
