<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import CharacterCrafting from './CharacterCrafting.vue'
import CharacterDevelopment from './CharacterDevelopment.vue'
import CharacterQuests from './CharacterQuests.vue'
import CharacterStats from './CharacterStats.vue'
import CloseIcon from './CloseIcon.vue'
import { isConfirmationKey, isTextEntry, permitsWorldMovement } from './keyboardOwnership'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import { useEscapeOwner } from './uiEscapeOwners'
import type { CharacterTab } from './useCharacterWindow'

defineProps<{
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    snapshot?: WorldSnapshot
}>()
const tab = defineModel<CharacterTab>('tab', { default: 'stats' })
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
    const tabs: CharacterTab[] = ['stats', 'development', 'quests', 'crafting']
    const index = tabs.indexOf(tab.value)
    tab.value =
        tabs[
            event.code === 'Home'
                ? 0
                : event.code === 'End'
                  ? tabs.length - 1
                  : (index + (event.code === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        ]!
    void nextTick(() =>
        panel.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    )
}
function panelKey(event: KeyboardEvent): void {
    if (tab.value === 'quests' || event.code !== 'Tab') return
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
function panelEvent(event: KeyboardEvent): void {
    if (
        event.repeat &&
        isConfirmationKey(event) &&
        event.target instanceof HTMLElement &&
        event.target.closest('button')
    )
        event.preventDefault()
    if (!permitsWorldMovement(event)) event.stopPropagation()
}
onMounted(async () => {
    window.addEventListener('keydown', toggleKey, true)
    await nextTick()
    panel.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', toggleKey, true))
</script>

<template>
    <div
        class="character-backdrop"
        :class="{ 'character-backdrop--reading': tab === 'quests' }"
        @pointerdown.self.prevent.stop
    >
        <section
            ref="panel"
            class="character-window rpg-panel game-frame-host"
            role="dialog"
            :aria-modal="tab !== 'quests' || undefined"
            :data-world-movement="tab === 'quests' ? 'wasd' : undefined"
            aria-label="Персонаж"
            tabindex="-1"
            @keydown.capture="panelKey"
            @keydown="panelEvent"
            @keyup="panelEvent"
        >
            <GameFrame variant="window" />
            <header class="character-header">
                <div>
                    <span class="character-eyebrow">ПЕРСОНАЖ</span>
                    <h2>{{ player.nickname }}</h2>
                </div>
                <GameButton
                    icon
                    class="character-close"
                    aria-label="Закрыть персонажа"
                    @click="emit('close')"
                >
                    <CloseIcon />
                </GameButton>
            </header>
            <div
                class="character-tabs"
                role="tablist"
                aria-label="Разделы персонажа"
                @keydown="tabKey"
            >
                <GameButton
                    id="character-stats-tab"
                    role="tab"
                    :aria-selected="tab === 'stats'"
                    aria-controls="character-stats-panel"
                    :tabindex="tab === 'stats' ? 0 : -1"
                    @click="tab = 'stats'"
                >
                    Характеристики
                </GameButton>
                <GameButton
                    id="character-development-tab"
                    role="tab"
                    :aria-selected="tab === 'development'"
                    aria-controls="character-development-panel"
                    :tabindex="tab === 'development' ? 0 : -1"
                    @click="tab = 'development'"
                >
                    Развитие
                </GameButton>
                <GameButton
                    id="character-quests-tab"
                    role="tab"
                    :aria-selected="tab === 'quests'"
                    aria-controls="character-quests-panel"
                    :tabindex="tab === 'quests' ? 0 : -1"
                    @click="tab = 'quests'"
                >
                    Квесты
                </GameButton>
                <GameButton
                    id="character-crafting-tab"
                    role="tab"
                    :aria-selected="tab === 'crafting'"
                    aria-controls="character-crafting-panel"
                    :tabindex="tab === 'crafting' ? 0 : -1"
                    @click="tab = 'crafting'"
                >
                    Ремесло
                </GameButton>
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
                    v-else-if="tab === 'development'"
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
                <div
                    v-else-if="tab === 'quests'"
                    id="character-quests-panel"
                    role="tabpanel"
                    aria-labelledby="character-quests-tab"
                >
                    <CharacterQuests
                        :snapshot="snapshot"
                        :player="player"
                        :characters="characters"
                        @command="emit('command', $event)"
                    />
                </div>
                <div
                    v-else
                    id="character-crafting-panel"
                    role="tabpanel"
                    aria-labelledby="character-crafting-tab"
                >
                    <CharacterCrafting
                        v-if="snapshot?.adventure"
                        :adventure="snapshot.adventure"
                        :alive="player.alive"
                        @command="emit('command', $event)"
                    />
                    <p v-else>Данные ремесла недоступны.</p>
                </div>
            </div>
            <footer>
                Мир продолжает жить · <template v-if="tab === 'quests'">WASD — идти · </template>P
                или Esc — вернуться
            </footer>
        </section>
    </div>
</template>

<style scoped src="./characterWindow.css"></style>
