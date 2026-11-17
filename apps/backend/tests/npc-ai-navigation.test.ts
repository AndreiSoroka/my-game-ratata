import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { npcAiDecisionError } from '../src/ai/actions'
import { npcAiNavigationError } from '../src/ai/navigationPolicy'
import { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
import { resolveRouteDestination } from '../src/game/routeDestination'
import { miraId, npcReply, npcRuntimeFixture } from './npcAiRuntimeFixture'

const rooms: Array<ReturnType<typeof npcRuntimeFixture>> = []
afterEach(async () => {
    for (const fixture of rooms.splice(0)) {
        fixture.room.stop()
        await fixture.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function fixture(width = 12, height = 12, tileWidth = 16, tileHeight = 16) {
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        width,
        height,
        tileWidth,
        tileHeight,
        solid: Array<boolean>(width * height).fill(false),
        solidLayerNames: [],
    })
    const actor = new GameCharacter({
        id: 'city-npc',
        nickname: 'City NPC',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: navigation.tileToWorld({ x: 5, y: 5 }),
    })
    return { actor, navigation }
}

it.each([
    { x: 8, y: 88 },
    { x: 184, y: 88 },
    { x: 88, y: 8 },
    { x: 88, y: 184 },
    { x: 8, y: 8 },
    { x: 184, y: 184 },
    { x: 8.005, y: 88 },
])('rejects travel boundaries and corners at $x,$y', (target) => {
    const f = fixture()
    for (const role of ['companion', 'city_coordinator'] as const) {
        expect(
            npcAiDecisionError(
                f.actor,
                role,
                { type: 'move_to', target },
                f.navigation
            )
        ).toContain('travel edges')
    }
})

it('validates the actual resolved fallback rather than only the requested interior point', () => {
    const f = fixture()
    for (let y = 3; y <= 7; y += 1) {
        for (let x = 1; x <= 3; x += 1) {
            f.navigation.grid.solid[y * 12 + x] = true
        }
    }
    const target = { x: 24, y: 88 }
    const resolved = resolveRouteDestination(
        f.actor.position,
        target,
        f.navigation
    )
    expect(resolved?.destination.x).toBe(8)
    expect(npcAiNavigationError(f.actor, target, f.navigation)).toContain(
        'travel edges'
    )
})

it('rejects an interior destination when its only path crosses a travel edge', () => {
    const f = fixture(8, 8)
    f.actor.position = f.navigation.tileToWorld({ x: 2, y: 4 })
    for (let y = 1; y < 8; y += 1) {
        f.navigation.grid.solid[y * 8 + 3] = true
    }
    const target = f.navigation.tileToWorld({ x: 5, y: 4 })
    const resolved = resolveRouteDestination(
        f.actor.position,
        target,
        f.navigation
    )
    expect(resolved?.destination).toEqual(target)
    expect(resolved?.path.some((point) => point.y === 8)).toBe(true)
    expect(npcAiNavigationError(f.actor, target, f.navigation)).toContain(
        'travel edges'
    )
})

it('uses authored tile dimensions and keeps ordinary interior routes available', () => {
    const f = fixture(16, 10, 12, 20)
    expect(
        npcAiNavigationError(f.actor, { x: 6, y: 110 }, f.navigation)
    ).toContain('travel edges')
    expect(
        npcAiNavigationError(f.actor, { x: 102, y: 150 }, f.navigation)
    ).toBeUndefined()
})

it('keeps Mira physically inside the city when a model asks her to walk across a travel edge', async () => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const target = { x: 0, y: 0 }
    const f = npcRuntimeFixture(
        () =>
            Promise.resolve(
                npcReply(
                    { type: 'move_to', target: { ...target } },
                    { done: false }
                )
            ),
        { includeMira: true }
    )
    rooms.push(f)
    const navigation = f.room.navigation.summary
    target.x = navigation.tileWidth / 2
    target.y = navigation.worldHeight / 2 + navigation.tileHeight / 2
    const mira = f.room.getCharacter(miraId)
    expect(mira).toBeDefined()
    await f.advance(11_000)
    expect(mira?.locationId).toBe(CENTER_LOCATION_ID)
    await f.diagnostics.flush()
    expect(f.entries()).toContainEqual(
        expect.objectContaining({
            actorId: miraId,
            category: 'action_rejected',
            reason: 'City-only AI routes cannot touch location travel edges',
        })
    )
}, 15_000)
