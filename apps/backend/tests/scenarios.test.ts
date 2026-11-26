import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { snapshotControl } from '../src/game/characterControl'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
} from '../src/game/inventory'
import { definition, scenarioFixture, treeNode } from './scenarioTestHelpers'

it('searches without walking, marks an impossible stage and advances after ten seconds', () => {
    const f = scenarioFixture()
    f.start(
        definition([
            { id: 'search', kind: 'search', target: 'stone' },
            { id: 'wait', kind: 'wait', durationMs: 0 },
        ])
    )
    f.tick(199)
    expect(f.snapshot().run?.stepIndex).toBe(0)
    expect(f.actor.position).toEqual({ x: 24, y: 24 })
    f.tick(2)
    expect(f.snapshot().run?.status).toBe('completed')
    expect(f.snapshot().run?.results[0]).toMatchObject({
        status: 'failed',
        failures: 1,
    })
})
it('preserves three remaining failure seconds through conversation pauses', () => {
    const f = scenarioFixture()
    f.start(definition([{ id: 'search', kind: 'search', target: 'stone' }]))
    f.tick(140)
    expect(f.snapshot().run?.remainingFailureMs).toBe(3000)
    f.tick(300, true)
    expect(f.snapshot().run?.remainingFailureMs).toBe(3000)
    expect(f.snapshot().run?.interruption).toBe('conversation')
    f.tick(59)
    expect(f.snapshot().run?.status).toBe('running')
    f.tick()
    expect(f.snapshot().run?.results[0]?.status).toBe('failed')
})

it('keeps a five-second listening window and prevents stop/start from opening a new pass early', () => {
    const f = scenarioFixture()
    f.start(definition([{ id: 'ready', kind: 'wait', durationMs: 0 }]))
    f.tick()
    expect(f.snapshot().run).toMatchObject({
        phase: 'between_passes',
        nextPassAt: 6000,
    })
    f.command({ type: 'scenario_stop' })
    f.command({ type: 'scenario_start', scenarioId: 'test' })
    f.tick(98)
    expect(f.snapshot().run?.results[0]?.status).toBe('pending')
    f.tick()
    expect(f.snapshot().run).toMatchObject({
        status: 'running',
        nextPassAt: 11000,
    })
    expect(f.snapshot().run?.results[0]?.status).toBe('succeeded')
    f.tick(100)
    expect(f.snapshot().run?.status).toBe('completed')
})

it('picks one ordered reaction, aborts the main work and rearms only on the next pass', () => {
    const f = scenarioFixture()
    f.start({
        ...definition([
            { id: 'ready', kind: 'wait', durationMs: 0 },
            { id: 'work', kind: 'wait', durationMs: 10_000 },
        ]),
        repeat: null,
        sequences: [
            {
                id: 'leave',
                name: 'Leave',
                steps: [{ id: 'stop', kind: 'wait', durationMs: 300 }],
            },
        ],
        reactions: [
            {
                id: 'wolf',
                trigger: { kind: 'enemy_visible', distanceTiles: 5 },
                sequenceId: 'leave',
                notification: 'wolf',
            },
            {
                id: 'ready-result',
                trigger: {
                    kind: 'step_result',
                    stepId: 'ready',
                    status: 'succeeded',
                },
                sequenceId: 'leave',
                notification: 'ready',
            },
        ],
    })
    f.tick()
    f.setThreat(
        new GameCharacter({
            id: 'enemy',
            nickname: 'Enemy',
            archetype: 'slime',
            controllerKind: 'mob1',
            spawnPosition: { x: 68, y: 24 },
        })
    )
    f.tick()
    expect(f.snapshot().run).toMatchObject({
        phase: 'reaction',
        reactionId: 'wolf',
    })
    expect(f.snapshot().run?.results.map((result) => result.status)).toEqual([
        'succeeded',
        'skipped',
        'running',
    ])
    f.tick(5)
    expect(f.snapshot().run?.results[2]?.status).toBe('running')
    f.tick()
    expect(f.snapshot().run?.results[2]?.status).toBe('succeeded')
    f.tick(91)
    expect(
        f.events
            .filter((event) => event.kind === 'notice')
            .map((event) => event.text)
    ).toEqual(['wolf'])
    f.tick()
    expect(
        f.events
            .filter((event) => event.kind === 'notice')
            .map((event) => event.text)
    ).toEqual(['wolf', 'wolf'])
})

