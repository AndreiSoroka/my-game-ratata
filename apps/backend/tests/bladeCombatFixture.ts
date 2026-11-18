import type {
    CharacterControllerKind,
    HeroClass,
} from '@my-game-ratata/contracts'

import { GameCharacter } from '../src/game/character'
import type { AttackContext } from '../src/game/combat'
import { NavigationService } from '../src/game/navigation'

/** Domain fixture positions, never mutations of a running multiplayer world. */
export function bladeDuel(
    heroClass: HeroClass = 'cleric',
    controllerKind: CharacterControllerKind = 'network_player'
) {
    const actor = new GameCharacter({
        id: `blade:${heroClass}:${controllerKind}`,
        nickname: 'Атакующий',
        archetype: 'human',
        heroClass,
        controllerKind,
        faction: 'peaceful',
        spawnPosition: { x: 100, y: 100 },
    })
    const target = new GameCharacter({
        id: 'blade:target',
        nickname: 'Противник',
        archetype: 'human',
        heroClass: 'vanguard',
        controllerKind: 'mob1',
        faction: 'monsters',
        spawnPosition: { x: 100, y: 112 },
    })
    for (const character of [actor, target]) {
        character.progression.constellations.opened.clear()
        character.config.combat.critChance = 0
        character.config.combat.dodgeChance = 0
    }
    target.baseMaxHp = 1000
    target.hp = 1000
    target.energy = 100
    target.reputation.peaceful = -100
    const navigation = new NavigationService({
        id: 'blade-fixture',
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(1024).fill(false),
    })
    const attack: AttackContext = {
        actor,
        targets: [actor, target],
        targetId: target.id,
        now: 1000,
        tileSize: 16,
        navigation,
        random: () => 0.5,
        respawnDelayMsFor: () => 15000,
    }
    return {
        actor,
        target,
        navigation,
        attack,
        at: (now: number) => ({ ...attack, now }),
    }
}
