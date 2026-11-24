import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, provide, type Ref, ref } from 'vue'

import type { ChatInputState } from '../runtime/chatInput'
import type { RatataGame } from '../runtime/ratataGame'
import type AutomationPanels from './AutomationPanels.vue'
import { gameUiSoundKey } from './gameUiSound'
import { useCharacterWindow } from './useCharacterWindow'
import { useGameMenu } from './useGameMenu'

interface AppWindowsOptions {
    characterId?: () => string | undefined
    game: Ref<RatataGame | undefined>
    isStarted: Ref<boolean>
    chatInput: Ref<ChatInputState>
    planting: Ref<boolean>
    inventoryOpen: Ref<boolean>
    chestPending: Ref<boolean>
    status: Ref<string>
    defeated: Ref<boolean>
    snapshot: Ref<WorldSnapshot | undefined>
    gameplay: Ref<{ select: (id: string) => boolean | void } | undefined>
    interaction: Ref<{ openMenu: (expectedKey?: string, forceMenu?: boolean) => void } | undefined>
    social?: Ref<{ hasOpenWindow: boolean } | undefined>
    closeInventory: () => void
    closeContainers: () => void
    toggleInventory: () => void
    leave: () => void
}

export interface DialogueSwitchContext {
    canSelectTarget: (key: string) => boolean
    isPositionVisible: RatataGame['isInteractionVisible']
    connected: () => boolean
    blocked: () => boolean
    openCharacterMenu: (id: string) => void
}

export function useAppWindows(options: AppWindowsOptions) {
    provide(gameUiSoundKey, (id) => options.game.value?.playUiSound(id))
    const automationPanels = ref<InstanceType<typeof AutomationPanels>>()
    const gameMenu = useGameMenu({
        available: () => options.isStarted.value,
        game: () => options.game.value,
        chatting: () => options.chatInput.value.active,
        leave: options.leave,
    })
    const character = useCharacterWindow({
        available: () => options.isStarted.value && Boolean(options.snapshot.value),
        identity: () => options.characterId?.(),
        game: () => options.game.value,
        prepare: (wasOpen) => {
            if (wasOpen) gameMenu.resume()
            else gameMenu.dismiss()
            prepareAutomationWindow()
            automationPanels.value?.close()
        },
    })
    const { characterOpen } = character
    const worldInputBlockedByWindow = computed(() =>
        blocksDialogueSwitch(
            options,
            gameMenu.open.value,
            characterOpen.value,
            automationPanels.value?.hasOpenWindow
        )
    )
    const hasDialogue = () => Boolean(options.snapshot.value?.adventure?.dialogue)
    const worldInputBlocked = computed(() => worldInputBlockedByWindow.value || hasDialogue())
    function openNearbyMenu(id?: string, forceMenu = false): void {
        characterOpen.value = false
        if (options.planting.value || options.chestPending.value) return
        if (id && options.gameplay.value?.select(id) === false) return
        options.closeInventory()
        automationPanels.value?.close()
        void nextTick(() =>
            options.interaction.value?.openMenu(id ? `character:${id}` : undefined, forceMenu)
        )
    }
    function toggleInventory(): void {
        characterOpen.value = false
        automationPanels.value?.close()
        options.toggleInventory()
    }
    function prepareAutomationWindow(): void {
        characterOpen.value = false
        options.closeContainers()
        if (hasDialogue())
            options.game.value?.sendCommand({ type: 'dialogue_choice', choiceId: 'close' })
    }
    function openAutomation(window: 'markers' | 'scenarios'): void {
        gameMenu.resume()
        automationPanels.value?.open(window)
    }
    return {
        automationPanels,
        gameMenu,
        ...character,
        worldInputBlocked,
        dialogueSwitch: createDialogueSwitchContext(
            options,
            worldInputBlockedByWindow,
            openNearbyMenu
        ),
        openNearbyMenu,
        openInventory(): void {
            if (options.inventoryOpen.value) gameMenu.resume()
            else {
                gameMenu.dismiss()
                toggleInventory()
            }
        },
        toggleInventory,
        prepareAutomationWindow,
        openAutomation,
    }
}

function blocksDialogueSwitch(
    options: AppWindowsOptions,
    menuOpen: boolean,
    characterOpen: boolean,
    automationOpen?: boolean
): boolean {
    return [
        menuOpen,
        characterOpen,
        options.inventoryOpen.value,
        options.chestPending.value,
        options.chatInput.value.active,
        options.status.value !== 'Connected',
        options.defeated.value,
        options.social?.value?.hasOpenWindow,
        automationOpen,
    ].some(Boolean)
}

function createDialogueSwitchContext(
    options: AppWindowsOptions,
    blockedByWindow: Readonly<Ref<boolean>>,
    openNearbyMenu: (id: string, forceMenu: boolean) => void
): DialogueSwitchContext {
    return {
        canSelectTarget: (key) => options.game.value?.canSelectTarget(key) ?? false,
        isPositionVisible: (position, bounds, range) =>
            options.game.value?.isInteractionVisible(position, bounds, range) ?? false,
        connected: () => options.status.value === 'Connected',
        blocked: () => blockedByWindow.value || options.planting.value,
        openCharacterMenu: (id) => openNearbyMenu(id, true),
    }
}
