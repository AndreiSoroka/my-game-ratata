<script setup lang="ts">
import { DarkWindowFrame } from '@/shared/ui/common'

defineProps<{ title: string }>()
defineSlots<{ default?: () => unknown; summary?: () => unknown; actions?: () => unknown }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
    <DarkWindowFrame class="exchange-window-frame" :title="title" @close="emit('close')">
        <template v-if="$slots.summary" #summary>
            <slot name="summary" />
        </template>
        <slot />
        <template v-if="$slots.actions" #actions>
            <slot name="actions" />
        </template>
    </DarkWindowFrame>
</template>

<style scoped>
.exchange-window-frame {
    --dark-window-max-block-size: none;
    --exchange-frame-surface: var(--dark-window-surface);
    --exchange-frame-accent: var(--dark-window-accent);
    --exchange-frame-muted: var(--dark-window-muted);
    block-size: min(800px, 94dvh);
}

@media (max-width: 600px) {
    .exchange-window-frame {
        block-size: calc(100dvh - 16px);
    }
}
</style>
