import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { ref } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
export function useInventoryUi(
    game: () => RatataGame | undefined,
    _player: () => CharacterSnapshot | undefined,
    closeChest: () => void
) {
    const inventoryOpen = ref(false),
        planting = ref(false)
    function setInventory(open: boolean): void {
        planting.value = false
        if (open) {
            closeChest()
            game()?.releaseUiControls()
        }
        inventoryOpen.value = open
    }
    const closeInventory = () => {
        inventoryOpen.value = false
    }
    const startPlanting = () => {
        closeInventory()
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
        startPlanting,
        toggleInventory: () => setInventory(!inventoryOpen.value),
    }
}
