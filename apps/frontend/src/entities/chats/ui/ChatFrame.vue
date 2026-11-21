<script setup lang="ts">
import { HudFrame } from '@/shared/ui/common'

defineProps<{ collapsed?: boolean }>()

defineSlots<{
    toolbar?: () => unknown
    history?: () => unknown
    composer?: () => unknown
}>()
</script>

<template>
    <HudFrame
        class="chat-frame"
        :class="{ 'chat-frame--collapsed': collapsed }"
        border="border-006"
    >
        <div class="chat-frame__layout">
            <div v-if="$slots.toolbar" class="chat-frame__toolbar">
                <slot name="toolbar" />
            </div>
            <div
                v-if="$slots.history"
                v-show="!collapsed || !$slots.composer"
                class="chat-frame__history"
            >
                <slot name="history" />
            </div>
            <div v-if="$slots.composer" class="chat-frame__composer">
                <slot name="composer" />
            </div>
        </div>
    </HudFrame>
</template>

<style scoped>
.chat-frame:not(.chat-frame--collapsed) {
    block-size: clamp(208px, 33dvh + 12px, 276px);
}

.chat-frame__layout {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
    min-inline-size: 0;
    gap: 6px;
}

.chat-frame__layout > :not(.chat-frame__history) {
    flex: none;
}

.chat-frame__history {
    display: grid;
    flex: 1;
    grid-template-rows: minmax(0, 1fr);
    min-block-size: 0;
    min-inline-size: 0;
}

.chat-frame--collapsed .chat-frame__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
}

.chat-frame--collapsed .chat-frame__history,
.chat-frame--collapsed .chat-frame__composer {
    grid-area: 1 / 1;
}

.chat-frame--collapsed .chat-frame__toolbar {
    grid-area: 1 / 2;
}
</style>
