import type { WorldChestSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { chestActions } from './chestActions'

const chest = (
    id: string,
    x: number,
    state: 'closed' | 'open' = 'closed',
    itemCount = 2
): WorldChestSnapshot => ({ id, position: { x, y: 0 }, state, itemCount })
describe('nearby chest opening', () => {
    it('offers only the nearest visible chest, including open and empty containers in shared reach', () => {
        const player = characterFixture('hero')
        const state = {
            ...worldFixture([player]),
            chests: [chest('hidden', 3), chest('far', 37), chest('near', 20), chest('edge', 36)],
        }
        const actions = chestActions(state, player, (position) => position.x !== 3)
        expect(actions.map((action) => action.command)).toEqual([
            { type: 'open_chest', chestId: 'near' },
        ])
        state.chests = [chest('edge', 36)]
        expect(chestActions(state, player)).toHaveLength(1)
        state.chests[0]!.state = 'open'
        expect(chestActions(state, player)[0]?.command).toEqual({
            type: 'open_chest',
            chestId: 'edge',
        })
        state.chests = [chest('empty', 10, 'closed', 0)]
        expect(chestActions(state, player)[0]?.command).toEqual({
            type: 'open_chest',
            chestId: 'empty',
        })
        player.alive = false
        expect(chestActions(state, player)).toEqual([])
    })
})
