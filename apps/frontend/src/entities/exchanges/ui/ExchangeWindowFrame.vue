<script setup lang="ts">
import { tGame } from '@/shared/lib/i18n'
import { darkPanelButtonColors, UiButton } from '@/shared/ui/common'
import { FantasyBorder, FantasyDivider } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

defineProps<{ title: string }>()
defineSlots<{ default?: () => unknown; summary?: () => unknown; actions?: () => unknown }>()
const emit = defineEmits<{ close: [] }>()
const theme = useDarkPanelTheme()
</script>

<template>
    <FantasyBorder
        class="exchange-window-frame"
        :border="theme?.border ?? 'border-014'"
        color="var(--exchange-frame-accent)"
        :style="darkPanelThemeStyle(theme)"
    >
        <header class="exchange-window-frame__header">
            <h2 :title="title">{{ title }}</h2>
            <UiButton
                class="exchange-window-frame__close"
                appearance="panel"
                panel="panel-001"
                :colors="darkPanelButtonColors"
                :aria-label="tGame('game.automation.closeWithTitle', { title })"
                @click="emit('close')"
            >
                <span aria-hidden="true">×</span>
            </UiButton>
        </header>
        <FantasyDivider
            divider="divider-002"
            ends="both"
            color="var(--exchange-frame-accent)"
            aria-hidden="true"
        />
        <div v-if="$slots.summary" class="exchange-window-frame__summary">
            <slot name="summary" />
        </div>
        <div class="exchange-window-frame__body">
            <slot />
        </div>
        <template v-if="$slots.actions">
            <FantasyDivider
                divider="divider-002"
                ends="both"
                color="var(--exchange-frame-accent)"
                aria-hidden="true"
            />
            <footer class="exchange-window-frame__footer">
                <slot name="actions" />
            </footer>
        </template>
    </FantasyBorder>
</template>

<style scoped>
.exchange-window-frame {
    --exchange-frame-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    --exchange-frame-accent: var(
        --ui-themed-panel-accent,
        color-mix(in srgb, var(--ui-dark-panel-ornament) 68%, var(--ui-dark-panel-positive))
    );
    --exchange-frame-muted: color-mix(
        in srgb,
        var(--ui-dark-panel-text) 70%,
        var(--exchange-frame-surface)
    );
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    block-size: min(800px, 94dvh);
    min-inline-size: 0;
    min-block-size: 0;
    padding: 6px 8px;
    pointer-events: auto;
    background: linear-gradient(
        155deg,
        color-mix(in srgb, var(--exchange-frame-surface) 92%, var(--exchange-frame-accent)),
        var(--exchange-frame-surface) 55%
    );
    color: var(--ui-dark-panel-text);
    font:
        14px/1.4 system-ui,
        sans-serif;
}

.exchange-window-frame > :not(.exchange-window-frame__body) {
    flex: none;
}

.exchange-window-frame__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-inline-size: 0;
    padding-inline: 4px;
}

.exchange-window-frame__header h2 {
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ui-dark-panel-title);
    font: 600 clamp(17px, 3vw, 26px) / 1.2 var(--ratata-font-family, system-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.exchange-window-frame__close {
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

.exchange-window-frame__summary {
    margin-block: 2px 6px;
}

.exchange-window-frame__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 8px;
    min-inline-size: 0;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--exchange-frame-accent) var(--exchange-frame-surface);
}

.exchange-window-frame__footer {
    padding-block-start: 2px;
}

@media (max-width: 600px) {
    .exchange-window-frame {
        block-size: calc(100dvh - 16px);
        padding: 4px;
    }

    .exchange-window-frame__header {
        padding-inline: 2px;
    }
}

@media (max-width: 420px) {
    .exchange-window-frame {
        padding-inline: 1px;
    }
}
</style>
