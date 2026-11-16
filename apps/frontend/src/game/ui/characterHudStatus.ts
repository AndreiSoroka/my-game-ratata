import type { CharacterSnapshot } from '@my-game-ratata/contracts'

import { healthText } from './healthPresentation'

export function characterHudStatus(characters: CharacterSnapshot[]): {
    players: number
    allies: string[]
    monsters: string[]
} {
    return {
        players: characters.filter((character) => character.controllerKind === 'network_player')
            .length,
        allies: characters
            .filter(
                (character) =>
                    character.controllerKind === 'mob1' && character.faction === 'peaceful'
            )
            .map((character) =>
                `Ally ${character.nickname} ${healthText(character.health)}`.trim()
            ),
        monsters: characters
            .filter(
                (character) =>
                    character.controllerKind === 'mob1' && character.faction === 'monsters'
            )
            .map((character) =>
                `${character.archetype.charAt(0).toUpperCase()}${character.archetype.slice(1)} ${healthText(character.health)}`.trim()
            ),
    }
}
