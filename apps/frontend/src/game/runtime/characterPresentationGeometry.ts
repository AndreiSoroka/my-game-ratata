import type { CharacterVisualId, Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

import { characterCatalog } from '../assets/characterCatalog'

export function characterTargetBounds(position: Vector2): WorldObjectBounds {
    return { x: position.x - 12, y: position.y - 29, width: 24, height: 32 }
}

/** Frame-relative overhead geometry is shared by canvas nameplates and DOM speech. */
export function characterOverhead(visualId: CharacterVisualId) {
    const height = visualId === 'training_dummy' ? 48 : characterCatalog[visualId].spriteHeight
    return {
        label: height * 0.75 + 8,
        health: height * 0.75 - 4,
        top: height * 0.75 + 13,
        bottom: height * 0.25,
        halfWidth: height / 2,
    }
}
