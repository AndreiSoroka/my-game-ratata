import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, type Ref, ref } from 'vue'

import type { ChatInputState } from '../runtime/chatInput'
import type { RatataGame } from '../runtime/ratataGame'
import type AutomationPanels from './AutomationPanels.vue'
import { useGameMenu } from './useGameMenu'

interface AppWindowsOptions {
    game: Ref<RatataGame | undefined>
    isStarted: Ref<boolean>
    chatInput: Ref<ChatInputState>
    planting: Ref<boolean>
    inventoryOpen: Ref<boolean>
    chestPending: Ref<boolean>
    status: Ref<string>
    defeated: Ref<boolean>
    snapshot: Ref<WorldSnapshot | undefined>
    gameplay: Ref<{ select: (id: string) => void } | undefined>
    interaction: Ref<{ openMenu: () => void } | undefined>
    adventure: Ref<{ hasOpenWindow: boolean; closeWindows: () => void } | undefined>
    closeInventory: () => void
    closeContainers: () => void
    toggleInventory: () => void
    leave: () => void
}
export function useAppWindows(options: AppWindowsOptions) {
    const automationPanels = ref<InstanceType<typeof AutomationPanels>>()
    const gameMenu = useGameMenu({
        available: () => options.isStarted.value,
        game: () => options.game.value,
        chatting: () => options.chatInput.value.active,
        leave: options.leave,
    })
    const worldInputBlocked = computed(() =>
        [
            gameMenu.open.value,
            options.inventoryOpen.value,
            options.chestPending.value,
            options.chatInput.value.active,
            options.status.value !== 'Connected',
            options.defeated.value,
            options.adventure.value?.hasOpenWindow,
            automationPanels.value?.hasOpenWindow,
            options.snapshot.value?.adventure?.dialogue,
        ].some(Boolean)
    )
    function openNearbyMenu(id?: string): void {
        if (options.planting.value) return
        if (id) options.gameplay.value?.select(id)
        if (options.chestPending.value) return
        options.closeInventory()
        automationPanels.value?.close()
        options.adventure.value?.closeWindows()
        void nextTick(() => options.interaction.value?.openMenu())
    }
    function toggleInventory(): void {
        automationPanels.value?.close()
        options.toggleInventory()
    }
    function prepareAutomationWindow(): void {
        options.closeContainers()
        options.adventure.value?.closeWindows()
        if (options.snapshot.value?.adventure?.dialogue)
            options.game.value?.sendCommand({ type: 'dialogue_choice', choiceId: 'close' })
    }
    function openAutomation(window: 'markers' | 'scenarios'): void {
        gameMenu.resume()
        automationPanels.value?.open(window)
    }
    function closeOtherContainers(): void {
        options.closeContainers()
        automationPanels.value?.close()
    }
    return {
        automationPanels,
        gameMenu,
        worldInputBlocked,
        openNearbyMenu,
        toggleInventory,
        prepareAutomationWindow,
        openAutomation,
        closeOtherContainers,
    }
}
