import { vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceCharacterControl } from '../src/game/characterControl'
import type { ControlWorld } from '../src/game/controlWorld'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'

export function routeFixture() {
    const navigation = new NavigationService({
        id: 'route-test',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
    const actor = new GameCharacter({
        id: 'hero',
        nickname: 'Hero',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 40, y: 40 },
    })
    const publishEvents = vi.fn<NonNullable<ControlWorld['publishEvents']>>()
    const world: ControlWorld = {
        navigationFor: () => navigation,
        getCharacter: () => undefined,
        requestAttack: () => undefined,
        publishEvents,
    }
    const control = (now: number) => advanceCharacterControl(actor, world, now)
    const move = (now: number) =>
        advanceCharacter({ character: actor, navigation, now, deltaMs: 50 })
    const tick = (now: number) => {
        control(now)
        move(now)
    }
    const divideMap = () => {
        for (let y = 0; y < 20; y++) {
            navigation.grid.solid[y * 20 + 5] = true
        }
    }
    return {
        actor,
        navigation,
        world,
        publishEvents,
        tick,
        control,
        move,
        divideMap,
    }
}
