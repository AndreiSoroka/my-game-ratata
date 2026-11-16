import { PURSUIT_RULES } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceCharacter } from '../src/game/movement'
import { advancePursuit } from '../src/game/pursuit'
import { pursuits, returnFromPursuit } from '../src/game/pursuitState'
import {
    canPursuitTravel,
    rememberPursuitExit,
} from '../src/game/pursuitTravel'
import { pursuitFixture } from './pursuitTestHelpers'

it.each([
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
])(
    'follows a real visible exit $x,$y and walks back to its original home',
    (direction) => {
        const f = pursuitFixture({ direction })
        f.target.setMoveInput(direction)
        for (
            let step = 0;
            step < 80 && f.actor.locationId === f.actor.spawnLocationId;
            step++
        ) {
            f.step()
        }
        expect(f.actor.locationId).not.toBe(f.actor.spawnLocationId)
        const state = pursuits.get(f.actor)
        expect(state?.foreign?.until).toBe(
            f.now() + PURSUIT_RULES.foreignDurationMs
        )
        f.target.tags.add('offline')
        const hp = f.actor.hp
        for (let step = 0; step < 160 && pursuits.has(f.actor); step++) {
            f.step()
        }
        expect(f.actor.locationId).toBe(f.actor.spawnLocationId)
        expect(
            Math.hypot(
                f.actor.position.x - f.actor.spawnPosition.x,
                f.actor.position.y - f.actor.spawnPosition.y
            )
        ).toBeLessThanOrEqual(24)
        expect(f.actor.hp).toBe(hp)
        expect(pursuits.has(f.actor)).toBe(false)
    }
)

it('uses the same crossing policy for slimes', () => {
    const f = pursuitFixture({ archetype: 'slime' })
    f.target.setMoveInput(f.direction)
    for (
        let step = 0;
        step < 100 && f.actor.locationId === f.actor.spawnLocationId;
        step++
    ) {
        f.step()
    }
    expect(f.actor.locationId).toBe('map-2-1')
})

it('does not learn an unseen exit or reuse evidence after five seconds', () => {
    const f = pursuitFixture()
    f.controller.update(f.actor, f.room, f.now())
    const edge = { x: 504, y: 248 }
    f.target.locationId = 'map-2-1'
    rememberPursuitExit(
        f.target,
        'map-1-1',
        edge,
        f.direction,
        f.characters,
        f.room.navigationFor(f.actor),
        f.now() + 50
    )
    expect(pursuits.get(f.actor)?.crossing).toBeUndefined()
    rememberPursuitExit(
        f.target,
        'map-1-1',
        edge,
        f.direction,
        f.characters,
        f.room.navigationFor(f.actor),
        f.now()
    )
    expect(canPursuitTravel(f.actor, 'map-2-1', f.now() + 4_999)).toBe(true)
    expect(canPursuitTravel(f.actor, 'map-2-1', f.now() + 5_000)).toBe(false)
})

it('does not observe a wall-hidden crossing', () => {
    const f = pursuitFixture()
    f.controller.update(f.actor, f.room, f.now())
    f.target.locationId = 'map-2-1'
    vi.spyOn(f.room.navigationFor(f.actor), 'hasLineOfSight').mockReturnValue(
        false
    )
    rememberPursuitExit(
        f.target,
        'map-1-1',
        { x: 504, y: 248 },
        f.direction,
        f.characters,
        f.room.navigationFor(f.actor),
        f.now()
    )
    expect(pursuits.get(f.actor)?.crossing).toBeUndefined()
})

it('still observes a visible exit while its own dash temporarily suspends path replanning', () => {
    const f = pursuitFixture()
    f.controller.update(f.actor, f.room, f.now())
    f.actor.movement.dashUntil = f.now() + 300
    f.controller.update(f.actor, f.room, f.now() + 50)
    f.target.locationId = 'map-2-1'
    rememberPursuitExit(
        f.target,
        'map-1-1',
        { x: 504, y: 248 },
        f.direction,
        f.characters,
        f.room.navigationFor(f.actor),
        f.now() + 50
    )
    expect(pursuits.get(f.actor)?.crossing?.to).toBe('map-2-1')
})

it('keeps the monster city barrier and then returns without entering', () => {
    const f = pursuitFixture({ locationId: 'map-1-2' })
    f.target.setMoveInput(f.direction)
    let returned = false
    for (let step = 0; step < 180; step++) {
        f.step()
        if (f.target.locationId === 'map-2-2') {
            f.target.setMoveInput({ x: 0, y: 0 })
            returned =
                !pursuits.has(f.actor) &&
                Math.hypot(
                    f.actor.position.x - f.actor.spawnPosition.x,
                    f.actor.position.y - f.actor.spawnPosition.y
                ) <= PURSUIT_RULES.homeArrivalRadius
            if (returned) {
                break
            }
        }
    }
    expect(returned).toBe(true)
    expect(f.target.locationId).toBe('map-2-2')
    expect(f.actor.locationId).toBe('map-1-2')
})

it('starts returning immediately when a city crossing is refused', () => {
    const f = pursuitFixture({ locationId: 'map-1-2' })
    f.controller.update(f.actor, f.room, f.now())
    expect(pursuits.get(f.actor)?.phase).toBe('chase')
    f.actor.position.x = 504
    expect(f.world.travel(f.actor, f.direction, f.now())).toContain(
        'не пропускает'
    )
    expect(f.actor.locationId).toBe('map-1-2')
    expect(pursuits.get(f.actor)?.phase).toBe('return')
    expect(f.actor.hasPath()).toBe(false)
    expect(f.actor.movement.dashUntil).toBe(0)
})

