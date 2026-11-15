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
import AdventureJournal from './AdventureJournal.vue'
import CompanionWindow from './CompanionWindow.vue'
import CraftingWindow from './CraftingWindow.vue'
import GuildWindow from './GuildWindow.vue'
import TheftAlert from './TheftAlert.vue'
import { useEscapeOwner } from './uiEscapeOwners'
import { activateFocusedButton } from './uiKeyboard'

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
type AdventureWindow = 'journal' | 'crafting' | 'companions' | 'guild'
const activeWindow = ref<AdventureWindow | null>(null)
const windowRoot = ref<HTMLElement>()
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
        <div class="adventure-tools" aria-label="Приключение">
            <span
                class="adventure-level"
                :title="`Общий уровень: 1 + ${player.progression?.totalEarnedLevels ?? 0} освоенных ступеней. Сложность практики ×${player.progression?.trainingMultiplier ?? 1}`"
                >Ур. {{ 1 + (player.progression?.totalEarnedLevels ?? 0) }}</span
            >
            <button
                type="button"
                :aria-expanded="activeWindow === 'crafting'"
                @click="toggleWindow('crafting')"
            >
                Ремесло
            </button>
            <button type="button" @click="emit('character')">Знания</button>
            <button
                type="button"
                :aria-expanded="activeWindow === 'companions'"
                @click="toggleWindow('companions')"
            >
                Спутники
            </button>
            <button
                v-if="party"
                type="button"
                :aria-expanded="activeWindow === 'guild'"
                @click="toggleWindow('guild')"
            >
                Гильдия{{ incomingInvitations.length ? ` · ${incomingInvitations.length}` : '' }}
            </button>
            <span class="adventure-gold" aria-label="Золото">◈ {{ adventure.gold }}</span>
            <button
                type="button"
                :aria-expanded="activeWindow === 'journal'"
                @click="toggleWindow('journal')"
            >
                Журнал
            </button>
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
            class="party-invitation-hint"
            role="status"
        >
            <p>{{ incomingInvitations[0]?.fromName }} приглашает в отряд.</p>
            <button type="button" @click="toggleWindow('guild')">Посмотреть приглашение</button>
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

        <AdventureJournal
            v-if="activeWindow === 'journal' && showWindow"
            :adventure="adventure"
            :party="party"
            :player-id="player.id"
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
