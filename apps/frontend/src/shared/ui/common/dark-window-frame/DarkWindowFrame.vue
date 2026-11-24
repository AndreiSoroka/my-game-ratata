<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'
import { FantasyBorder, FantasyDivider } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import { darkPanelButtonColors, UiButton } from '../button'

defineProps<{ title: string; closeLabel?: string | undefined }>()
defineSlots<{ default?: () => unknown; summary?: () => unknown; actions?: () => unknown }>()
const emit = defineEmits<{ close: [] }>()
const theme = useDarkPanelTheme()
</script>

<template>
    <FantasyBorder
        class="dark-window-frame"
        :border="theme?.border ?? 'border-014'"
        color="var(--dark-window-accent)"
        :style="darkPanelThemeStyle(theme)"
    >
        <header class="dark-window-frame__header">
            <h2 :title="title">{{ title }}</h2>
            <UiButton
                class="dark-window-frame__close"
                appearance="panel"
                panel="panel-001"
                :colors="darkPanelButtonColors"
                :aria-label="closeLabel || tGame('game.automation.closeWithTitle', { title })"
                @click="emit('close')"
            >
                <span aria-hidden="true">×</span>
            </UiButton>
        </header>
        <FantasyDivider
            divider="divider-002"
            ends="both"
            color="var(--dark-window-accent)"
            aria-hidden="true"
        />
        <div v-if="$slots.summary" class="dark-window-frame__summary">
            <slot name="summary" />
        </div>
        <div class="dark-window-frame__body">
            <slot />
        </div>
        <template v-if="$slots.actions">
            <FantasyDivider
                divider="divider-002"
                ends="both"
                color="var(--dark-window-accent)"
                aria-hidden="true"
            />
            <footer class="dark-window-frame__footer">
                <slot name="actions" />
            </footer>
        </template>
    </FantasyBorder>
</template>

<style scoped>
.dark-window-frame {
    --dark-window-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    --dark-window-accent: var(
        --ui-themed-panel-accent,
        color-mix(in srgb, var(--ui-dark-panel-ornament) 68%, var(--ui-dark-panel-positive))
    );
    --dark-window-muted: color-mix(
        in srgb,
        var(--ui-dark-panel-text) 70%,
        var(--dark-window-surface)
    );
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    max-block-size: var(--dark-window-max-block-size, calc(100dvh - 32px));
    min-inline-size: 0;
    min-block-size: 0;
    padding: 6px 8px;
    pointer-events: auto;
    background: linear-gradient(
        155deg,
        color-mix(in srgb, var(--dark-window-surface) 92%, var(--dark-window-accent)),
        var(--dark-window-surface) 55%
    );
    color: var(--ui-dark-panel-text);
    font:
        14px/1.4 system-ui,
        sans-serif;
}

.dark-window-frame > :not(.dark-window-frame__body) {
    flex: none;
}

.dark-window-frame__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-inline-size: 0;
    padding-inline: 4px;
}

.dark-window-frame__header h2 {
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ui-dark-panel-title);
    font: 600 clamp(17px, 3vw, 26px) / 1.2 var(--ratata-font-family, system-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dark-window-frame__close {
    --ui-button-panel-padding: 0;
    flex: none;
    min-inline-size: 32px;
    min-block-size: 32px;
    inline-size: 32px;
    block-size: 32px;
    font:
        600 22px/1 system-ui,
        sans-serif;
}

.dark-window-frame__summary {
    margin-block: 2px 6px;
}

.dark-window-frame__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 8px;
    min-inline-size: 0;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--dark-window-accent) var(--dark-window-surface);
}

.dark-window-frame__footer {
    padding-block-start: 2px;
}

@media (max-width: 600px) {
    .dark-window-frame {
        padding: 4px;
    }

    .dark-window-frame__header {
        padding-inline: 2px;
    }
}

@media (max-width: 420px) {
    .dark-window-frame {
        padding-inline: 1px;
    }
}
</style>
