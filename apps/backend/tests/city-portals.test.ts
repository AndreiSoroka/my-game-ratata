import {
    ABILITY_DEFINITIONS,
    CENTER_LOCATION_ID,
    PORTAL_LIFETIME_MS,
} from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { pursuits } from '../src/game/pursuitState'
import { GameRoom } from '../src/game/room'
import { chestNavigation, joinChestRoom } from './chestTestHelpers'
import { pursuitFixture } from './pursuitTestHelpers'

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

function required<Value>(value: Value | undefined): Value {
    if (value === undefined) {
        throw new Error('Expected an active portal endpoint')
    }
    return value
}

it('channels through the socket, charges only on success and then accepts both endpoint commands', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const room = new GameRoom(chestNavigation('portal-fixture'))
    vi.spyOn(room, 'findVisibleTarget').mockReturnValue(undefined)
    const { actor, socket } = joinChestRoom(room, 'Portal Caster')
    const home = 'map-1-1'
    actor.locationId = home
    actor.position = { x: 24, y: 24 }
    actor.abilities.known.add('city_portal')
    actor.config.resources.manaRegenIdle = 0
    const mana = 28
    actor.mana = mana
    const { windupMs, cooldownMs } = ABILITY_DEFINITIONS.city_portal
    const cast = () =>
        room.handleMessage(
            socket,
            JSON.stringify({ type: 'use_ability', abilityId: 'city_portal' })
        )
    const enter = (endpointId: string) =>
        room.handleMessage(
            socket,
            JSON.stringify({ type: 'use_portal', endpointId })
        )
    room.start()
    try {
        cast()
        vi.advanceTimersByTime(500)
        room.handleMessage(
            socket,
            JSON.stringify({ type: 'move_input', axis: { x: 1, y: 0 } })
        )
        room.handleMessage(
            socket,
            JSON.stringify({ type: 'move_input', axis: { x: 0, y: 0 } })
        )
        expect(actor.abilities.availableAt.city_portal).toBeUndefined()
        expect(actor.mana).toBe(mana)
        cast()
        vi.setSystemTime(Date.now() + windupMs - 50)
        expect(room.snapshot(Date.now(), home).portals).toBeUndefined()
        expect(actor.mana).toBe(mana)
        vi.advanceTimersByTime(50)
        const time = Date.now()
        const source = required(room.snapshot(time, home).portals?.[0])
        const destination = required(
            room.snapshot(time, CENTER_LOCATION_ID).portals?.[0]
        )
        expect(room.snapshot(time, 'map-0-0').portals).toBeUndefined()
        expect(actor.mana).toBe(0)
        expect(actor.abilities.availableAt.city_portal).toBe(time + cooldownMs)
        enter(source.id)
        expect(actor.locationId).toBe(CENTER_LOCATION_ID)
        enter(source.id)
        expect(actor.locationId).toBe(CENTER_LOCATION_ID)
        enter(destination.id)
        expect(actor.locationId).toBe(home)
    } finally {
        room.stop()
    }
})

it('opens local ends for one minute and allows a hostile actor to travel in both directions', () => {
    const f = pursuitFixture()
    const home = f.actor.locationId
    const now = f.now()
    const portal = required(f.world.portals.open(f.target, now))
    expect(portal.source.expiresAt).toBe(now + PORTAL_LIFETIME_MS)
    expect(f.world.portals.snapshot(home, now)).toEqual([portal.source])
    expect(f.world.portals.snapshot(CENTER_LOCATION_ID, now)).toEqual([
        portal.destination,
    ])
    expect(f.world.portals.snapshot('map-0-0', now)).toEqual([])
    const projected = required(f.world.portals.snapshot(home, now)[0])
    projected.position.x = 0
    expect(f.world.portals.snapshot(home, now)[0]?.position).toEqual(
        f.target.position
    )

    f.target.alive = false
    f.target.tags.add('offline')
    f.actor.position = { ...portal.source.position }
    f.actor.setMoveInput({ x: 1, y: 0 })
    f.actor.velocity = { x: 1, y: 0 }
    f.actor.movement.dashUntil = now + 1000
    f.actor.setPath([{ x: f.actor.position.x - 16, y: f.actor.position.y }])
    const mana = f.actor.mana
    const expire = portal.source.expiresAt
    const used = vi.fn()
    expect(
        f.world.usePortal(f.actor, portal.source.id, expire - 1, used)
    ).toBeDefined()
    expect(f.actor).toMatchObject({
        locationId: CENTER_LOCATION_ID,
        position: portal.destination.position,
        mana,
        velocity: { x: 0, y: 0 },
        movement: { dashUntil: 0 },
    })
    expect(f.actor.hasPath()).toBe(false)
    expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
    expect(
        f.world.usePortal(f.actor, portal.source.id, expire - 1, used)
    ).toBeUndefined()
    expect(
        f.world.usePortal(f.actor, portal.destination.id, expire - 1, used)
    ).toBeDefined()
    expect(f.actor.locationId).toBe(home)
    expect(used).toHaveBeenCalledTimes(2)
    expect(
        f.world.usePortal(f.actor, portal.source.id, expire, used)
    ).toBeUndefined()
    expect(f.world.portals.snapshot(home, expire)).toEqual([])
    expect(f.world.portals.snapshot(CENTER_LOCATION_ID, expire)).toEqual([])
    f.world.portals.expire(expire)
    expect(f.world.portals.snapshot(home, expire - 1)).toEqual([])
})

