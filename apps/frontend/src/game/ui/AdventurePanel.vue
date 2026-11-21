<script setup lang="ts">
import './adventurePanel.css'

import type {
    AdventureSnapshot,
    CharacterSnapshot,
    ClientMessage,
    PartySnapshot,
} from '@my-game-ratata/contracts'
import { computed, nextTick, ref } from 'vue'

import AdventureDialogue from './AdventureDialogue.vue'
import CompanionWindow from './CompanionWindow.vue'
import CraftingWindow from './CraftingWindow.vue'
import GuildWindow from './GuildWindow.vue'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import TheftAlert from './TheftAlert.vue'
import { useEscapeOwner } from './uiEscapeOwners'
import { activateFocusedButton } from './uiKeyboard'
import { useFooterHeight } from './useFooterHeight'

const props = defineProps<{
    adventure: AdventureSnapshot
    characters: CharacterSnapshot[]
    inventoryOpen: boolean
    locationId: string | undefined
    player: CharacterSnapshot
    party: PartySnapshot | undefined
    serverTime: number
}>()
const emit = defineEmits<{ command: [message: ClientMessage]; closeInventory: []; character: [] }>()
type AdventureWindow = 'crafting' | 'companions' | 'guild'
const activeWindow = ref<AdventureWindow | null>(null)
const windowRoot = ref<HTMLElement>()
const toolsRow = ref<HTMLElement>()
useFooterHeight(toolsRow, '--ratata-adventure-tools-height')
const showWindow = computed(() => !props.inventoryOpen && !props.adventure.dialogue)
const incomingInvitations = computed(
    () => props.party?.invitations.filter((invitation) => invitation.toId === props.player.id) ?? []
)

function toggleWindow(window: AdventureWindow): void {
    emit('closeInventory')
    emit('command', { type: 'release_input' })
    activeWindow.value = activeWindow.value === window ? null : window
    if (props.adventure.dialogue) emit('command', { choiceId: 'close', type: 'dialogue_choice' })
}

function closeWindow(): void {
    activeWindow.value = null
    void nextTick(() => {
        if (!props.inventoryOpen && !props.adventure.dialogue && !activeWindow.value)
            document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
    })
}
useEscapeOwner({
    active: () => Boolean(activeWindow.value && showWindow.value),
    escape: closeWindow,
    element: windowRoot,
})

defineExpose({
    hasOpenWindow: computed(() => Boolean(activeWindow.value && showWindow.value)),
    closeWindows: () => {
        activeWindow.value = null
    },
})
</script>

<template>
    <div
        ref="windowRoot"
        class="adventure-ui"
        @keydown="activateFocusedButton($event, $event.currentTarget as HTMLElement)"
        @keyup.enter.stop
        @keyup.space.stop
        @focusin="emit('command', { type: 'release_input' })"
    >
        <div ref="toolsRow" class="adventure-tools game-frame-host" aria-label="Приключение">
            <GameFrame variant="panel" />
            <span class="adventure-level" title="Сумма уровней созвездий"
                >Ступени
                {{
                    player.progression?.masteries.reduce(
                        (sum, mastery) => sum + mastery.level,
                        0
                    ) ?? 0
                }}</span
            >
            <GameButton
                :aria-expanded="activeWindow === 'crafting'"
                @click="toggleWindow('crafting')"
            >
                Ремесло
            </GameButton>
            <GameButton @click="emit('character')">Знания</GameButton>
            <GameButton
                :aria-expanded="activeWindow === 'companions'"
                @click="toggleWindow('companions')"
            >
                Спутники
            </GameButton>
            <GameButton
                v-if="party"
                :aria-expanded="activeWindow === 'guild'"
                @click="toggleWindow('guild')"
            >
                Гильдия{{ incomingInvitations.length ? ` · ${incomingInvitations.length}` : '' }}
            </GameButton>
            <span class="adventure-gold" aria-label="Золото">◈ {{ adventure.gold }}</span>
        </div>

        <TheftAlert
            v-if="showWindow && !activeWindow"
            :player="player"
            :server-time="serverTime"
            @command="emit('command', $event)"
        />
        <GuildWindow
            v-if="activeWindow === 'guild' && showWindow && party"
            :player="player"
            :characters="characters"
            :party="party"
            @close="activeWindow = null"
            @command="emit('command', $event)"
        />
        <div
            v-if="incomingInvitations.length && !activeWindow && showWindow"
            class="party-invitation-hint game-frame-host"
            role="status"
        >
            <GameFrame variant="panel" />
            <p>{{ incomingInvitations[0]?.fromName }} приглашает в отряд.</p>
            <GameButton @click="toggleWindow('guild')">Посмотреть приглашение</GameButton>
        </div>
        <CompanionWindow
            v-if="activeWindow === 'companions' && showWindow"
            :player="player"
            :characters="characters"
            @close="activeWindow = null"
            @command="emit('command', $event)"
        />
        <CraftingWindow
            v-if="activeWindow === 'crafting' && showWindow"
            :adventure="adventure"
            :alive="player.alive"
            @close="activeWindow = null"
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
