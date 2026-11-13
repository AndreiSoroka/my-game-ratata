import type { HeroClass } from '@my-game-ratata/contracts'

import { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { playerSpawn } from './spawns'

interface PlayerOptions {
    nickname: string
    nicknameKey: string
    archetype: GameCharacter['archetype']
    heroClass: HeroClass | undefined
}

export function createRoomPlayer(
    characters: Map<string, GameCharacter>,
    nicknames: Map<string, string>,
    navigation: NavigationService,
    index: number,
    options: PlayerOptions
): GameCharacter {
    const character = new GameCharacter({
        id: `player_${String(index)}`,
        spawnPosition: playerSpawn(navigation, index),
        archetype: options.archetype,
        controllerKind: 'network_player',
        ...(options.heroClass === undefined
            ? {}
            : { heroClass: options.heroClass }),
        nickname: options.nickname,
    })
    characters.set(character.id, character)
    nicknames.set(options.nicknameKey, character.id)
    return character
}