it('rejects every second foreign hop, including diagonal corner input with a remaining dash', () => {
    const f = pursuitFixture()
    f.target.setMoveInput(f.direction)
    for (
        let step = 0;
        step < 80 && f.actor.locationId === f.actor.spawnLocationId;
        step++
    ) {
        f.step()
    }
    f.actor.position = { x: 504, y: 504 }
    f.actor.movement.dashUntil = f.now() + 300
    f.world.travel(f.actor, { x: 1, y: 1 }, f.now())
    expect(f.actor.locationId).toBe('map-2-1')
    expect(pursuits.get(f.actor)?.phase).toBe('return')
    expect(f.actor.movement.dashUntil).toBe(0)
    f.world.travel(f.actor, { x: 0, y: 1 }, f.now() + 50)
    expect(f.actor.locationId).toBe('map-2-1')
})

it('starts returning at the original ten-second deadline without resetting it on hits or reacquisition', () => {
    const f = pursuitFixture()
    f.target.setMoveInput(f.direction)
    for (
        let step = 0;
        step < 80 && f.actor.locationId === f.actor.spawnLocationId;
        step++
    ) {
        f.step()
    }
    f.target.setMoveInput({ x: 0, y: 0 })
    const until = pursuits.get(f.actor)?.foreign?.until
    if (until === undefined) {
        throw new Error('Missing foreign pursuit')
    }
    while (f.now() < until) {
        f.step()
    }
    expect(pursuits.get(f.actor)?.phase).toBe('return')
    expect(pursuits.get(f.actor)?.foreign?.until).toBe(until)
    expect(f.events.some((event) => event.kind === 'damage')).toBe(true)
})

it('rejects a dash step beyond the 160px entry radius and keeps its original deadline', () => {
    const f = pursuitFixture()
    f.target.setMoveInput(f.direction)
    for (
        let step = 0;
        step < 80 && f.actor.locationId === f.actor.spawnLocationId;
        step++
    ) {
        f.step()
    }
    const foreign = pursuits.get(f.actor)?.foreign
    if (foreign === undefined) {
        throw new Error('Missing foreign pursuit')
    }
    f.actor.position = { x: foreign.entry.x + 159, y: foreign.entry.y }
    const before = { ...f.actor.position }
    f.actor.movement.dashDirection = { x: 1, y: 0 }
    f.actor.movement.dashStartedAt = f.now()
    f.actor.movement.dashUntil = f.now() + 300
    advanceCharacter({
        character: f.actor,
        navigation: f.room.navigationFor(f.actor),
        now: f.now() + 50,
        deltaMs: 50,
    })
    expect(f.actor.position).toEqual(before)
    expect(pursuits.get(f.actor)?.phase).toBe('return')
    expect(pursuits.get(f.actor)?.foreign?.until).toBe(foreign.until)
})

it.each(['dead', 'offline', 'retired', 'removed'] as const)(
    'returns after the pinned target is %s instead of choosing a new target',
    (reason) => {
        const f = pursuitFixture()
        f.actor.position.x -= 80
        f.target.position.x -= 80
        f.controller.update(f.actor, f.room, f.now())
        if (reason === 'dead') {
            f.target.alive = false
        }
        if (reason === 'offline') {
            f.target.tags.add('offline')
        }
        if (reason === 'retired') {
            f.target.tags.add('state.retired')
        }
        if (reason === 'removed') {
            f.characters.splice(1, 1)
        }
        f.step()
        expect(pursuits.get(f.actor)?.phase).toBe('return')
        expect(f.actor.remainingPath().at(-1)).toEqual(f.actor.spawnPosition)
    }
)

it('does not lead city-born monsters outside a city they cannot re-enter', () => {
    const f = pursuitFixture({ locationId: 'map-2-2' })
    f.target.setMoveInput(f.direction)
    for (let step = 0; step < 120; step++) {
        f.step()
    }
    expect(f.actor.locationId).toBe('map-2-2')
    expect(pursuits.get(f.actor)?.foreign).toBeUndefined()
})

it('keeps contact defence while returning and never resets health or the pursuit budget', () => {
    const f = pursuitFixture()
    f.controller.update(f.actor, f.room, f.now())
    returnFromPursuit(f.actor)
    f.actor.position.x -= 100
    f.target.position = { x: f.actor.position.x + 8, y: f.actor.position.y }
    f.actor.hp = 7
    const decision = advancePursuit(f.actor, f.target, f.room, f.now())
    expect(decision).toMatchObject({ returning: true, target: f.target })
    for (let step = 0; step < 20; step++) {
        f.step()
    }
    expect(f.target.hp).toBeLessThan(f.target.maxHp)
    expect(pursuits.get(f.actor)?.phase).toBe('return')
    expect(f.actor.hp).toBeLessThan(8)
})

it.each([28, 80])(
    'a former target at %dpx does not hide a different contact threat during the return',
    (range) => {
        const f = pursuitFixture()
        f.controller.update(f.actor, f.room, f.now())
        returnFromPursuit(f.actor)
        f.actor.position.x -= 100
        f.target.position = {
            x: f.actor.position.x + range,
            y: f.actor.position.y,
        }
        const nearby = new GameCharacter({
            id: 'nearby',
            nickname: 'Nearby',
            archetype: 'human',
            controllerKind: 'network_player',
            locationId: f.actor.locationId,
            spawnPosition: { x: f.actor.position.x - 8, y: f.actor.position.y },
        })
        f.characters.push(nearby)
        expect(
            advancePursuit(f.actor, f.target, f.room, f.now())
        ).toMatchObject({ returning: true, target: nearby })
        expect(f.actor.facing).toBe('left')
        expect(pursuits.get(f.actor)?.targetId).toBe(f.target.id)
        expect(pursuits.get(f.actor)?.phase).toBe('return')
    }
)
