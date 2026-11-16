import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
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
it('preserves three remaining failure seconds through fleeing and conversation pauses', () => {
    const f = scenarioFixture()
    f.start({
        ...definition([{ id: 'search', kind: 'search', target: 'stone' }]),
        threat: 'flee',
    })
    f.tick(140)
    expect(f.snapshot().run?.remainingFailureMs).toBe(3000)
    const enemy = new GameCharacter({
        id: 'enemy',
        nickname: 'Враг',
        archetype: 'slime',
        controllerKind: 'mob1',
        locationId: CENTER_LOCATION_ID,
        spawnPosition: { x: 80, y: 24 },
    })
    f.setThreat(enemy)
    f.tick(300)
    expect(f.snapshot().run?.remainingFailureMs).toBe(3000)
    expect(f.snapshot().run?.interruption).toBe('enemy')
    f.setThreat(undefined)
    f.tick(20, true)
    expect(f.snapshot().run?.remainingFailureMs).toBe(3000)
    f.tick(59)
    expect(f.snapshot().run?.status).toBe('running')
    f.tick()
    expect(f.snapshot().run?.results[0]?.status).toBe('failed')
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
    expect(f.actor.equipment.weapon?.durability).toBe(997)
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
