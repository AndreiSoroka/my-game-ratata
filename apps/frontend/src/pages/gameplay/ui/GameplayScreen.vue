<script setup lang="ts">
import type { HeroClass } from '@my-game-ratata/contracts'
import { provide, ref } from 'vue'

import { marketWindowContext } from '../model/marketWindowContext'
import { useGameplaySession } from '../model/useGameplaySession'
import AutomationPanels from './AutomationPanels.vue'
import ChestContainer from './ChestContainer.vue'
import GameChat from './GameChat.vue'
import GameNotice from './GameNotice.vue'
import GameplayAdventurePanel from './GameplayAdventurePanel.vue'
import GameplayOverlay from './GameplayOverlay.vue'
import GameWindows from './GameWindows.vue'
import InventoryHud from './InventoryHud.vue'
import MapLoadError from './MapLoadError.vue'
import NearbyInteraction from './NearbyInteraction.vue'
import TestControlPanel from './TestControlPanel.vue'
import TreePlanting from './TreePlanting.vue'

const props = defineProps<{ canEnterWorld: () => Promise<boolean> }>()
const nearbyTargetKey = ref<string>()
provide(marketWindowContext, { shopOpen: ref(false), whisperPartnerId: ref<string>() })
const isStarted = defineModel<boolean>('started', { default: false })
defineSlots<{
    start(props: {
        nickname: string
        heroClass: HeroClass
        joining: boolean
        errorMessage: string
        join: () => Promise<void>
        setNickname: (value: string) => void
        setHeroClass: (value: HeroClass) => void
        editNickname: () => void
        regenerateName: () => void
    }): unknown
}>()

const {
    gameplay,
    interaction,
    gameWindows,
    errorMessage,
    nickname,
    heroName,
    heroClass,
    defeated,
    gameHost,
    game,
    selectTarget,
    isJoining,
    snapshot,
    status,
    notice,
    chatHistory,
    chatInput,
    localCharacter,
    visibleCharacters,
    abandoning,
    abandonLife,
    inventoryOpen,
    planting,
    dismissInventory,
    startPlanting,
    chest,
    closeChest,
    chestPending,
    testState,
    testInterface,
    windows,
    gameMenu,
    automationPanels,
    worldInputBlocked,
    prepareAutomationWindow,
    canSelectTarget,
    isPositionVisible,
    leaveSession,
    joinGame,
} = useGameplaySession(isStarted, () => props.canEnterWorld())
</script>

<template>
    <main class="app-shell">
        <slot
            v-if="!isStarted"
            name="start"
            :nickname="nickname"
            :hero-class="heroClass"
            :joining="isJoining"
            :error-message="errorMessage"
            :join="joinGame"
            :set-nickname="(value) => (nickname = value)"
            :set-hero-class="(value) => (heroClass = value)"
            :edit-nickname="heroName.edited"
            :regenerate-name="heroName.regenerate"
        />

        <section v-else class="game-screen" aria-label="Ratata game">
            <div
                :inert="gameMenu.open.value || windows.characterOpen.value || undefined"
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
                    :nearby-target-key="nearbyTargetKey"
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
                    @target-change="nearbyTargetKey = $event?.key"
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
                <MapLoadError :message="errorMessage" :status="status" @retry="game?.retryMap()" />
            </div>
            <GameWindows
                ref="gameWindows"
                :menu-open="gameMenu.open.value"
                :character-open="windows.characterOpen.value"
                :character-tab="windows.characterTab.value"
                :player="localCharacter"
                :characters="visibleCharacters"
                :snapshot="snapshot"
                :connected="status === 'Connected'"
                :defeated="defeated"
                :abandoning="abandoning"
                @open="prepareAutomationWindow"
                @open-menu="gameMenu.show"
                @resume="gameMenu.resume"
                @leave="gameMenu.leave"
                @open-character="windows.openCharacter"
                @close-character="windows.closeCharacter"
                @change-character-tab="windows.setCharacterTab"
                @open-inventory="windows.openInventory"
                @open-automation="windows.openAutomation"
                @abandon-life="abandonLife"
                @new-life="leaveSession('hero-class')"
                @command="game?.sendCommand($event)"
            />
        </section>
        <GameNotice v-if="notice" :text="notice" />
        <TestControlPanel v-if="testInterface" :api="testInterface.api" :state="testState" />
    </main>
</template>
