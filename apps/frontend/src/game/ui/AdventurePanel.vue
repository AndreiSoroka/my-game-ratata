<script setup lang="ts">
import './adventurePanel.css'

import type {
    AdventureSnapshot,
    CharacterSnapshot,
    ClientMessage,
    SpeechActivitySnapshot,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import AdventureDialogue from './AdventureDialogue.vue'
import TheftAlert from './TheftAlert.vue'
import { activateFocusedButton } from './uiKeyboard'

const props = defineProps<{
    adventure: AdventureSnapshot
    characters: CharacterSnapshot[]
    inventoryOpen: boolean
    player: CharacterSnapshot
    serverTime: number
    speechActivity?: readonly SpeechActivitySnapshot[]
}>()
defineSlots<{ composer: (props: { targetId: string; waiting: boolean }) => unknown }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const conversation = computed(() => {
    const dialogue = props.adventure.dialogue
    if (!dialogue || dialogue.kind === 'sign') return undefined
    const targetId = dialogue.npcId
    const mode = props.characters.find((character) => character.id === targetId)?.interactions
        ?.dialogueMode
    if (mode !== 'active' && mode !== 'passive') return undefined
    return {
        targetId,
        waiting: props.speechActivity?.some(({ actorId }) => actorId === targetId) ?? false,
    }
})
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
        >
            <template v-if="conversation && $slots.composer" #composer>
                <slot name="composer" v-bind="conversation" />
            </template>
        </AdventureDialogue>
    </div>
</template>
