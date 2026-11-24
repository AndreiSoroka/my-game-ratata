<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton, type UiButtonColors } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { lightUiColors } from '@/shared/ui/theme'

import type { QuestDecisionProps } from './questDecisionProps'

defineProps<QuestDecisionProps>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const headingId = useId()
const scrollHintId = useId()
const scroller = useTemplateRef<HTMLDivElement>('scroller')
const content = useTemplateRef<HTMLDivElement>('content')
const moreBelow = ref(false)
let observer: ResizeObserver | undefined

function updateScrollHint(): void {
    const body = scroller.value
    if (!body) return

    const remaining = body.scrollHeight - body.clientHeight - Math.max(0, body.scrollTop)
    moreBelow.value = body.clientHeight > 0 && remaining > 1
}

onMounted(() => {
    updateScrollHint()
    if (!scroller.value || !content.value || typeof ResizeObserver === 'undefined') return

    observer = new ResizeObserver(updateScrollHint)
    observer.observe(scroller.value)
    observer.observe(content.value)
})
onBeforeUnmount(() => observer?.disconnect())

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
        <div class="quest-decision__scroll-area">
            <div
                ref="scroller"
                class="quest-decision__body"
                role="region"
                :aria-label="tGame('game.quests.requestTerms')"
                :aria-describedby="moreBelow ? scrollHintId : undefined"
                tabindex="0"
                @scroll.passive="updateScrollHint"
            >
                <div ref="content" class="quest-decision__content">
                    <slot />
                </div>
            </div>
            <div v-if="moreBelow" :id="scrollHintId" class="quest-decision__scroll-hint">
                <span aria-hidden="true">↓</span>
                {{ tGame('game.quests.scrollForMore') }}
            </div>
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

.quest-decision__scroll-area {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-inline-size: 0;
    min-block-size: 0;
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

.quest-decision__content {
    display: flow-root;
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

.quest-decision__scroll-hint {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    display: flex;
    justify-content: center;
    gap: 5px;
    padding: 16px 4px 2px;
    background: linear-gradient(transparent, var(--ui-light-panel-coffee) 65%);
    color: var(--quest-panel-title);
    font:
        600 12px/1.4 system-ui,
        sans-serif;
    pointer-events: none;
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
