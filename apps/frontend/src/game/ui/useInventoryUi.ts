import { ref } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
export function useInventoryUi(game: () => RatataGame | undefined, closeChest: () => void) {
    const inventoryOpen = ref(false),
        planting = ref(false)
    function setVisible(open: boolean): void {
        if (inventoryOpen.value === open) return
        inventoryOpen.value = open
        game()?.playUiSound(open ? 'uiOpen' : 'uiClose')
    }
    function setInventory(open: boolean): void {
        planting.value = false
        if (open) {
            closeChest()
            game()?.releaseUiControls()
        }
        setVisible(open)
    }
    const closeInventory = () => {
        inventoryOpen.value = false
    }
    const startPlanting = () => {
        closeInventory()
        closeChest()
        game()?.releaseUiControls()
        planting.value = true
    }
    return {
        closeContainers: () => {
            closeInventory()
            closeChest()
        },
        inventoryOpen,
        planting,
        setInventory,
        closeInventory,
        dismissInventory: () => setVisible(false),
        startPlanting,
        toggleInventory: () => setInventory(!inventoryOpen.value),
    }
}
