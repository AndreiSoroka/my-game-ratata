<script setup lang="ts">
import type { HeroClass, WorldSnapshot } from '@my-game-ratata/contracts'
import { ref } from 'vue'

import { GameplayAdventurePanel, JoinGameScreen } from '@/app/layouts'
import { useStartGameReadiness } from '@/pages/start-game'
import { provideDarkPanelTheme } from '@/shared/ui/theme'

import { useHeroName } from './game/names/useHeroName'
import type { RatataGame } from './game/runtime/ratataGame'
import TestControlPanel from './game/testing/TestControlPanel.vue'
import { useGameTestControls } from './game/testing/useGameTestControls'
import { startAppRuntime } from './game/ui/appRuntime'
import AutomationPanels from './game/ui/AutomationPanels.vue'
import ChestContainer from './game/ui/ChestContainer.vue'
import GameChat from './game/ui/GameChat.vue'
import GameNotice from './game/ui/GameNotice.vue'
import GameplayOverlay from './game/ui/GameplayOverlay.vue'
import GameWindows from './game/ui/GameWindows.vue'
import { heroClassTheme } from './game/ui/heroClassThemes'
import { provideHotbarSession } from './game/ui/hotbarSession'
import InventoryHud from './game/ui/InventoryHud.vue'
import MapLoadError from './game/ui/MapLoadError.vue'
import NearbyInteraction from './game/ui/NearbyInteraction.vue'
import { createTransientNotices } from './game/ui/transientNotices'
import TreePlanting from './game/ui/TreePlanting.vue'
import { useAppChat } from './game/ui/useAppChat'
import { useAppSession } from './game/ui/useAppSession'
import { useAppWindows } from './game/ui/useAppWindows'
import { useCharacterApproach } from './game/ui/useCharacterApproach'
import { useCharacterViews } from './game/ui/useCharacterViews'
import { useChestSession } from './game/ui/useChestSession'
import { useInventoryUi } from './game/ui/useInventoryUi'
import { useLifeChoice } from './game/ui/useLifeChoice'

const gameplay = ref<InstanceType<typeof GameplayOverlay>>()
const interaction = ref<InstanceType<typeof NearbyInteraction>>()
const gameWindows = ref<InstanceType<typeof GameWindows>>()
const errorMessage = ref('')
const { nickname, ...heroName } = useHeroName(undefined, () => (errorMessage.value = ''))
const heroClass = ref<HeroClass>('vanguard')
const defeated = ref(false)
const gameHost = ref<HTMLElement>()
const game = ref<RatataGame>()
const selectTarget = (key: string): boolean => gameplay.value?.selectKey(key) ?? false
const isJoining = ref(false)
const isStarted = ref(false)
const { status: readiness, canEnter: canEnterWorld } = useStartGameReadiness(() => !isStarted.value)
const localPlayerId = ref<string>()
const snapshot = ref<WorldSnapshot>()
const status = ref('Ready')
const notice = ref('')
const notices = createTransientNotices((text) => (notice.value = text))
const hotbarSession = provideHotbarSession()
const { chatHistory, chatInput } = useAppChat(snapshot, localPlayerId)

const { localCharacter, visibleCharacters } = useCharacterViews(snapshot, game, localPlayerId)
provideDarkPanelTheme(() => heroClassTheme(localCharacter.value?.heroClass))
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
    dismissInventory,
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
    setNickname: heroName.setManually,
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
    social: gameWindows,
    closeInventory,
    closeContainers,
    toggleInventory: toggleInventoryBase,
    leave: () => leaveSession('nickname'),
})
const { gameMenu, characterOpen, automationPanels, worldInputBlocked, prepareAutomationWindow } =
    windows
