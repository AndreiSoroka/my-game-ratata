<script setup lang="ts">
import { computed } from 'vue'

import {
    FantasyBorder,
    type FantasyBorderVariant,
    getFantasyBorderMetrics,
} from '@/shared/ui/external/fantasy-ui-borders/border'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

const props = withDefaults(defineProps<{ border?: FantasyBorderVariant }>(), {
    border: 'border-017',
})
const theme = useDarkPanelTheme()
const borderWidth = computed(() => getFantasyBorderMetrics(props.border).cornerSize)
const frameStyle = computed(() => {
    if (!theme.value) return undefined
    return {
        ...darkPanelThemeStyle(theme.value),
        '--character-hud-border': theme.value.accent,
    }
})
</script>

<template>
    <div class="hud-frame" :style="frameStyle">
        <FantasyBorder
            class="hud-frame__border"
            :border="theme?.border ?? border"
            :border-width="borderWidth"
            color="var(--character-hud-border, var(--ui-dark-panel-border))"
        >
            <slot />
        </FantasyBorder>
    </div>
</template>

<style scoped>
.hud-frame {
    --character-hud-fill: var(
        --ui-themed-panel-surface,
        var(--character-hud-surface, var(--ui-dark-panel-surface))
    );
    --character-hud-text: var(--ui-dark-panel-text);
    --character-hud-positive: var(--ui-dark-panel-positive);
    --character-hud-warning: var(--ui-dark-panel-warning);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    padding: 7px;
    background: linear-gradient(
        155deg,
        color-mix(in srgb, var(--character-hud-fill) 78%, var(--ui-themed-panel-accent, #708067f2)),
        var(--character-hud-fill) 58%,
        color-mix(in srgb, var(--character-hud-fill) 66%, #070f0bf2)
    );
    box-shadow:
        inset 0 1px #f2e3bf26,
        inset 0 -1px #070f0bbf;
    color: var(--character-hud-text);
}

.hud-frame__border {
    display: flex;
    flex: 1;
    flex-direction: column;
    container-type: inline-size;
    min-width: 0;
    min-height: 0;
}
</style>
