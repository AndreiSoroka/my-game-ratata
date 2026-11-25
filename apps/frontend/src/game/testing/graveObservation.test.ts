import { getWorldLocationDefinition } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { navigationGoal } from './agentNavigationTargets'
import { observeGame } from './agentObservation'
import { characterFixture, worldFixture } from './characterFixture'
import { graveFixture } from './graveFixture'
import type { RatataTestState } from './testInterface'

function fixture(): RatataTestState {
    const player = characterFixture('self', { position: { x: 100, y: 100 } })
    const location = {
        ...getWorldLocationDefinition('map-2-2')!,
        columns: 5,
        rows: 5,
        regionName: 'Test',
        map: {
            asset: { url: '/game/map/map1.json', revision: 'fixture' },
            id: 'map-2-2',
            width: 96,
            height: 80,
            tileWidth: 16,
            tileHeight: 16,
            worldWidth: 1536,
            worldHeight: 1280,
            solidLayerNames: [],
        },
    }
    return {
        connected: true,
        defeated: false,
        error: '',
        inventoryOpen: false,
        localPlayerId: player.id,
        location,
        notice: '',
        player,
        status: 'Connected',
        snapshot: {
            ...worldFixture([player]),
            location,
            graves: [graveFixture({ position: { x: 100, y: 132 } })],
        },
    }
}
describe('observed grave targets', () => {
    it('exposes received phase and fractional HP with executable typed commands and a navigable footprint', () => {
        const state = fixture()
        const observation = observeGame(state)
        const target = observation.targets.find((candidate) => candidate.kind === 'grave')!
        expect(target.details).toMatchObject({
            phase: 'active',
            health: { kind: 'exact', current: 99.75, max: 100 },
            material: 'stone',
        })
        expect(target.actions[0]?.command).toEqual({
            type: 'attack',
            target: { kind: 'grave', id: target.id },
        })
        expect(target.actions[1]?.command).toEqual({
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'purify_grave', target: { kind: 'grave', id: target.id } },
        })
        const goal = navigationGoal(
            state,
            { targetKey: target.key },
            undefined,
            observation.targets
        )!
        expect(goal.tolerance).toBe(40)
        expect(goal.candidates).toHaveLength(4)
        expect(goal.candidates[0]).toEqual({ x: 100, y: 116 })
    })
    it('retains a ruined source but removes purified or hidden sources, and disables disconnected actions', () => {
        const state = fixture()
        state.snapshot!.graves![0]!.phase = 'ruined'
        expect(observeGame(state).targets.find((target) => target.kind === 'grave')?.name).toBe(
            'Разрушенная могила'
        )
        state.connected = false
        expect(observeGame(state).targets[0]?.actions).toEqual([])
        expect(observeGame(state, { isPositionVisible: () => false }).targets).toEqual([])
        state.snapshot!.graves![0]!.phase = 'purified'
        expect(observeGame(state).targets).toEqual([])
    })
})
