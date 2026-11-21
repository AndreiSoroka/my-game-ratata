<script setup lang="ts">
import { FantasyBorder } from '@/shared/ui/external'

withDefaults(defineProps<{ framed?: boolean }>(), { framed: true })
defineSlots<{ default?: () => unknown }>()

const borderWidth = 12
</script>

<template>
    <div
        class="chat-composer-frame"
        :class="{ 'chat-composer-frame--framed': framed }"
        :style="framed ? { padding: `${borderWidth}px` } : undefined"
    >
        <FantasyBorder
            v-if="framed"
            as="span"
            border="border-006"
            :border-width="borderWidth"
            class="chat-composer-frame__border"
            color="var(--ui-dark-panel-border)"
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
    background: linear-gradient(
        155deg,
        color-mix(in srgb, var(--ui-dark-panel-surface) 86%, var(--ui-dark-bar-track)),
        var(--ui-dark-panel-surface) 70%
    );
}

.chat-composer-frame__border {
    position: absolute;
    z-index: -1;
    inset: 0;
    pointer-events: none;
}
</style>
