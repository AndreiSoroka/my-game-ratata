<script setup lang="ts">
import './adventurePanel.css'

import type { AdventureSnapshot, CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'

import AdventureDialogue from './AdventureDialogue.vue'
import TheftAlert from './TheftAlert.vue'
import { activateFocusedButton } from './uiKeyboard'

defineProps<{
    adventure: AdventureSnapshot
    characters: CharacterSnapshot[]
    inventoryOpen: boolean
    player: CharacterSnapshot
    serverTime: number
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
</script>

<template>
    <div
        class="adventure-ui"
        @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
        @keyup.enter.stop
        @keyup.space.stop
        @focusin="emit('command', { type: 'release_input' })"
    >
        <TheftAlert
            v-if="!inventoryOpen && !adventure.dialogue"
            :player="player"
            :server-time="serverTime"
            @command="emit('command', $event)"
        />
        <AdventureDialogue
            v-if="!inventoryOpen"
            :adventure="adventure"
            :characters="characters"
            @command="emit('command', $event)"
        />
    </div>
</template>