it('arms checks after the delay and ignores earlier observations and step results', () => {
    const f = scenarioFixture()
    const enemy = new GameCharacter({
        id: 'enemy',
        nickname: 'Enemy',
        archetype: 'slime',
        controllerKind: 'mob1',
        spawnPosition: { x: 68, y: 24 },
    })
    f.setThreat(enemy)
    f.start({
        ...definition([{ id: 'early', kind: 'wait', durationMs: 0 }]),
        sequences: [
            {
                id: 'leave',
                name: 'Leave',
                steps: [{ id: 'wait', kind: 'wait', durationMs: 0 }],
            },
        ],
        reactions: [
            {
                id: 'reaction',
                sequenceId: 'leave',
                delayMs: 1000,
                trigger: { kind: 'enemy_visible', distanceTiles: 5 },
            },
            {
                id: 'early-result',
                sequenceId: 'leave',
                delayMs: 1000,
                trigger: {
                    kind: 'step_result',
                    stepId: 'early',
                    status: 'succeeded',
                },
            },
        ],
    })
    f.tick(19)
    expect(f.snapshot().run?.results).toHaveLength(1)
    f.setThreat(undefined)
    f.tick()
    expect(f.snapshot().run?.results).toHaveLength(1)
    f.setThreat(enemy)
    f.tick()
    expect(f.snapshot().run?.results).toHaveLength(2)
    expect(f.snapshot().run?.results[1]?.status).toBe('succeeded')
})

it('keeps the same validated follow action through the listening window and cancels it on pause', () => {
    const f = scenarioFixture()
    const friendly = new GameCharacter({
        id: 'friendly',
        nickname: 'Friendly',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 100, y: 24 },
    })
    f.characters.set(friendly.id, friendly)
    f.start({
        ...definition([{ id: 'work', kind: 'wait', durationMs: 10_000 }]),
        sequences: [
            {
                id: 'meet',
                name: 'Meet',
                steps: [
                    { id: 'follow', kind: 'follow', target: 'reaction_target' },
                ],
            },
        ],
        reactions: [
            {
                id: 'friend',
                sequenceId: 'meet',
                trigger: {
                    kind: 'friendly_nearby',
                    distanceTiles: 6,
                    onlyWhenNotFollowing: true,
                },
            },
        ],
    })
    f.tick()
    expect(snapshotControl(f.actor)).toMatchObject({
        mode: 'follow',
        targetId: friendly.id,
    })
    expect(f.snapshot().run?.phase).toBe('between_passes')
    f.tick(20)
    expect(f.actor.position.x).toBeGreaterThan(24)
    f.command({ type: 'scenario_pause' })
    expect(snapshotControl(f.actor)).toMatchObject({
        mode: 'none',
        targetId: null,
    })
    expect(f.actor.hasPath()).toBe(false)
})

