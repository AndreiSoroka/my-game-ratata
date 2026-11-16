import type {
    CharacterControllerKind,
    CreatureType,
    HeroClass,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from '../src/game/abilityContext'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
let serial = 0
export function abilityHero(
    heroClass: HeroClass = 'cleric',
    creatureType: CreatureType = 'humanoid',
    controllerKind: CharacterControllerKind = 'network_player'
): GameCharacter {
    return new GameCharacter({
        id: `ability-${String(++serial)}`,
        nickname: 'Ability',
        archetype: creatureType === 'undead' ? 'skeleton' : 'human',
        creatureType,
        heroClass,
        controllerKind,
        faction: 'peaceful',
        spawnPosition: { x: 100, y: 100 },
    })
}
export function abilityContext(
    characters: GameCharacter[],
    now = 1000,
    random = () => 0
): AbilityContext {
    return {
        characters,
        now,
        random,
        navigation: new NavigationService({
            id: 'map-2-2',
            width: 32,
            height: 32,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(1024).fill(false),
            solidLayerNames: [],
        }),
    }
}
