import { authoredRussian, CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export function humanControlled(character: GameCharacter): boolean {
    return (
        character.controllerKind === 'network_player' ||
        character.soul.controlSource === 'human'
    )
}

export function available(
    character: GameCharacter | undefined
): character is GameCharacter {
    return (
        character !== undefined &&
        character.alive &&
        !character.tags.has('offline') &&
        !character.tags.has('state.retired')
    )
}

export function cityGuard(character: GameCharacter): boolean {
    return character.tags.has('guard') || character.id === 'npc_guard_1'
}

export function cityCleric(character: GameCharacter): boolean {
    return character.tags.has('cleric') || character.id === 'npc_cleric_1'
}

export function isCityBlacklisted(character: GameCharacter): boolean {
    return character.tags.has('city.blacklisted')
}

export function cityTradeRefusal(character: GameCharacter): string | undefined {
    return character.locationId === CENTER_LOCATION_ID &&
        isCityBlacklisted(character)
        ? authoredRussian('trade.blacklisted')
        : undefined
}