it('rechecks reach, active status and both maps’ collision without partially moving the actor', () => {
    const f = pursuitFixture()
    const now = f.now()
    const home = f.actor.locationId
    const portal = required(f.world.portals.open(f.target, now))
    const crossing = vi.fn()
    const enter = () =>
        f.world.usePortal(f.actor, portal.source.id, now, crossing)
    const cityNavigation = f.world.get(CENTER_LOCATION_ID).navigation
    const sourceNavigation = f.world.get(home).navigation
    expect(enter()).toBeUndefined()
    f.actor.position = { ...f.target.position }
    f.actor.stunUntil = now + 1
    expect(enter()).toBeUndefined()
    f.actor.stunUntil = now
    const sight = vi
        .spyOn(sourceNavigation, 'hasLineOfSight')
        .mockReturnValueOnce(false)
    expect(enter()).toBeUndefined()
    sight.mockRestore()
    const tile = cityNavigation.worldToTile(portal.destination.position)
    cityNavigation.grid.solid[tile.y * cityNavigation.grid.width + tile.x] =
        true
    expect(enter()).toBeUndefined()
    expect(f.actor.locationId).toBe(home)
    expect(crossing).not.toHaveBeenCalled()
    f.actor.locationId = CENTER_LOCATION_ID
    expect(f.world.portals.canOpen(f.actor, now)).toBe(false)
})

it.each([false, true])(
    'an aggressor uses the observed portal and returns home with expiry=%s',
    (expires) => {
        const f = pursuitFixture()
        const home = f.actor.locationId
        f.target.position.x = f.actor.position.x + 24
        let openedAt = f.now()
        if (expires) {
            openedAt -= PORTAL_LIFETIME_MS - 500
        }
        const portal = required(f.world.portals.open(f.target, openedAt))
        f.controller.update(f.actor, f.room, f.now())
        f.room.requestPortalUse(f.target, portal.source.id, f.now())
        expect(pursuits.get(f.actor)?.crossing).toMatchObject({
            endpointId: portal.source.id,
        })
        f.step()
        expect(f.actor.locationId).toBe(CENTER_LOCATION_ID)
        expect(pursuits.get(f.actor)?.foreign?.exit).toMatchObject({
            returnEndpointId: portal.destination.id,
        })
        if (expires) {
            while (f.now() < portal.source.expiresAt) {
                f.step()
            }
        }
        f.target.tags.add('offline')
        for (let step = 0; step < 2000 && pursuits.has(f.actor); step++) {
            f.step()
        }
        expect(f.actor.locationId).toBe(home)
        expect(pursuits.has(f.actor)).toBe(false)
    }
)

it('gives no portal information to an aggressor that did not see the crossing', () => {
    const f = pursuitFixture()
    const home = f.actor.locationId
    f.controller.update(f.actor, f.room, f.now())
    f.actor.position = { x: 80, y: 80 }
    const portal = required(f.world.portals.open(f.target, f.now()))
    f.room.requestPortalUse(f.target, portal.source.id, f.now())
    expect(pursuits.get(f.actor)?.crossing).toBeUndefined()
    for (let step = 0; step < 30; step++) {
        f.step()
    }
    expect(f.actor.locationId).toBe(home)
})
