import { expect, it } from 'vitest'

import type { GameRoom } from '../src/game/room'
import { visibleScenarioTargets } from '../src/game/scenarioTargets'
import { scenarioFixture } from './scenarioTestHelpers'

it('sees a solid container by its reachable edge, while walls still hide it', () => {
    const f = scenarioFixture()
    const chest = {
        id: 'barrel',
        kind: 'barrel' as const,
        position: { x: 136, y: 136 },
        bounds: { x: 128, y: 128, width: 16, height: 16 },
        itemCount: 1,
        state: 'closed' as const,
    }
    f.actor.position = { x: 104, y: 136 }
    f.navigation.grid.solid[8 * 30 + 8] = true
    const room = {
        navigationFor: () => f.navigation,
        adventureForWorkers: () => f.adventure,
        scenarioEnvironment: () => ({ chests: [chest], items: [] }),
    } as unknown as GameRoom
    expect(f.navigation.hasLineOfSight(f.actor.position, chest.position)).toBe(
        false
    )
    expect(
        visibleScenarioTargets(f.actor, room, 'chest').map(
            (target) => target.id
        )
    ).toEqual(['barrel'])
    f.actor.position = { x: 24, y: 136 }
    for (let y = 0; y < 30; y += 1) {
        f.navigation.grid.solid[y * 30 + 5] = true
    }
    expect(visibleScenarioTargets(f.actor, room, 'chest')).toEqual([])
})

it('search clears residual movement and never walks toward an unseen target', () => {
    const f = scenarioFixture()
    f.start({
        id: 'search',
        name: 'Поиск',
        repeat: 1,
        main: [{ id: 'first', kind: 'search', target: 'tree' }],
        sequences: [],
        reactions: [],
    })
    f.actor.setMoveInput({ x: 1, y: 0 })
    f.actor.setPath([{ x: 120, y: 24 }])
    f.tick()
    expect(f.actor.position).toEqual({ x: 24, y: 24 })
    expect(f.actor.path).toEqual([])
    expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
    expect(f.snapshot().run?.stepIndex).toBe(0)
})
