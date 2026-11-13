<script setup lang="ts">
import './game/ui/gameNotice.css'

import type { HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import type { ChatInputState } from './game/runtime/chatInput'
import { RatataGame } from './game/runtime/ratataGame'
import TestControlPanel from './game/testing/TestControlPanel.vue'
import { installTestInterface, type RatataTestState } from './game/testing/testInterface'
import AdventurePanel from './game/ui/AdventurePanel.vue'
import ChatInputOverlay from './game/ui/ChatInputOverlay.vue'
import ChestContainer from './game/ui/ChestContainer.vue'
import DeathOverlay from './game/ui/DeathOverlay.vue'
import GameHud from './game/ui/GameHud.vue'
import InventoryOverlay from './game/ui/InventoryOverlay.vue'
import JoinGamePanel from './game/ui/JoinGamePanel.vue'
import NearbyInteraction from './game/ui/NearbyInteraction.vue'
import { createTransientNotices } from './game/ui/transientNotices'
import { useChestSession } from './game/ui/useChestSession'

const interaction = ref<InstanceType<typeof NearbyInteraction>>()
const adventurePanel = ref<InstanceType<typeof AdventurePanel>>()
const nickname = ref('')
const heroClass = ref<HeroClass>('vanguard')
const defeated = ref(false)
const errorMessage = ref('')
const gameHost = ref<HTMLElement>()
const game = ref<RatataGame>()
const chatInput = ref<ChatInputState>({
    active: false,
    draft: '',
    maxLength: 100,
})
const inventoryOpen = ref(false)
const isJoining = ref(false)
const isStarted = ref(false)
const localPlayerId = ref<string>()
const snapshot = ref<WorldSnapshot>()
const status = ref('Ready')
const notice = ref('')
const notices = createTransientNotices((text) => {
    notice.value = text
})

const canJoin = computed(() => nickname.value.trim().length > 0 && !isJoining.value)
const visibleCharacters = computed(
    () =>
        snapshot.value?.characters.filter(
            (character) => game.value?.isCharacterVisible(character.id) ?? true
        ) ?? []
)
const localCharacter = computed(() =>
    snapshot.value?.characters.find((character) => character.id === localPlayerId.value)
)
const {
    chest,
    close: closeChest,
    pending: chestPending,
} = useChestSession({
    snapshot,
    player: localCharacter,
    connected: () => status.value === 'Connected',
    send: (command) => game.value?.sendCommand(command),
    onOpen: () => {
        inventoryOpen.value = false
        adventurePanel.value?.closeWindows()
        if (snapshot.value?.adventure?.dialogue)
            game.value?.sendCommand({ type: 'dialogue_choice', choiceId: 'close' })
    },
})
const testState = computed<RatataTestState>(() => ({
    connected: status.value === 'Connected',
    defeated: defeated.value,
    error: errorMessage.value,
    inventoryOpen: inventoryOpen.value,
    localPlayerId: localPlayerId.value,
    location: snapshot.value?.location,
    notice: notice.value,
    player: localCharacter.value,
    snapshot: snapshot.value,
    status: status.value,
}))
const testInterface =
    new URLSearchParams(window.location.search).get('test') === '1'
        ? installTestInterface({
              getState: () => testState.value,
              inventory: (open) => {
                  setInventory(open ?? !inventoryOpen.value)
              },
              join: async (name, selectedClass) => {
                  if (isStarted.value) throw new Error('A game is already running')
                  if (name.trim().length === 0 || name.trim().length > 24)
                      throw new Error('Nickname must contain 1–24 characters')
                  heroClass.value = selectedClass ?? heroClass.value
                  nickname.value = name.trim()
                  await joinGame()
              },
              send: (command) => {
                  game.value?.sendCommand(command)
              },
          })
        : undefined

function openNearbyMenu(): void {
    if (chestPending.value) return
    closeInventory()
    adventurePanel.value?.closeWindows()
    void nextTick(() => interaction.value?.openMenu())
}

async function joinGame(): Promise<void> {
    if (!canJoin.value) {
        return
    }

    errorMessage.value = ''
    isJoining.value = true
    isStarted.value = true
    await nextTick()

    if (gameHost.value === undefined) {
        errorMessage.value = 'Game surface is not ready'
        cleanupFailedJoin()
        return
    }

    const runtime = new RatataGame({
        container: gameHost.value,
        nickname: nickname.value.trim(),
        heroClass: heroClass.value,
        onDefeat: () => {
            defeated.value = true
        },
        onChatState: (state) => {
            chatInput.value = state
        },
        onError: (message) => {
            errorMessage.value = message
            cleanupFailedJoin()
        },
        onNotice: notices.show,
        onContextAction: openNearbyMenu,
        onInventoryToggle: toggleInventory,
        onSnapshot: (nextSnapshot, nextLocalPlayerId) => {
            if (localPlayerId.value !== nextLocalPlayerId) notices.reset()
            notices.observe('adventure', nextSnapshot.adventure)
            notices.observe('party', nextSnapshot.party)
            snapshot.value = nextSnapshot
            localPlayerId.value = nextLocalPlayerId
            isJoining.value = false
        },
        onStatus: (message) => {
            status.value = message
        },
    })

    game.value = runtime
    await runtime.start().catch((error: unknown) => {
        errorMessage.value = error instanceof Error ? error.message : 'Game failed to start'
        cleanupFailedJoin()
    })
}

function cleanupFailedJoin(): void {
    if (localPlayerId.value !== undefined) {
        isJoining.value = false
        return
    }

    resetGameSession()
    chatInput.value = {
        active: false,
        draft: '',
        maxLength: 100,
    }
}

function beginNewLife(): void {
    testInterface?.api.stop()
    resetGameSession()
    defeated.value = false
    errorMessage.value = ''
}

function resetGameSession(): void {
    notices.reset()
    game.value?.stop()
    game.value = undefined
    snapshot.value = undefined
    localPlayerId.value = undefined
    inventoryOpen.value = false
    isStarted.value = false
    isJoining.value = false
    status.value = 'Ready'
}

function setInventory(open: boolean): void {
    if (open) {
        closeChest()
        const player = localCharacter.value
        if (player?.path.length)
            game.value?.sendCommand({ type: 'move_to', target: { ...player.position } })
        game.value?.sendCommand({ type: 'move_input', axis: { x: 0, y: 0 } })
    }
    inventoryOpen.value = open
}
function toggleInventory(): void {
    setInventory(!inventoryOpen.value)
}

function closeInventory(): void {
    inventoryOpen.value = false
}

function closeContainers(): void {
    closeInventory()
    closeChest()
}

onBeforeUnmount(() => {
    notices.reset()
    testInterface?.dispose()
    game.value?.stop()
})
</script>

<template>
    <main class="app-shell">
        <JoinGamePanel
            v-if="!isStarted"
            v-model:nickname="nickname"
            v-model:hero-class="heroClass"
            :can-join="canJoin"
            :error-message="errorMessage"
            @join="joinGame"
        />

        <section v-else class="game-screen" aria-label="Ratata game">
            <GameHud
                :nickname="nickname"
                :status="status"
                :snapshot="snapshot"
                :player="localCharacter"
                :local-player-id="localPlayerId"
                :inventory-open="inventoryOpen"
                :test-mode="Boolean(testInterface)"
                @toggle-inventory="toggleInventory"
            >
                <template #surface>
                    <div ref="gameHost" class="game-host" data-testid="game-host"></div>
                </template>
                <InventoryOverlay
                    v-if="inventoryOpen && localCharacter"
                    :character="localCharacter"
                    :chests="snapshot?.chests ?? []"
                    :materials="snapshot?.adventure?.materials"
                    @close="closeInventory"
                    @equipment-action="game?.sendEquipmentAction($event.action, $event.slot)"
                    @inventory-action="
                        game?.sendInventoryAction($event.action, $event.itemInstanceId)
                    "
                />
            </GameHud>
            <NearbyInteraction
                ref="interaction"
                :snapshot="snapshot"
                :player="localCharacter"
                :characters="visibleCharacters"
                :is-position-visible="
                    (position, bounds, range) =>
                        game?.isInteractionVisible(position, bounds, range) ?? false
                "
                :blocked="
                    inventoryOpen ||
                    chestPending ||
                    chatInput.active ||
                    status !== 'Connected' ||
                    defeated ||
                    Boolean(adventurePanel?.hasOpenWindow) ||
                    Boolean(snapshot?.adventure?.dialogue)
                "
                @command="game?.sendCommand($event)"
                @request-open="openNearbyMenu"
                @target-change="game?.setInteractionTarget($event)"
            />
            <AdventurePanel
                ref="adventurePanel"
                v-if="snapshot?.adventure && localCharacter"
                :adventure="snapshot.adventure"
                :characters="visibleCharacters"
                :inventory-open="inventoryOpen || chestPending"
                :location-id="snapshot.location?.id"
                :player="localCharacter"
                :party="snapshot.party"
                :server-time="snapshot.serverTime"
                @close-inventory="closeContainers"
                @command="game?.sendCommand($event)"
            />
            <ChestContainer
                v-if="chest && localCharacter && !inventoryOpen"
                :chest="chest"
                :player="localCharacter"
                @close="closeChest"
                @command="game?.sendCommand($event)"
            />
            <ChatInputOverlay v-if="chatInput.active" :state="chatInput" />
            <p v-if="errorMessage" class="game-error">{{ errorMessage }}</p>
            <DeathOverlay
                v-if="defeated || (localCharacter && !localCharacter.alive)"
                :character="localCharacter"
                :defeated="defeated"
                @new-life="beginNewLife"
            />
        </section>
        <p v-if="notice" class="game-notice" role="status" aria-live="polite">{{ notice }}</p>
        <TestControlPanel v-if="testInterface" :api="testInterface.api" :state="testState" />
    </main>
</template>