it('does not replace a reaction target lost during a sequence with another visible friendly', () => {
    const f = scenarioFixture()
    const friend = new GameCharacter({
        id: 'friend',
        nickname: 'Friend',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 60, y: 24 },
    })
    const other = new GameCharacter({
        id: 'other',
        nickname: 'Other',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 80, y: 24 },
    })
    f.characters.set(friend.id, friend)
    f.characters.set(other.id, other)
    f.start({
        ...definition([]),
        sequences: [
            {
                id: 'meet',
                name: 'Meet',
                steps: [
                    { id: 'wait', kind: 'wait', durationMs: 100 },
                    { id: 'follow', kind: 'follow', target: 'reaction_target' },
                ],
            },
        ],
        reactions: [
            {
                id: 'friend',
                sequenceId: 'meet',
                trigger: { kind: 'friendly_nearby', distanceTiles: 6 },
            },
        ],
    })
    f.tick()
    friend.locationId = 'map-2-1'
    f.tick(3)
    expect(f.snapshot().run).toMatchObject({
        phase: 'reaction',
        reactionId: 'friend',
    })
    expect(snapshotControl(f.actor)).toMatchObject({
        mode: 'none',
        targetId: null,
    })
})
it('walks for longer than ten seconds without consuming its failure budget', () => {
    const f = scenarioFixture([], 100)
    f.start(
        definition([
            {
                id: 'walk',
                kind: 'go',
                destination: {
                    kind: 'point',
                    locationId: CENTER_LOCATION_ID,
                    position: { x: 1400, y: 24 },
                },
            },
        ])
    )
    f.tick(250)
    expect(f.snapshot().run?.status).toBe('running')
    expect(f.snapshot().run?.remainingFailureMs).toBeGreaterThan(9900)
    f.tick(500)
    expect(f.snapshot().run?.status).toBe('completed')
    expect(f.actor.position.x).toBeCloseTo(1400, 0)
})
it('harvests real wood and deposits only run-acquired items while preserving initial stocks', () => {
    const f = scenarioFixture([treeNode()])
    addInventoryItems(f.actor.inventory, [createItemInstance('wood')])
    f.start(
        definition([
            { id: 'chop', kind: 'gather', resource: 'wood', amount: 3 },
            {
                id: 'put',
                kind: 'deposit',
                mode: 'acquired',
                itemIds: ['wood'],
            },
        ])
    )
    f.tick(600)
    expect(f.snapshot().run?.status).toBe('completed')
    expect(f.adventure.resourceSnapshot(CENTER_LOCATION_ID)[0]?.remaining).toBe(
        5
    )
    expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
    expect(
        f.inventory.containers
            .snapshot(f.actor, 31000)
            ?.items.filter((item) => item.itemId === 'wood')
    ).toHaveLength(3)
    expect(f.actor.equipment.weapon?.durability).toBe(991)
    expect(
        f.events.filter((event) => event.kind === 'item_stash')
    ).toHaveLength(3)
})
it('splits earned units from an existing material stack without unloading old units', () => {
    const f = scenarioFixture([
        {
            id: 'herbs',
            kind: 'herbs',
            locationId: CENTER_LOCATION_ID,
            position: { x: 40, y: 40 },
            remaining: 3,
        },
    ])
    addInventoryItems(f.actor.inventory, [createItemInstance('herbs', 6)])
    f.start(
        definition([
            { id: 'gather', kind: 'gather', resource: 'herbs', amount: 1 },
            {
                id: 'put',
                kind: 'deposit',
                mode: 'acquired',
                itemIds: ['herbs'],
            },
        ])
    )
    f.tick(300)
    expect(f.snapshot().run?.status).toBe('completed')
    expect(countInventoryItem(f.actor.inventory, 'herbs')).toBe(6)
    expect(
        f.inventory.containers
            .snapshot(f.actor, 16000)
            ?.items.find((item) => item.itemId === 'herbs')?.quantity ?? 1
    ).toBe(1)
})
it('binds marker coordinates at start, preserves pause state, and keeps libraries private', () => {
    const f = scenarioFixture()
    f.command({ type: 'marker_create' })
    const id = f.snapshot().markers[0]?.id ?? 'missing'
    f.start(
        definition([
            {
                id: 'walk',
                kind: 'go',
                destination: { kind: 'marker', markerId: id },
            },
        ])
    )
    f.command({ type: 'marker_delete', markerId: id })
    f.command({ type: 'scenario_pause' })
    f.tick(300)
    expect(f.snapshot().run?.status).toBe('paused')
    f.command({ type: 'scenario_resume' })
    f.tick()
    expect(f.snapshot().run?.status).toBe('completed')
    const stranger = new GameCharacter({
        id: 'stranger',
        nickname: 'Другой',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 24, y: 24 },
    })
    expect(f.scenarios.snapshot(stranger, 16000).scenarios).toEqual([])
    expect(f.command({ type: 'scenario_start', scenarioId: 'test' })).toContain(
        'метка удалена'
    )
})
it('freezes death time and continues after resurrection, then forgets a retired identity', () => {
    const f = scenarioFixture()
    f.command({ type: 'marker_create' })
    f.start(definition([{ id: 'search', kind: 'search', target: 'stone' }]))
    f.tick(40)
    f.actor.alive = false
    f.tick(300)
    expect(f.snapshot().run?.remainingFailureMs).toBe(8000)
    f.actor.alive = true
    f.tick()
    expect(f.snapshot().run?.remainingFailureMs).toBe(7950)
    f.characters.delete(f.actor.id)
    f.tick()
    expect(f.snapshot().markers).toEqual([])
    expect(f.snapshot().run).toBeNull()
})
