import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'

export function releaseScenarioInput(
    actor: GameCharacter,
    running: boolean
): null {
    if (!running) {
        cancelCharacterControl(actor)
    }
    actor.setMoveInput({ x: 0, y: 0 })
    return null
}
