import {
    CENTER_LOCATION_ID,
    FARM_GROW_MS,
    FARM_PLOTS,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
} from '../src/game/inventory'
import { definition, scenarioFixture } from './scenarioTestHelpers'

it('casts a learned self ability through the ordinary handler and spends real mana', () => {
    const f = scenarioFixture()
    f.actor.abilities.known.add('barrier')
    const manaBefore = f.actor.mana
    f.start(
        definition([
            {
                id: 'barrier',
                kind: 'cast',
                abilityId: 'barrier',
                target: 'self',
            },
        ])
    )
    f.tick()
    expect(f.snapshot().run?.results[0]?.status).toBe('succeeded')
    expect(f.actor.mana).toBeLessThan(manaBefore)
    expect(f.events).toContainEqual(
        expect.objectContaining({ kind: 'status', statusId: 'barrier' })
    )
})

it('starts the ordinary grave prayer with the caster as its restoration target', () => {
    const f = scenarioFixture()
    f.actor.lich = true
    f.actor.hp -= 10
    f.actor.abilities.known.add('pray_grave')
    f.start(
        definition([
            {
                id: 'prayer',
                kind: 'cast',
                abilityId: 'pray_grave',
                target: 'self',
            },
        ])
    )
    f.tick()
    expect(f.actor.abilities.casting).toMatchObject({
        abilityId: 'pray_grave',
        targetId: f.actor.id,
        intent: { mode: 'restore' },
    })
    expect(f.events).toContainEqual(
        expect.objectContaining({
            kind: 'cast',
            abilityId: 'pray_grave',
            phase: 'started',
        })
    )
})

it('dashes only via the regular energy-costed dash action and approaches the real destination', () => {
    const f = scenarioFixture()
    const energyBefore = f.actor.energy
    f.start(
        definition([
            {
                id: 'move',
                kind: 'go',
                dash: true,
                destination: {
                    kind: 'point',
                    locationId: CENTER_LOCATION_ID,
                    position: { x: 152, y: 24 },
                },
            },
        ])
    )
    f.tick()
    expect(f.actor.energy).toBeLessThan(energyBefore)
    expect(f.events.filter((event) => event.kind === 'dash')).toHaveLength(1)
    f.tick(200)
    expect(f.actor.position.x).toBeCloseTo(152, 0)
    expect(f.events.filter((event) => event.kind === 'dash')).toHaveLength(1)
})

it('walks a route with a turn before the full dash could finish', () => {
    const f = scenarioFixture()
    f.start(
        definition([
            {
                id: 'move',
                kind: 'go',
                dash: true,
                destination: {
                    kind: 'point',
                    locationId: CENTER_LOCATION_ID,
                    position: { x: 104, y: 104 },
                },
            },
        ])
    )
    f.tick(200)
    expect(f.actor.position).toEqual({ x: 104, y: 104 })
    expect(f.events.filter((event) => event.kind === 'dash')).toHaveLength(0)
})

it('sows once, skips planted wheat and harvests through the shared plot service', () => {
    const f = scenarioFixture([], 64, 64)
    const plot = FARM_PLOTS.find(
        (candidate) => candidate.initiallyRipe !== true
    )
    if (plot === undefined) {
        throw new Error('Missing authored bare plot')
    }
    f.actor.locationId = plot.locationId
    f.actor.position = { ...plot.position }
    addInventoryItems(f.actor.inventory, [createItemInstance('wheat_seed', 2)])
    const reference = { plotId: plot.id, locationId: plot.locationId }
    f.start({
        ...definition([
            { id: 'sow', kind: 'farm', action: 'sow', ...reference },
        ]),
        repeat: null,
        sequences: [
            {
                id: 'crop',
                name: 'Crop',
                steps: [
                    {
                        id: 'harvest',
                        kind: 'farm',
                        action: 'harvest',
                        ...reference,
                    },
                ],
            },
        ],
        reactions: [
            {
                id: 'ripe',
                sequenceId: 'crop',
                trigger: { kind: 'plot_ripe', ...reference },
            },
        ],
    })
    f.tick()
    expect(f.snapshot().run?.results[0]?.status).toBe('succeeded')
    expect(countInventoryItem(f.actor.inventory, 'wheat_seed')).toBe(1)
    f.tick(100)
    expect(f.snapshot().run?.results[0]?.status).toBe('skipped')
    f.tick(FARM_GROW_MS / 50 - 100)
    expect(
        f.events.filter((event) => event.kind === 'farm_harvest')
    ).toHaveLength(1)
    expect(countInventoryItem(f.actor.inventory, 'grain')).toBeGreaterThan(0)
})
