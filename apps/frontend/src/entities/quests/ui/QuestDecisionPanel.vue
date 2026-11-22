<script setup lang="ts">
import { useId } from 'vue'

import { UiButton, type UiButtonColors } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { lightUiColors } from '@/shared/ui/theme'

import type { QuestDecisionProps } from './questDecisionProps'

defineProps<QuestDecisionProps>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const headingId = useId()
const cancelColors: UiButtonColors = {
    highlighted: {
        text: lightUiColors.panel.title,
        border: lightUiColors.border.wood,
        backgroundTop: 'transparent',
        backgroundBottom: 'transparent',
    },
    edge: 'transparent',
    shadow: 'transparent',
}
</script>

<template>
    <FantasyBorder
        class="quest-decision"
        border="border-014"
        role="region"
        :color="lightUiColors.border.wood"
        :aria-labelledby="headingId"
    >
        <h2 :id="headingId" class="quest-decision__heading">{{ heading }}</h2>
        <div class="quest-decision__body" role="region" aria-label="Условия поручения" tabindex="0">
            <slot />
        </div>
        <div class="quest-decision__actions">
            <UiButton
                class="quest-decision__action"
                appearance="panel"
                panel="panel-001"
                :disabled="confirmDisabled"
                @click="emit('confirm')"
            >
                {{ confirmLabel }}
            </UiButton>
            <UiButton
                class="quest-decision__action"
                appearance="ghost"
                border="border-001"
                :colors="cancelColors"
                :disabled="cancelDisabled"
                @click="emit('cancel')"
            >
                {{ cancelLabel }}
            </UiButton>
        </div>
    </FantasyBorder>
</template>

<style scoped>
.quest-decision {
    --quest-panel-text: var(--ui-light-panel-text);
    --quest-panel-muted: var(--ui-light-panel-muted);
    --quest-panel-title: var(--ui-light-panel-title);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 12px;
    inline-size: 100%;
    max-inline-size: 544px;
    min-inline-size: 0;
    max-block-size: calc(100dvh - 32px);
    margin-inline: auto;
    padding: clamp(12px, 3.5vw, 24px);
    background: var(--ui-light-panel-coffee);
    color: var(--quest-panel-text);
    overflow-wrap: anywhere;
}

.quest-decision__heading {
    margin: 0;
    color: var(--quest-panel-title);
    font: 500 clamp(17px, 5vw, 22px) / 1.2 var(--ratata-font-family, sans-serif);
    text-align: center;
}

.quest-decision__body {
    min-inline-size: 0;
    min-block-size: 0;
    padding: 4px;
    overflow-y: auto;
    overscroll-behavior: contain;
    font:
        14px/1.5 system-ui,
        sans-serif;
}

.quest-decision__body:focus-visible {
    outline: 2px solid var(--ui-light-button-focus);
    outline-offset: -2px;
}

.quest-decision__body :deep(:where(p, h3, ul, ol, dl)) {
    margin-block: 0 8px;
}

.quest-decision__body :deep(:where(h3)) {
    color: var(--quest-panel-title);
    font: 500 17px/1.25 var(--ratata-font-family, sans-serif);
}

.quest-decision__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    min-inline-size: 0;
}

.quest-decision__action {
    --ui-button-panel-padding: 4px 8px;
    min-inline-size: 0;
    font-size: 15px;
}
</style>
