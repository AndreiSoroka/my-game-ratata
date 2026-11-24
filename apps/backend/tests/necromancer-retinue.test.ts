import {
    WESTERN_RUINS_LOCATION_ID,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import {
    ashBoundSkeletons,
    ashSkeletonBond,
} from '../src/game/ashSkeletonState'
import { distance } from '../src/game/math'
import { regionalExit } from '../src/game/regionalNavigation'
import { GameRoom } from '../src/game/room'
import { SAVVA_ID } from '../src/game/savvaTerritory'
import { chestId, chestNavigation, chestPosition } from './chestTestHelpers'
import { waitForScenario } from './scenarioRoomHelpers'

let room: GameRoom | undefined

afterEach(() => {
    room?.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('walks to find a real replacement in an adjacent location and returns with it while a guard stays home', () => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(120_000)
    const north = worldLocationNeighbor(WESTERN_RUINS_LOCATION_ID, 'north')
    if (north === undefined) {
        throw new Error('The Western Ruins must have a northern neighbor')
    }
    const fixture = chestNavigation('retinue-test')
    fixture.grid.encounters = {
        ashRefuge: { home: { x: 88, y: 72 }, chestId, chest: chestPosition },
        graves: [
            {
                id: 'north-grave',
                position: { x: 184, y: 184 },
                locationId: north.id,
            },
        ],
        slimeHabitats: [],
    }
    fixture.grid.landmarks = ['ash_headstone', 'ash_grave', 'ash_collapse'].map(
        (kind, index) => ({
            kind,
            id: kind,
            name: kind,
            position: { x: 72, y: 120 + index * 16 },
        })
    )
    const game = new GameRoom(fixture, {
        worldClock: () => Date.now() * 5,
    })
    room = game
    const savva = game.getCharacter(SAVVA_ID)
    const replacement = game.getCharacter(`mob_skeleton_1_${north.id}`)
    if (savva === undefined || replacement === undefined) {
        throw new Error(
            'The fixture needs Savva and an existing skeleton to the north'
        )
    }
    const home = savva.locationId
    const group = ashBoundSkeletons(savva)
    const guard = group.find(
        (skeleton) => ashSkeletonBond(skeleton)?.guard !== undefined
    )
    const fallen = group.find((skeleton) => skeleton !== guard)
    if (guard === undefined || fallen === undefined) {
        throw new Error('The fixture needs at least a guard and an escort')
    }
    for (const actor of [
        ...game.charactersFor(savva),
        ...game.charactersFor(replacement),
    ]) {
        if (
            actor !== savva &&
            actor !== replacement &&
            !group.includes(actor)
        ) {
            actor.tags.add('offline')
        }
    }
    fallen.applyDamage(fallen.hp, game.gameplayNow())

    // Keep the first reachable recruit near the destination’s ordinary entry.
    const exit = regionalExit(
        savva.position,
        home,
        north.id,
        game.navigationFor(savva)
    )
    if (exit === undefined) {
        throw new Error('The generated refuge must have a reachable north exit')
    }
    const navigation = game.navigationFor(replacement)
    const entry = {
        x: exit.point.x,
        y: navigation.summary.worldHeight - navigation.grid.tileHeight * 2.5,
    }
    const recruitTile = navigation.findWalkableTileNear(
        navigation.worldToTile({
            ...entry,
            x: entry.x + navigation.grid.tileWidth,
        })
    )
    if (recruitTile === undefined) {
        throw new Error('The north map must support a safe entry point')
    }
    replacement.position = navigation.tileToWorld(recruitTile)
    replacement.stunUntil = game.gameplayNow() + 90_000
    const guardPost = { ...guard.position }
    game.start()
    waitForScenario(() => savva.locationId === north.id, 15_000)
    expect(guard.locationId).toBe(home)
    waitForScenario(() => ashSkeletonBond(replacement)?.owner === savva, 5_000)
    replacement.stunUntil = 0
    waitForScenario(
        () => savva.locationId === home && replacement.locationId === home,
        12_000
    )
    expect(game.getCharacter(replacement.id)).toBe(replacement)
    expect(ashBoundSkeletons(savva)).toHaveLength(3)
    expect(guard.locationId).toBe(home)
    expect(distance(guard.position, guardPost)).toBeLessThanOrEqual(
        navigation.grid.tileWidth
    )
}, 15_000)
