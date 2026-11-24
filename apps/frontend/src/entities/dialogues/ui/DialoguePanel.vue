<script setup lang="ts">
import { darkPanelButtonColors, DarkWindowFrame, UiButton } from '@/shared/ui/common'

import type { DialogueChoice } from '../model/dialogue'

defineProps<{
    title: string
    closeLabel: string
    heading?: string | undefined
    inlineText?: string | undefined
    hint?: string | undefined
    choices?: readonly DialogueChoice[] | undefined
}>()
defineSlots<{ identity?: () => unknown; navigation?: () => unknown; default?: () => unknown }>()
const emit = defineEmits<{ choose: [id: string]; close: [] }>()
</script>

<template>
    <DarkWindowFrame
        class="dialogue-panel"
        :title="title"
        :close-label="closeLabel"
        @close="emit('close')"
    >
        <template v-if="$slots.identity || $slots.navigation" #summary>
            <div class="dialogue-panel__summary">
                <slot name="identity" />
                <slot name="navigation" />
            </div>
        </template>
        <h3 v-if="heading" class="dialogue-panel__heading">{{ heading }}</h3>
        <p v-if="inlineText" class="dialogue-panel__text">{{ inlineText }}</p>
        <p v-if="hint" class="dialogue-panel__hint">{{ hint }}</p>
        <div v-if="choices?.length" class="dialogue-panel__choices">
            <UiButton
                v-for="choice in choices"
                :key="choice.id"
                :data-dialogue-action="choice.id"
                appearance="panel"
                panel="panel-001"
                :colors="darkPanelButtonColors"
                @click="emit('choose', choice.id)"
            >
                {{ choice.label }}
            </UiButton>
        </div>
        <slot />
    </DarkWindowFrame>
</template>

<style scoped>
.dialogue-panel__summary,
.dialogue-panel__choices {
    display: grid;
    min-inline-size: 0;
    gap: 6px;
}

.dialogue-panel__heading,
.dialogue-panel__text,
.dialogue-panel__hint {
    margin: 0;
    padding-inline: 4px;
    overflow-wrap: anywhere;
}

.dialogue-panel__heading {
    color: var(--ui-dark-panel-title);
    font: 600 16px/1.3 var(--ratata-font-family, system-ui);
}

.dialogue-panel__text {
    white-space: pre-line;
}

.dialogue-panel__hint {
    color: var(--dark-window-muted, var(--ui-dark-panel-text));
    font-size: 12px;
}

.dialogue-panel__choices .ui-button {
    min-block-size: 40px;
    font-size: 14px;
    text-align: start;
}

.dialogue-panel__choices :deep(.ui-button__panel) {
    justify-content: flex-start;
}
</style>
