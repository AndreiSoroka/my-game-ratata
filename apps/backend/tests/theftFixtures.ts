import type { GameEventPayload, Vector2 } from '@my-game-ratata/contracts'

import { GameCharacter } from '../src/game/character'
import { attemptAttack } from '../src/game/combat'
import { createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'
import { TheftService } from '../src/game/theft'

export function theftCharacter(
    id: string,
    position: Vector2 = { x: 100, y: 100 },
    kind: GameCharacter['controllerKind'] = 'network_player'
): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        faction: 'peaceful',
        controllerKind: kind,
        spawnPosition: position,
    })
}
export function theftFixture() {
    const actor = theftCharacter('thief')
    actor.movement.mode = 'sneaking'
    const victim = theftCharacter('victim', { x: 112, y: 100 })
    victim.inventory.push(createItemInstance('food'))
    const characters = [actor, victim]
    const navigation = new NavigationService({
        id: 'theft-test',
        width: 30,
        height: 30,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(900).fill(false),
        solidLayerNames: [],
    })
    const service = new TheftService()
    const events: GameEventPayload[] = []
    const room = {
        getCharacter: (id: string) =>
            characters.find((character) => character.id === id),
        navigationFor: () => navigation,
        findVisibleTarget: (observer: GameCharacter, radius: number) =>
            findVisibleTarget(characters, navigation, observer, radius, 1_000),
        requestAttack: (attacker: GameCharacter, now: number) =>
            events.push(
                ...attemptAttack({
                    actor: attacker,
                    targets: characters,
                    now,
                    tileSize: 16,
                    respawnDelayMsFor: () => 15_000,
                })
            ),
    } as unknown as GameRoom
    const attempt = (rolls = [0.99, 0], now = 1_000) => {
        let index = 0
        return service.handle(
            actor,
            { type: 'steal', targetId: victim.id },
            {
                characters,
                navigation,
                now,
                random: () => rolls[index++] ?? 0.99,
            }
        )
    }
    return {
        actor,
        victim,
        characters,
        navigation,
        service,
        room,
        events,
        attempt,
    }
}
