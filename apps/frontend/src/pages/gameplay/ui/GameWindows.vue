<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import type { CharacterTab } from '@/entities/character-window'

import CharacterWindow from './CharacterWindow.vue'
import DeathOverlay from './DeathOverlay.vue'
import GameMenu from './GameMenu.vue'
import SocialPanels from './SocialPanels.vue'

defineProps<{
    menuOpen: boolean
    characterOpen: boolean
    characterTab: CharacterTab
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
    openMenu: []
    resume: []
    leave: []
    openCharacter: []
    closeCharacter: []
    changeCharacterTab: [tab: CharacterTab]
    openInventory: []
    openAutomation: [view: 'markers' | 'scenarios']
}>()
const social = ref<InstanceType<typeof SocialPanels>>()
defineExpose({
    hasOpenWindow: computed(() => social.value?.hasOpenWindow ?? false),
    command: (message: ClientMessage) => social.value?.command(message),
})
</script>

<template>
    <div :inert="menuOpen || characterOpen || undefined" style="display: contents">
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
            @open-menu="emit('openMenu')"
        />
    </div>
    <CharacterWindow
        v-if="characterOpen && player"
        :tab="characterTab"
        @update:tab="emit('changeCharacterTab', $event)"
        :player="player"
        :snapshot="snapshot"
        :characters="characters"
        @close="emit('closeCharacter')"
        @command="emit('command', $event)"
    />
    <GameMenu
        v-if="menuOpen"
        :automation-available="Boolean(player)"
        :inventory-available="Boolean(player?.alive) && !defeated"
        @resume="emit('resume')"
        @leave="emit('leave')"
        @character="emit('openCharacter')"
        @inventory="emit('openInventory')"
        @markers="emit('openAutomation', 'markers')"
        @scenarios="emit('openAutomation', 'scenarios')"
    />
</template>
