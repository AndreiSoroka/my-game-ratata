<script setup lang="ts">
import './adventurePanel.css'

import type { AdventureSnapshot, CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'

import type { DialogueNeighbors } from '@/entities/dialogues'
import { TheftAlert } from '@/entities/player-effects'

import { activateFocusedButton } from '../model/uiKeyboard'
import AdventureDialogue from './AdventureDialogue.vue'
import QuestBoardWindow from './QuestBoardWindow.vue'

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
            class="adventure-theft-alert"
            :evidence="player.theft?.accusations ?? []"
            :alive="player.alive"
            :server-time="serverTime"
            @call-guards="emit('command', { type: 'call_guards', targetId: $event })"
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

<style scoped>
.adventure-theft-alert {
    position: absolute;
    z-index: 8;
    left: 16px;
    bottom: 76px;
    width: min(320px, calc(100% - 32px));
    max-height: 40dvh;
    overflow: auto;
}
@media (max-width: 740px) {
    .adventure-theft-alert {
        left: 12px;
        bottom: 164px;
    }
}
</style>
