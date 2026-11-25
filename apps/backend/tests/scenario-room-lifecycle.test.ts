import { afterEach, describe, expect, it, vi } from 'vitest'

import { countInventoryItem } from '../src/game/inventory'
import {
    joinScenarioRoom,
    nearbyScenarioPoint,
    openScenarioRoom,
    roomScenario,
    savedScenarioMarker,
    waitForScenario,
    walkToScenarioPoint,
} from './scenarioRoomHelpers'

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('ordinary resurrection preserves scenario progress', () => {
    it('continues after a shared prayer without repeating a successful gathering step', () => {
        const room = openScenarioRoom(),
            owner = joinScenarioRoom(room, 'Returning Gatherer')
        const nodes = room
            .adventureForWorkers()
            .resourceSnapshot(owner.actor.locationId)
            .filter((node) => node.kind === 'herbs')
        const herbPatch = nodes.find((node) => node.remaining > 0)
        if (herbPatch === undefined) {
            throw new Error('Missing authored herb source')
        }
        owner.actor.position = { ...herbPatch.position }
        const herbsBefore = new Map(
            nodes.map((node) => [node.id, node.remaining])
        )
        owner.send({ type: 'marker_create', name: 'This identity' })
        owner.save(
            roomScenario('gather-once', [
                { id: 'gather', kind: 'gather', resource: 'herbs', amount: 1 },
                { id: 'rest', kind: 'wait', durationMs: 2000 },
            ])
        )
        owner.send({ type: 'scenario_start', scenarioId: 'gather-once' })
        waitForScenario(() => owner.view().run?.stepIndex === 1, 30_000)
        const herbs = countInventoryItem(owner.actor.inventory, 'herbs')
        expect(herbs).toBeGreaterThan(0)
        const source = room
            .adventureForWorkers()
            .resourceSnapshot(owner.actor.locationId)
            .find(
                (node) =>
                    node.kind === 'herbs' &&
                    node.remaining < (herbsBefore.get(node.id) ?? 0)
            )
        if (source === undefined) {
            throw new Error('Gathering did not consume an authored herb source')
        }
        owner.actor.applyDamage(owner.actor.hp, Date.now())
        vi.advanceTimersByTime(5000)
        expect(owner.view().run).toMatchObject({
            stepIndex: 1,
            interruption: 'death',
        })
        const cleric = joinScenarioRoom(room, 'Rescuer', 'cleric')
        cleric.actor.position = { ...owner.actor.position }
        vi.spyOn(Math, 'random').mockReturnValue(0)
        cleric.send({
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'revive', targetId: owner.actor.id },
        })
        waitForScenario(() => owner.actor.alive, 5000)
        expect(room.getCharacter(owner.actor.id)).toBe(owner.actor)
        expect(owner.view().markers).toHaveLength(1)
        expect(owner.view().scenarios).toHaveLength(1)
        waitForScenario(() => owner.view().run?.status === 'completed', 4000)
        expect(owner.view().run?.results[0]).toMatchObject({
            status: 'succeeded',
            failures: 0,
        })
        expect(countInventoryItem(owner.actor.inventory, 'herbs')).toBe(herbs)
        expect(
            room
                .adventureForWorkers()
                .resourceSnapshot(owner.actor.locationId)
                .find((node) => node.id === source.id)?.remaining
        ).toBe(source.remaining)
        room.stop()
    }, 20_000)
})

describe('ordinary socket scenario identity lifecycle', () => {
    it('saves numbered markers, walks a real scenario after disconnect and reconnects the same running identity', () => {
        const room = openScenarioRoom(),
            first = joinScenarioRoom(room, 'Returning Walker')
        first.send({ type: 'marker_create', name: 'Home' })
        const home = savedScenarioMarker(first)
        const point = nearbyScenarioPoint(room, first.actor)
        walkToScenarioPoint(first, point)
        first.send({ type: 'marker_create', name: 'Turn' })
        const turn = savedScenarioMarker(first, 1)
        expect(first.view().markers.map((marker) => marker.number)).toEqual([
            1, 2,
        ])
        first.save(
            roomScenario(
                'walk-loop',
                [
                    {
                        id: 'home',
                        kind: 'go',
                        destination: { kind: 'marker', markerId: home.id },
                    },
                    { id: 'rest', kind: 'wait', durationMs: 1000 },
                    {
                        id: 'turn',
                        kind: 'go',
                        destination: { kind: 'marker', markerId: turn.id },
                    },
                ],
                null
            )
        )
        first.send({ type: 'scenario_start', scenarioId: 'walk-loop' })
        const before = { ...first.actor.position }
        room.handleClose(first.socket)
        expect(first.actor.soul).toMatchObject({
            kind: 'echo',
            controlSource: 'script',
        })
        expect(first.actor.connected).toBe(false)
        vi.advanceTimersByTime(500)
        expect(
            Math.hypot(
                first.actor.position.x - before.x,
                first.actor.position.y - before.y
            )
        ).toBeGreaterThan(10)
        expect(
            room
                .snapshot(Date.now(), first.actor.locationId)
                .characters.some((actor) => actor.id === first.actor.id)
        ).toBe(true)
        expect(first.view().run).toMatchObject({
            scenarioId: 'walk-loop',
            status: 'running',
        })
        const resumed = joinScenarioRoom(room, 'returning walker')
        expect(resumed.actor).toBe(first.actor)
        expect(resumed.actor.soul).toMatchObject({
            kind: 'spark',
            controlSource: 'human',
        })
        expect(resumed.view().run).toMatchObject({
            scenarioId: 'walk-loop',
            status: 'running',
        })
        expect(resumed.view().markers).toHaveLength(2)
        waitForScenario(() => (resumed.view().run?.iteration ?? 0) >= 2)
        room.stop()
    })

    it('forgets the retired identity library and never gives it to the same nickname in a new life', () => {
        const room = openScenarioRoom(),
            first = joinScenarioRoom(room, 'New Life')
        first.send({ type: 'marker_create', name: 'Old identity' })
        first.save(
            roomScenario(
                'old-task',
                [{ id: 'wait', kind: 'wait', durationMs: 10_000 }],
                null
            )
        )
        first.send({ type: 'scenario_start', scenarioId: 'old-task' })
        // Arrange a fallen body; retirement itself goes through the ordinary life command.
        first.actor.applyDamage(first.actor.hp, Date.now())
        first.send({ type: 'abandon_life' })
        vi.advanceTimersByTime(50)
        expect(room.getCharacter(first.actor.id)).toBeUndefined()
        const next = joinScenarioRoom(room, 'new life')
        expect(next.actor.id).not.toBe(first.actor.id)
        expect(next.view()).toMatchObject({
            markers: [],
            scenarios: [],
            run: null,
        })
        room.stop()
    })
})
