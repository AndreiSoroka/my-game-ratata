<script setup lang="ts">
import './rpgControls.css'

import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

import { type CharacterTab, CharacterWindowView } from '@/entities/character-window'

import CharacterCrafting from './CharacterCrafting.vue'
import CharacterDevelopment from './CharacterDevelopment.vue'
import CharacterQuests from './CharacterQuests.vue'
import CharacterStats from './CharacterStats.vue'
import CloseIcon from './CloseIcon.vue'
import { isConfirmationKey, isTextEntry, permitsWorldMovement } from './keyboardOwnership'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import { useEscapeOwner } from './uiEscapeOwners'

defineProps<{
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    snapshot?: WorldSnapshot
}>()
const tab = defineModel<CharacterTab>('tab', { default: 'stats' })
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const view = useTemplateRef<InstanceType<typeof CharacterWindowView>>('view')
const panel = computed(() => view.value?.panel)
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
onMounted(() => window.addEventListener('keydown', toggleKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', toggleKey, true))
</script>

<template>
    <CharacterWindowView
        ref="view"
        v-model:tab="tab"
        class="rpg-panel game-frame-host"
        :nickname="player.nickname"
        :data-world-movement="tab === 'quests' ? 'wasd' : undefined"
        @close="emit('close')"
        @keydown="panelEvent"
        @keyup="panelEvent"
    >
        <template #frame>
            <GameFrame variant="window" />
        </template>
        <template #close="{ buttonAttrs }">
            <GameButton icon v-bind="buttonAttrs"><CloseIcon /></GameButton>
        </template>
        <template #tab="{ label, buttonAttrs }">
            <GameButton v-bind="buttonAttrs">{{ label }}</GameButton>
        </template>
        <template #default="{ tab: activeTab }">
            <CharacterStats v-if="activeTab === 'stats'" :player="player" />
            <CharacterDevelopment
                v-else-if="activeTab === 'development'"
                :player="player"
                :characters="characters"
                @command="emit('command', $event)"
            />
            <CharacterQuests
                v-else-if="activeTab === 'quests'"
                :snapshot="snapshot"
                :player="player"
                :characters="characters"
                @command="emit('command', $event)"
            />
            <CharacterCrafting
                v-else-if="snapshot?.adventure"
                :adventure="snapshot.adventure"
                :alive="player.alive"
                @command="emit('command', $event)"
            />
            <p v-else>Данные ремесла недоступны.</p>
        </template>
        <template #footer>
            Мир продолжает жить · <template v-if="tab === 'quests'">WASD — идти · </template>P или
            Esc — вернуться
        </template>
    </CharacterWindowView>
</template>
