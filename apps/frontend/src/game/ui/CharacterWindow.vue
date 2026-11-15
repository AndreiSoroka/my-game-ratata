<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import CharacterDevelopment from './CharacterDevelopment.vue'
import CharacterStats from './CharacterStats.vue'
import { isTextEntry } from './keyboardOwnership'
import { useEscapeOwner } from './uiEscapeOwners'

defineProps<{ player: CharacterSnapshot; characters: CharacterSnapshot[] }>()
const tab = defineModel<'stats' | 'development'>('tab', { default: 'stats' })
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const panel = ref<HTMLElement>()
useEscapeOwner({ active: () => true, escape: () => emit('close'), element: panel, priority: 120 })
function toggleKey(event: KeyboardEvent): void {
    if (
        event.code !== 'KeyP' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        isTextEntry(event.target)
    )
        return
    const target = event.target
    if (
        target instanceof Element &&
        target.closest('[role="dialog"]') &&
        !panel.value?.contains(target)
    )
        return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!event.repeat) emit('close')
}
function tabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return
    event.preventDefault()
    tab.value =
        event.code === 'Home'
            ? 'stats'
            : event.code === 'End'
              ? 'development'
              : tab.value === 'stats'
                ? 'development'
                : 'stats'
    void nextTick(() =>
        panel.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    )
}
function panelKey(event: KeyboardEvent): void {
    if (event.code !== 'Tab') return
    const elements = Array.from(
        panel.value?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
        ) ?? []
    ).filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert]'))
    const index = elements.findIndex((element) => element === document.activeElement)
    const direction = event.shiftKey ? -1 : 1
    event.preventDefault()
    elements[(index + direction + elements.length) % elements.length]?.focus()
}
onMounted(async () => {
    window.addEventListener('keydown', toggleKey, true)
    await nextTick()
    panel.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', toggleKey, true))
</script>

<template>
    <div class="character-backdrop" @pointerdown.self.prevent.stop>
        <section
            ref="panel"
            class="character-window rpg-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Персонаж"
            tabindex="-1"
            @keydown.capture="panelKey"
            @keydown.stop
            @keyup.stop
        >
            <header class="character-header">
                <div>
                    <span class="character-eyebrow">ПЕРСОНАЖ</span>
                    <h2>{{ player.nickname }}</h2>
                </div>
                <button
                    type="button"
                    class="character-close"
                    aria-label="Закрыть персонажа"
                    @click="emit('close')"
                >
                    ×
                </button>
            </header>
            <div
                class="character-tabs"
                role="tablist"
                aria-label="Разделы персонажа"
                @keydown="tabKey"
            >
                <button
                    id="character-stats-tab"
                    type="button"
                    role="tab"
                    :aria-selected="tab === 'stats'"
                    aria-controls="character-stats-panel"
                    :tabindex="tab === 'stats' ? 0 : -1"
                    @click="tab = 'stats'"
                >
                    Характеристики
                </button>
                <button
                    id="character-development-tab"
                    type="button"
                    role="tab"
                    :aria-selected="tab === 'development'"
                    aria-controls="character-development-panel"
                    :tabindex="tab === 'development' ? 0 : -1"
                    @click="tab = 'development'"
                >
                    Развитие
                </button>
            </div>
            <div class="character-content">
                <div
                    v-if="tab === 'stats'"
                    id="character-stats-panel"
                    role="tabpanel"
                    aria-labelledby="character-stats-tab"
                >
                    <CharacterStats :player="player" />
                </div>
                <div
                    v-else
                    id="character-development-panel"
                    role="tabpanel"
                    aria-labelledby="character-development-tab"
                >
                    <CharacterDevelopment
                        :player="player"
                        :characters="characters"
                        @command="emit('command', $event)"
                    />
                </div>
            </div>
            <footer>Мир продолжает жить · P или Esc — вернуться</footer>
        </section>
    </div>
</template>

<style scoped>
.character-backdrop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: #071016c9;
    z-index: 95;
}
.character-window {
    display: flex;
    flex-direction: column;
    width: min(1100px, 100%);
    max-height: calc(100dvh - 40px);
    min-height: min(660px, calc(100dvh - 40px));
    box-sizing: border-box;
    border: 1px solid #bba06b;
    background: #0d1b24;
    color: #eee6d2;
    font:
        14px/1.5 system-ui,
        sans-serif;
    box-shadow: 0 20px 100px #0009;
}
.character-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px 16px;
    border-bottom: 1px solid #53616a;
}
.character-eyebrow {
    color: #a5b3bc;
    font-size: 10px;
    letter-spacing: 3px;
}
h2 {
    margin: 3px 0 0;
    font-size: 22px;
    color: #f1d69a;
}
button {
    color: inherit;
    font: inherit;
    cursor: pointer;
}
button:focus-visible {
    outline: 2px solid #f0d287;
    outline-offset: 3px;
}
.character-close {
    width: 44px;
    height: 44px;
    font-size: 28px;
    border: 1px solid #52616a;
    background: #1b2a34;
}
.character-tabs {
    display: flex;
    padding: 0 24px;
    gap: 24px;
    border-bottom: 1px solid #53616a;
}
.character-tabs button {
    padding: 14px 0 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: #9dabb4;
}
.character-tabs button[aria-selected='true'] {
    color: #f1d69a;
    border-bottom-color: #e9c77d;
}
.character-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 22px 24px;
    scrollbar-color: #7b876e #11202a;
}
footer {
    padding: 10px 24px;
    border-top: 1px solid #344752;
    color: #8c9ea8;
    font-size: 11px;
}
@media (max-width: 600px) {
    .character-backdrop {
        padding: 8px;
    }
    .character-window {
        max-height: calc(100dvh - 16px);
        min-height: calc(100dvh - 16px);
    }
    .character-header {
        padding: 14px;
    }
    .character-tabs {
        padding: 0 14px;
        gap: 18px;
    }
    .character-content {
        padding: 16px 12px;
    }
    h2 {
        font-size: 19px;
    }
    footer {
        padding: 8px 14px;
    }
}
</style>
