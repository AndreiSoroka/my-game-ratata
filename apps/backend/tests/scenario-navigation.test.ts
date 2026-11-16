import type { ScenarioDefinition, Vector2 } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'
import { navigateScenario } from '../src/game/scenarioNavigation'
import { advanceScenario } from '../src/game/scenarioRunner'
import { createScenarioRun } from '../src/game/scenarioState'
import { WorldLocations } from '../src/game/worldLocations'

function setup(monster: boolean, crossing: boolean) {
    const navigation = new NavigationService({
        id: 'scenario-nav-test',
        width: 12,
        height: 12,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(144).fill(false),
        solidLayerNames: [],
    })
    const world = new WorldLocations(navigation)
    const locationId = crossing ? 'map-2-1' : 'map-2-2'
    const actor = new GameCharacter({
        id: 'traveller',
        nickname: 'Traveller',
        archetype: monster ? 'slime' : 'human',
        controllerKind: monster ? 'mob1' : 'network_player',
        locationId,
        spawnPosition: crossing ? { x: 88, y: 184 } : { x: 40, y: 40 },
    })
    const destination = {
        kind: 'point' as const,
        locationId: 'map-2-2',
        position: crossing ? { x: 88, y: 40 } : { x: 120, y: 40 },
    }
    const definition: ScenarioDefinition = {
        id: 'travel',
        name: 'Travel',
        repeat: 1,
        threat: 'continue',
        steps: [{ id: 'go', kind: 'go', destination }],
    }
    const run = createScenarioRun(actor, actor.id, definition, 0)
    const room = {
        navigationFor: (character: GameCharacter) =>
            world.get(character.locationId).navigation,
    } as GameRoom
    const tick = (now: number) => {
        advanceScenario(actor, run, room, now, false)
        const axis = actor.getMoveInput()
        const point = actor.nextPathPoint()
        const intent: Vector2 =
            point === undefined || axis.x !== 0 || axis.y !== 0
                ? axis
                : {
                      x: point.x - actor.position.x,
                      y: point.y - actor.position.y,
                  }
        advanceCharacter({
            character: actor,
            navigation: room.navigationFor(actor),
            now,
            deltaMs: 50,
        })
        world.travel(actor, intent, now)
    }
    return {
        actor,
        room,
        world,
        navigation: world.get(locationId).navigation,
        run,
        tick,
    }
}

it('fails a refused city crossing after ten seconds instead of claiming continuous progress', () => {
    const { actor, run, tick } = setup(true, true)
    for (let now = 50; now < 10_000; now += 50) {
        tick(now)
    }
    expect(actor.locationId).toBe('map-2-1')
    expect(actor.position).toEqual({ x: 88, y: 184 })
    expect(run.snapshot.remainingFailureMs).toBe(50)
    tick(10_000)
    expect(run.snapshot.status).toBe('completed')
    expect(run.snapshot.results[0]).toMatchObject({
        status: 'failed',
        failures: 1,
    })
})

it('crosses to an adjacent location through ordinary collision-resolved movement', () => {
    const { actor, run, tick } = setup(false, true)
    tick(50)
    expect(actor.locationId).toBe('map-2-2')
    tick(100)
    expect(actor.position).toEqual({ x: 88, y: 40 })
    expect(run.snapshot.results[0]?.status).toBe('succeeded')
})

it('never treats an unreachable free destination as a completed scenario step', () => {
    const { actor, navigation, run, tick } = setup(false, false)
    for (let y = 0; y < 12; y++) {
        navigation.grid.solid[y * 12 + 5] = true
    }
    for (let now = 50; now <= 10_000; now += 50) {
        tick(now)
    }
    expect(actor.position).toEqual({ x: 40, y: 40 })
    expect(run.snapshot.results[0]?.status).toBe('failed')
})

it.each([
    { x: -1, y: 40 },
    { x: 1000, y: 40 },
    { x: 40, y: 1000 },
    { x: 0, y: 40 },
])(
    'rejects exact point $x,$y if reaching it would require boundary clamping',
    (point) => {
        const { actor, room, navigation, run } = setup(false, false)
        expect(
            navigateScenario(actor, run, room, actor.locationId, point, 1, 50)
        ).toMatchObject({ state: 'blocked' })
        advanceCharacter({
            character: actor,
            navigation,
            now: 100,
            deltaMs: 50,
        })
        expect(actor.position).toEqual({ x: 40, y: 40 })
        expect(actor.hasPath()).toBe(false)
        expect(actor.getMoveInput()).toEqual({ x: 0, y: 0 })
    }
)

it('counts real movement along a detour as progress even while distance to the goal increases', () => {
    const { actor, room, navigation, run } = setup(false, false)
    // A wall blocks the eastward destination; the opening forces a long trip south first.
    for (let y = 0; y < 10; y++) {
        navigation.grid.solid[y * 12 + 5] = true
    }
    const point = { x: 120, y: 40 }
    navigateScenario(actor, run, room, actor.locationId, point, 1, 0)
    let farther = false
    for (let now = 50; now <= 1000; now += 50) {
        const previous = Math.hypot(
            actor.position.x - point.x,
            actor.position.y - point.y
        )
        advanceCharacter({ character: actor, navigation, now, deltaMs: 50 })
        const outcome = navigateScenario(
            actor,
            run,
            room,
            actor.locationId,
            point,
            1,
            now
        )
        if (
            Math.hypot(actor.position.x - point.x, actor.position.y - point.y) >
            previous + 0.1
        ) {
            farther = true
            expect(outcome.state).toBe('progress')
        }
    }
    expect(farther).toBe(true)
})
