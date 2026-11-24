<script setup lang="ts">
import './adventurePanel.css'

import type { AdventureSnapshot, CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'

import type { DialogueNeighbors } from '@/entities/dialogues'

import AdventureDialogue from './AdventureDialogue.vue'
import QuestBoardWindow from './QuestBoardWindow.vue'
import TheftAlert from './TheftAlert.vue'
import { activateFocusedButton } from './uiKeyboard'

defineProps<{
    adventure: AdventureSnapshot
    characters: CharacterSnapshot[]
    inventoryOpen: boolean
    player: CharacterSnapshot
    serverTime: number
    neighbors?: DialogueNeighbors
    switchPending?: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage]; switchTarget: [key: string] }>()
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
        <QuestBoardWindow
            v-if="!inventoryOpen && adventure.questBoard"
            :board="adventure.questBoard"
            @close="emit('command', { type: 'dialogue_choice', choiceId: 'close' })"
        />
        <AdventureDialogue
            v-else-if="!inventoryOpen && adventure.dialogue?.kind !== 'quest_board'"
            :adventure="adventure"
            :characters="characters"
            :neighbors="neighbors"
            :switch-pending="switchPending"
            @switch-target="emit('switchTarget', $event)"
            @command="emit('command', $event)"
        />
    </div>
</template>
