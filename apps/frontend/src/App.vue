<script setup lang="ts">
import './game/ui/gameNotice.css'

import type { HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { ref } from 'vue'

import type { ChatInputState } from './game/runtime/chatInput'
import type { RatataGame } from './game/runtime/ratataGame'
import TestControlPanel from './game/testing/TestControlPanel.vue'
import { useGameTestControls } from './game/testing/useGameTestControls'
import AdventurePanel from './game/ui/AdventurePanel.vue'
import { startAppRuntime } from './game/ui/appRuntime'
import AutomationPanels from './game/ui/AutomationPanels.vue'
import ChatInputOverlay from './game/ui/ChatInputOverlay.vue'
import ChestContainer from './game/ui/ChestContainer.vue'
import DeathOverlay from './game/ui/DeathOverlay.vue'
import GameplayOverlay from './game/ui/GameplayOverlay.vue'
import GameWindows from './game/ui/GameWindows.vue'
import { provideHotbarSession } from './game/ui/hotbarSession'
import InventoryHud from './game/ui/InventoryHud.vue'
import JoinGamePanel from './game/ui/JoinGamePanel.vue'
import NearbyInteraction from './game/ui/NearbyInteraction.vue'
import { createTransientNotices } from './game/ui/transientNotices'
import TreePlanting from './game/ui/TreePlanting.vue'
import { useAppSession } from './game/ui/useAppSession'
import { useAppWindows } from './game/ui/useAppWindows'
import { useCharacterViews } from './game/ui/useCharacterViews'
import { useChestSession } from './game/ui/useChestSession'
import { useInventoryUi } from './game/ui/useInventoryUi'
import { useLifeChoice } from './game/ui/useLifeChoice'

const gameplay = ref<InstanceType<typeof GameplayOverlay>>()
const interaction = ref<InstanceType<typeof NearbyInteraction>>()
const adventurePanel = ref<InstanceType<typeof AdventurePanel>>()
const nickname = ref('')
const heroClass = ref<HeroClass>('vanguard')
const defeated = ref(false)
const errorMessage = ref('')
const gameHost = ref<HTMLElement>()
const game = ref<RatataGame>()
const chatInput = ref<ChatInputState>({ active: false, draft: '', maxLength: 100 })
const isJoining = ref(false)
const isStarted = ref(false)
const localPlayerId = ref<string>()
const snapshot = ref<WorldSnapshot>()
const status = ref('Ready')
const notice = ref('')
const notices = createTransientNotices((text) => (notice.value = text))
const hotbarSession = provideHotbarSession()

const { localCharacter, visibleCharacters } = useCharacterViews(snapshot, game, localPlayerId)
const { abandoning, abandonLife, confirmDeath } = useLifeChoice({
    character: () => localCharacter.value,
    connected: () => status.value === 'Connected',
    send: (command) => game.value?.sendCommand(command),
    newLife: () => leaveSession('hero-class'),
    defeated,
})
const {
    inventoryOpen,
    planting,
    setInventory,
    closeInventory,
    startPlanting,
    toggleInventory: toggleInventoryBase,
    closeContainers,
} = useInventoryUi(
    () => game.value,
    () => closeChest()
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
        automationPanels.value?.close()
        inventoryOpen.value = false
        adventurePanel.value?.closeWindows()
        if (snapshot.value?.adventure?.dialogue)
            game.value?.sendCommand({ type: 'dialogue_choice', choiceId: 'close' })
    },
})
const { testState, testInterface } = useGameTestControls({
    status,
    defeated,
    errorMessage,
    inventoryOpen,
    localPlayerId,
    snapshot,
    notice,
    localCharacter,
    isStarted,
    heroClass,
    nickname,
    game,
    joinGame,
    setInventory,
})
const windows = useAppWindows({
    characterId: () => localCharacter.value?.id,
    game,
    isStarted,
    chatInput,
    planting,
    inventoryOpen,
    chestPending,
    status,
    defeated,
    snapshot,
    gameplay,
    interaction,
    adventure: adventurePanel,
    closeInventory,
    closeContainers,
    toggleInventory: toggleInventoryBase,
    leave: () => leaveSession('nickname'),
})
const {
    gameMenu,
    characterOpen,
    automationPanels,
    worldInputBlocked,
    openNearbyMenu,
    toggleInventory,
    prepareAutomationWindow,
    closeOtherContainers,
} = windows
const { leaveSession, cleanupFailedJoin } = useAppSession({
    ...windows,
    notices,
    hotbarSession,
    testInterface,
    defeated,
    errorMessage,
    isJoining,
    localPlayerId,
    game,
    snapshot,
    inventoryOpen,
    planting,
    chatInput,
    isStarted,
    status,
})

