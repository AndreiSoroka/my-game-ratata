import type { FarmPlotSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { farmAction } from './nearbyMaterialActions'

const plot: FarmPlotSnapshot = {
    id: 'bed',
    name: 'Пшеница',
    crop: 'wheat',
    locationId: 'map-2-1',
    position: { x: 100, y: 100 },
    phase: 'bare',
    readyAt: 0,
}

describe('wheat sowing requirements', () => {
    it('shows the seed cost and explains why an empty backpack cannot sow', () => {
        const action = farmAction(plot, characterFixture('hero'), 0)
        expect(action.disabled).toBe(true)
        expect(action.label).toContain('1 семя · 5 EN')
        expect(action.label).toContain('в рюкзаке: 0 · нет семян')
    })

    it('counts real seed quantities without treating grain as seeds', () => {
        const player = characterFixture('hero', {
            inventory: [
                { instanceId: 'grain', itemId: 'grain', quantity: 9 },
                { instanceId: 'seed-a', itemId: 'wheat_seed', quantity: 9 },
                { instanceId: 'seed-b', itemId: 'wheat_seed' },
            ],
        })
        const action = farmAction(plot, player, 0)
        expect(action.disabled).toBe(false)
        expect(action.label).toContain('в рюкзаке: 10')
        player.inventory = player.inventory.filter((item) => item.itemId === 'grain')
        expect(farmAction(plot, player, 0).disabled).toBe(true)
    })

    it('uses private server affordability hints with a full-looking resource bar', () => {
        const player = characterFixture('hero', {
            inventory: [{ instanceId: 'seed', itemId: 'wheat_seed' }],
        })
        player.resourceChecks!.sow = 'energy'
        expect(farmAction(plot, player, 0)).toMatchObject({ disabled: true })
        expect(farmAction(plot, player, 0).label).toContain('недостаточно сил')
        player.resourceChecks = undefined
        expect(farmAction(plot, player, 0).label).toContain('нет данных о силах')
    })

    it('keeps harvesting available without seeds and a growing crop unavailable', () => {
        const player = characterFixture('hero')
        expect(farmAction({ ...plot, phase: 'ripe' }, player, 0)).toMatchObject({
            disabled: false,
            command: { type: 'farm_action', plotId: plot.id, action: 'harvest' },
        })
        expect(farmAction({ ...plot, phase: 'growing', readyAt: 1000 }, player, 0)).toMatchObject({
            disabled: true,
            label: 'Пшеница растёт · 1 сек.',
        })
    })
})