const { canSelectTarget, isPositionVisible } = windows.dialogueSwitch
const characterApproach = useCharacterApproach({
    game,
    snapshot,
    player: () => localCharacter.value,
    selectedId: () => gameplay.value?.selectedId,
    blocked: () => worldInputBlocked.value || planting.value,
    select: (id) => gameplay.value?.select(id) ?? false,
    canOpen: (id) => interaction.value?.canOpenFor(`character:${id}`) ?? false,
    open: windows.openNearbyMenu,
})
const runtimeState = {
    game,
    chatInput,
    errorMessage,
    snapshot,
    localPlayerId,
    isJoining,
    isStarted,
    status,
}
const { leaveSession, cleanupFailedJoin } = useAppSession({
    ...windows,
    ...runtimeState,
    notices,
    hotbarSession,
    testInterface,
    defeated,
    inventoryOpen,
    planting,
})

async function joinGame(): Promise<void> {
    if (!(await canEnterWorld())) return
    await startAppRuntime({
        ...runtimeState,
        container: () => gameHost.value,
        ...heroName.attempt(),
        heroClass: heroClass.value,
        gameplay: () => gameplay.value,
        notices,
        chatHistory,
        characterApproach,
        confirmDeath,
        hotbarSession,
        cleanupFailedJoin,
        ...windows,
    })
}
</script>

<template>
    <main class="app-shell">
        <JoinGameScreen
            v-if="!isStarted"
            v-model:nickname="nickname"
            v-model:hero-class="heroClass"
            :joining="isJoining"
            :readiness="readiness"
            :error-message="errorMessage"
            @join="joinGame"
            @nickname-edited="heroName.edited"
            @regenerate-name="heroName.regenerate"
        />

        <section v-else class="game-screen" aria-label="Ratata game">
            <div
                :inert="gameMenu.open.value || characterOpen || undefined"
                style="display: contents"
            >
                <InventoryHud
                    :snapshot="snapshot"
                    :player="localCharacter"
                    :inventory-open="inventoryOpen"
                    @open-menu="gameMenu.show"
                    @close-inventory="dismissInventory"
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
                    :interaction-prompt="interaction?.prompt"
                    @interact="windows.openNearbyMenu"
                    @request-interact="windows.openNearbyMenu(undefined, true)"
                    @open-menu="gameMenu.show"
                    @plant="startPlanting"
                />
                <NearbyInteraction
                    ref="interaction"
                    :selected-key="gameplay?.selectedKey"
                    :snapshot="snapshot"
                    :player="localCharacter"
                    :characters="visibleCharacters"
                    :can-select-target="canSelectTarget"
                    :select-target="selectTarget"
                    :is-position-visible="isPositionVisible"
                    :blocked="worldInputBlocked"
                    @command="gameWindows?.command($event)"
                    @target-change="game?.setInteractionTarget($event)"
                    @select-grave="gameplay?.selectGrave($event)"
                />
                <GameplayAdventurePanel
                    v-if="snapshot && localCharacter"
                    :snapshot="snapshot"
                    :characters="visibleCharacters"
                    :inventory-open="inventoryOpen || chestPending"
                    :player="localCharacter"
                    :target-switch="windows.dialogueSwitch"
                    @command="game?.sendCommand($event)"
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
                <GameChat
                    :state="chatInput"
                    :entries="chatHistory.entries.value"
                    @draft="game?.updateChatDraft($event)"
                />
                <MapLoadError :game="game" :message="errorMessage" :status="status" />
            </div>
            <GameWindows
                ref="gameWindows"
                :windows="windows"
                :player="localCharacter"
                :characters="visibleCharacters"
                :snapshot="snapshot"
                :connected="status === 'Connected'"
                :defeated="defeated"
                :abandoning="abandoning"
                @open="prepareAutomationWindow"
                @abandon-life="abandonLife"
                @new-life="leaveSession('hero-class')"
                @command="game?.sendCommand($event)"
            />
        </section>
        <GameNotice v-if="notice" :text="notice" />
        <TestControlPanel v-if="testInterface" :api="testInterface.api" :state="testState" />
    </main>
</template>
