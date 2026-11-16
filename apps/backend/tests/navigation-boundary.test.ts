import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'

function map(): NavigationService {
    return new NavigationService({
        id: 'boundary-test',
        width: 10,
        height: 10,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(100).fill(false),
        solidLayerNames: [],
    })
}

describe('ordinary click targets at world boundaries', () => {
    it.each([
        { target: { x: 160, y: 88 }, tile: { x: 9, y: 5 } },
        { target: { x: 88, y: 160 }, tile: { x: 5, y: 9 } },
        { target: { x: -1, y: 88 }, tile: { x: 0, y: 5 } },
        { target: { x: 88, y: -1 }, tile: { x: 5, y: 0 } },
    ])('walks toward clamped boundary $target', ({ target, tile }) => {
        const navigation = map()
        const actor = new GameCharacter({
            id: 'hero',
            nickname: 'Hero',
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: { x: 88, y: 88 },
        })
        const path = navigation.findPathWorld(actor.position, target)
        expect(path.length).toBeGreaterThan(0)
        expect(navigation.worldToTile(path.at(-1) ?? actor.position)).toEqual(
            tile
        )
        actor.setPath(path)
        for (let now = 1_000; now < 4_000 && actor.hasPath(); now += 50) {
            advanceCharacter({ character: actor, navigation, now, deltaMs: 50 })
        }
        expect(actor.hasPath()).toBe(false)
        expect(navigation.worldToTile(actor.position)).toEqual(tile)
    })

    it('still rejects a solid target tile after clamping and never routes through it', () => {
        const navigation = map()
        navigation.grid.solid[59] = true
        expect(
            navigation.findPathWorld({ x: 88, y: 88 }, { x: 160, y: 88 })
        ).toEqual([])
    })
})