async function joinGame(): Promise<void> {
    await startAppRuntime({
        game,
        container: () => gameHost.value,
        nickname: nickname.value,
        heroClass: heroClass.value,
        gameplay: () => gameplay.value,
        chatInput,
        errorMessage,
        snapshot,
        localPlayerId,
        isJoining,
        isStarted,
        status,
        notices,
        confirmDeath: () => {
            hotbarSession.clear()
            confirmDeath()
        },
        cleanupFailedJoin,
        ...windows,
    })
}
</script>

<template>
    <main class="app-shell">
        <JoinGamePanel
            v-if="!isStarted"
            v-model:nickname="nickname"
            v-model:hero-class="heroClass"
            :can-join="nickname.trim().length > 0 && !isJoining"
            :error-message="errorMessage"
            @join="joinGame"
        />

        <section v-else class="game-screen" aria-label="Ratata game">
            <div
                :inert="gameMenu.open.value || characterOpen || undefined"
                style="display: contents"
            >
                <InventoryHud
                    :nickname="nickname"
                    :status="status"
                    :snapshot="snapshot"
                    :player="localCharacter"
                    :local-player-id="localPlayerId"
                    :inventory-open="inventoryOpen"
                    :test-mode="Boolean(testInterface)"
                    @toggle-inventory="toggleInventory"
                    @open-menu="gameMenu.show"
                    @create-marker="automationPanels?.create()"
                    @close-inventory="closeInventory"
                    @plant="startPlanting"
                    @assign-hotbar="gameplay?.assignItem($event.slot, $event.itemId)"
                    @equipment-action="game?.sendCommand({ type: 'equipment_action', ...$event })"
                    @inventory-action="game?.sendCommand({ type: 'inventory_action', ...$event })"
                >
                    <template #surface>
                        <div ref="gameHost" class="game-host" data-testid="game-host"></div>
                    </template>
                </InventoryHud>
                <TreePlanting
                    v-if="planting && game && localCharacter && status === 'Connected'"
                    :game="game"
                    :player="localCharacter"
                    :location="snapshot?.location"
                    @close="planting = false"
                    @command="game.sendCommand($event)"
                />
                <GameplayOverlay
                    v-if="snapshot && localCharacter"
                    ref="gameplay"
                    :game="game"
                    :snapshot="snapshot"
                    :player="localCharacter"
                    :characters="visibleCharacters"
                    :blocked="worldInputBlocked"
                    @interact="openNearbyMenu"
                    @plant="startPlanting"
                />
                <NearbyInteraction
                    ref="interaction"
                    :selected-key="gameplay?.selectedKey"
                    :selected-id="gameplay?.selectedId"
                    :selected-grave-id="gameplay?.selectedGraveId"
                    :snapshot="snapshot"
                    :player="localCharacter"
                    :characters="visibleCharacters"
                    :can-select-target="(key) => game?.canSelectTarget(key) ?? false"
                    :is-position-visible="
                        (position, bounds, range) =>
                            game?.isInteractionVisible(position, bounds, range) ?? false
                    "
                    :blocked="worldInputBlocked"
                    @command="game?.sendCommand($event)"
                    @request-open="openNearbyMenu"
                    @target-change="game?.setInteractionTarget($event)"
                    @select-grave="gameplay?.selectGrave($event)"
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
                    @close-inventory="closeOtherContainers"
                    @command="game?.sendCommand($event)"
                    @character="windows.openDevelopment"
                />
                <AutomationPanels
                    v-if="snapshot && localCharacter"
                    ref="automationPanels"
                    :snapshot="snapshot"
                    :player="localCharacter"
                    :characters="visibleCharacters"
                    :game="game"
                    :connected="status === 'Connected'"
                    :blocked="worldInputBlocked"
                    @open="prepareAutomationWindow"
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
                    :pending="abandoning"
                    :connected="status === 'Connected'"
                    @abandon-life="abandonLife"
                    @new-life="leaveSession('hero-class')"
                    @open-menu="gameMenu.show"
                />
            </div>
            <GameWindows
                :windows="windows"
                :player="localCharacter"
                :characters="visibleCharacters"
                @command="game?.sendCommand($event)"
            />
        </section>
        <p v-if="notice" class="game-notice" role="status" aria-live="polite">{{ notice }}</p>
        <TestControlPanel v-if="testInterface" :api="testInterface.api" :state="testState" />
    </main>
</template>
