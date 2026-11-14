import {
    CENTER_LOCATION_ID,
    type ScenarioStep,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { addInventoryItems, createItemInstance } from '../src/game/inventory'
import type { GameRoom } from '../src/game/room'
import { executeScenarioStep } from '../src/game/scenarioActions'
import { createScenarioRun } from '../src/game/scenarioState'
import { definition, scenarioFixture } from './scenarioTestHelpers'

it('binds explicit visible targets to their authored location when saving', () => {
    const f = scenarioFixture()
    const steps: ScenarioStep[] = [
        {
            id: 'chest',
            kind: 'go',
            destination: {
                kind: 'visible',
                target: 'chest',
                targetId: 'chest_forest_1',
            },
        },
        {
            id: 'put',
            kind: 'deposit',
            chestId: 'chest_forest_1',
            mode: 'all',
            itemIds: [],
        },
        { id: 'nearest', kind: 'deposit', mode: 'all', itemIds: [] },
    ]
    expect(
        f.command({ type: 'scenario_save', scenario: definition(steps) })
    ).toBeNull()
    const saved = f.snapshot().scenarios[0]
    expect(saved?.steps[0]).toMatchObject({
        destination: { locationId: CENTER_LOCATION_ID },
    })
    expect(saved?.steps[1]).toMatchObject({ locationId: CENTER_LOCATION_ID })
    expect(saved?.steps[2]).not.toHaveProperty('locationId')
})

it('never replaces a pinned chest with an equal ID in another location', () => {
    const f = scenarioFixture()
    addInventoryItems(f.actor.inventory, [createItemInstance('wood')])
    const steps: ScenarioStep[] = [
        {
            id: 'walk',
            kind: 'go',
            destination: {
                kind: 'visible',
                target: 'chest',
                targetId: 'chest_forest_1',
                locationId: CENTER_LOCATION_ID,
            },
        },
        {
            id: 'put',
            kind: 'deposit',
            chestId: 'chest_forest_1',
            locationId: CENTER_LOCATION_ID,
            mode: 'all',
            itemIds: [],
        },
    ]
    const scenario = definition(steps)
    const run = createScenarioRun(f.actor, f.actor.id, scenario, 1000)
    f.actor.locationId = 'map-2-1'
    const room = {
        scenarioEnvironment() {
            throw new Error('Another location container must not be selected')
        },
    } as unknown as GameRoom
    for (const step of steps) {
        expect(
            executeScenarioStep(f.actor, run, room, step, 1050, 50)
        ).toMatchObject({ state: 'blocked' })
    }
    expect(f.actor.inventory).toHaveLength(1)
    expect(f.events).toEqual([])
})
