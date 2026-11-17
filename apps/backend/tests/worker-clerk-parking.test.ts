import type { WorkRequestSnapshot } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'
import { WorkerClerkParking } from '../src/game/workerClerkParking'

function fixture() {
    const actor = (id: string) =>
        new GameCharacter({
            id,
            nickname: id,
            archetype: 'human',
            controllerKind: 'scripted',
            spawnPosition: { x: 80, y: 80 },
        })
    const a = actor('a')
    const b = actor('b')
    const clerk = actor('clerk')
    clerk.position = { x: 160, y: 160 }
    const navigation = new NavigationService({
        id: 'parking',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(400).fill(false),
    })
    const requests = {
        forWorker: (id: string): WorkRequestSnapshot => ({
            id: `request:${id}`,
            workerId: id,
            workerName: id,
            cityId: clerk.locationId,
            clerkId: clerk.id,
            locationId: clerk.locationId,
            locationName: 'test',
            enemyName: 'old threat',
            requiredTrophyItemId: 'bone',
            proofAccepted: true,
            stage: 'ready',
            reason: null,
        }),
    }
    const parking = new WorkerClerkParking(requests)
    const room = {
        navigationFor: () => navigation,
        getCharacter: (id: string) =>
            [a, b, clerk].find((entry) => entry.id === id),
    } as unknown as GameRoom
    const endpoint = (character: GameCharacter) => {
        const points = character.remainingPath()
        return points[points.length - 1]
    }
    return { a, b, clerk, navigation, requests, parking, room, endpoint }
}

it('reserves separate stable reachable waiting places inside live clerk contact', () => {
    const f = fixture()
    expect(f.parking.advance(f.a, f.clerk, f.room, 0)).toBe('moving')
    expect(f.parking.advance(f.b, f.clerk, f.room, 0)).toBe('moving')
    const first = f.endpoint(f.a)
    const second = f.endpoint(f.b)
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first).not.toEqual(second)
    f.parking.advance(f.a, f.clerk, f.room, 500)
    expect(f.endpoint(f.a)).toEqual(first)
    for (let now = 550; now <= 6000; now += 50) {
        for (const actor of [f.a, f.b]) {
            f.parking.advance(actor, f.clerk, f.room, now)
            advanceCharacter({
                character: actor,
                navigation: f.navigation,
                deltaMs: 50,
                now,
            })
        }
    }
    expect(f.parking.advance(f.a, f.clerk, f.room, 6050)).toBe('arrived')
    expect(f.parking.advance(f.b, f.clerk, f.room, 6050)).toBe('arrived')
    expect(
        Math.hypot(
            f.a.position.x - f.b.position.x,
            f.a.position.y - f.b.position.y
        )
    ).toBeGreaterThanOrEqual(24)
    expect(
        Math.hypot(
            f.a.position.x - f.clerk.position.x,
            f.a.position.y - f.clerk.position.y
        )
    ).toBeLessThanOrEqual(64)
    expect(f.navigation.hasLineOfSight(f.a.position, f.clerk.position)).toBe(
        true
    )
})

it('limits failed candidate replanning to once per second', () => {
    const f = fixture()
    const find = vi.spyOn(f.navigation, 'findPathWorld').mockReturnValue([])
    expect(f.parking.advance(f.a, f.clerk, f.room, 0)).toBe('blocked')
    const calls = find.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    for (const now of [1, 100, 500, 999]) {
        expect(f.parking.advance(f.a, f.clerk, f.room, now)).toBe('blocked')
    }
    expect(find.mock.calls).toHaveLength(calls)
    f.parking.advance(f.a, f.clerk, f.room, 1000)
    expect(find.mock.calls.length).toBeGreaterThan(calls)
})
