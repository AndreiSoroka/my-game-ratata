<script setup lang="ts">
import { computed } from 'vue'

import { FantasyBorder, getFantasyBorderMetrics } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

const props = withDefaults(defineProps<{ framed?: boolean; borderWidth?: number }>(), {
    framed: true,
})
defineSlots<{ default?: () => unknown }>()

const theme = useDarkPanelTheme()
const border = computed(() => theme.value?.border ?? 'border-006')
const framePadding = computed(() => {
    const width = props.borderWidth
    return width !== undefined && Number.isFinite(width) && width > 0
        ? width
        : getFantasyBorderMetrics(border.value).cornerSize
})
const framedStyle = computed(() => ({
    ...darkPanelThemeStyle(theme.value),
    padding: `${framePadding.value}px`,
}))
</script>

<template>
    <div
        class="chat-composer-frame"
        :class="{ 'chat-composer-frame--framed': framed }"
        :style="framed ? framedStyle : undefined"
    >
        <FantasyBorder
            v-if="framed"
            as="span"
            :border="border"
            :border-width="borderWidth"
            class="chat-composer-frame__border"
            color="var(--ui-themed-panel-accent, var(--ui-dark-panel-border))"
            aria-hidden="true"
        />
        <slot />
    </div>
</template>

<style scoped>
.chat-composer-frame {
    position: relative;
    isolation: isolate;
    min-inline-size: 0;
}

.chat-composer-frame--framed {
    --chat-composer-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    background: linear-gradient(
        155deg,
        color-mix(
            in srgb,
            var(--chat-composer-surface) 86%,
            var(--ui-themed-panel-accent, var(--ui-dark-bar-track))
        ),
        var(--chat-composer-surface) 70%
    );
}

.chat-composer-frame__border {
    position: absolute;
    z-index: -1;
    inset: 0;
    pointer-events: none;
}
</style>
