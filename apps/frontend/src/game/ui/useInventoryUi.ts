import type { CharacterSnapshot } from '@my-game-ratata/contracts'
import { ref } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
export function useInventoryUi(
    game: () => RatataGame | undefined,
    player: () => CharacterSnapshot | undefined,
    closeChest: () => void
) {
    const inventoryOpen = ref(false),
        planting = ref(false)
    function setInventory(open: boolean): void {
        planting.value = false
        if (open) {
            closeChest()
            const character = player()
            if (character?.path.length)
                game()?.sendCommand({ type: 'move_to', target: { ...character.position } })
            game()?.sendCommand({ type: 'move_input', axis: { x: 0, y: 0 } })
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
