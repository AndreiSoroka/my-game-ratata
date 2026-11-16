import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import { gameKeyBlocked, worldKeyboardOwned } from './keyboardOwnership'

export function relation(
    character: CharacterSnapshot,
    player: CharacterSnapshot
): 'self' | 'friendly' | 'hostile' {
    return character.id === player.id
        ? 'self'
        : (character.relationship ??
              (character.faction === player.faction ? 'friendly' : 'hostile'))
}
export function combatInputBlocked(): boolean {
    return worldKeyboardOwned()
}

export function combatKeyBlocked(event: KeyboardEvent, blocked: boolean): boolean {
    return blocked || gameKeyBlocked(event)
}

export function attackableTarget(character: CharacterSnapshot, player: CharacterSnapshot): boolean {
    return character.trainingTarget !== undefined || relation(character, player) === 'hostile'
}
