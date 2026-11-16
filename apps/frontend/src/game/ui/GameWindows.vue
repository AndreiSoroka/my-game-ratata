<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'

import CharacterWindow from './CharacterWindow.vue'
import GameMenu from './GameMenu.vue'
import type { useAppWindows } from './useAppWindows'

defineProps<{
    windows: ReturnType<typeof useAppWindows>
    player: CharacterSnapshot | undefined
    characters: CharacterSnapshot[]
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
</script>

<template>
    <CharacterWindow
        v-if="windows.characterOpen.value && player"
        :tab="windows.characterTab.value"
        @update:tab="windows.setCharacterTab"
        :player="player"
        :characters="characters"
        @close="windows.closeCharacter"
        @command="emit('command', $event)"
    />
    <GameMenu
        v-if="windows.gameMenu.open.value"
        :automation-available="Boolean(player)"
        @resume="windows.gameMenu.resume"
        @leave="windows.gameMenu.leave"
        @character="windows.openCharacter"
        @markers="windows.openAutomation('markers')"
        @scenarios="windows.openAutomation('scenarios')"
    />
</template>
