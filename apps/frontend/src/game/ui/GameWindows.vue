<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import CharacterWindow from './CharacterWindow.vue'
import DeathOverlay from './DeathOverlay.vue'
import GameMenu from './GameMenu.vue'
import SocialPanels from './SocialPanels.vue'
import type { useAppWindows } from './useAppWindows'

defineProps<{
    windows: ReturnType<typeof useAppWindows>
    player: CharacterSnapshot | undefined
    characters: CharacterSnapshot[]
    snapshot: WorldSnapshot | undefined
    connected: boolean
    defeated: boolean
    abandoning: boolean
}>()
const emit = defineEmits<{
    command: [message: ClientMessage]
    open: []
    abandonLife: []
    newLife: []
}>()
const social = ref<InstanceType<typeof SocialPanels>>()
defineExpose({
    hasOpenWindow: computed(() => social.value?.hasOpenWindow ?? false),
    command: (message: ClientMessage) => social.value?.command(message),
})
</script>

<template>
    <div
        :inert="windows.gameMenu.open.value || windows.characterModal.value || undefined"
        style="display: contents"
    >
        <SocialPanels
            v-if="snapshot && player"
            ref="social"
            :snapshot="snapshot"
            :player="player"
            :characters="characters"
            :connected="connected"
            @open="emit('open')"
            @command="emit('command', $event)"
        />
        <DeathOverlay
            v-if="defeated || (player && !player.alive)"
            :character="player"
            :defeated="defeated"
            :pending="abandoning"
            :connected="connected"
            @abandon-life="emit('abandonLife')"
            @new-life="emit('newLife')"
            @open-menu="windows.gameMenu.show"
        />
    </div>
    <CharacterWindow
        v-if="windows.characterOpen.value && player"
        :tab="windows.characterTab.value"
        @update:tab="windows.setCharacterTab"
        :player="player"
        :snapshot="snapshot"
        :characters="characters"
        @close="windows.closeCharacter"
        @command="emit('command', $event)"
    />
    <GameMenu
        v-if="windows.gameMenu.open.value"
        :automation-available="Boolean(player)"
        :inventory-available="Boolean(player?.alive) && !defeated"
        @resume="windows.gameMenu.resume"
        @leave="windows.gameMenu.leave"
        @character="windows.openCharacter"
        @inventory="windows.openInventory"
        @markers="windows.openAutomation('markers')"
        @scenarios="windows.openAutomation('scenarios')"
    />
</template>
