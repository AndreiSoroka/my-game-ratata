import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

describe('ground stack selection', () => {
    it('shows the selected stack quantity and keeps exact pickup identity', () => {
        const player = characterFixture('self')
        const snapshot = worldFixture([player])
        snapshot.items = [
            { id: 'map-2-2:herbs-9', itemId: 'herbs', quantity: 9, position: { x: 0, y: 16 } },
        ]
        const target = nearbyInteractionTarget(snapshot, player, [])
        expect(target?.name).toBe('Лечебные травы × 9')
        expect(target?.actions[0]?.label).toBe('Подобрать: Лечебные травы × 9')
        expect(target?.actions[0]?.command).toEqual({
            type: 'pickup_item',
            worldItemId: 'map-2-2:herbs-9',
        })
    })
})
