import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { attackableTarget, relation } from './combatTargeting'

it('keeps the peaceful training construct attackable without changing its social relation', () => {
    const player = characterFixture('hero')
    const target = characterFixture('dummy', {
        trainingTarget: { areaId: 'yard' },
        creatureType: 'construct',
    })
    expect(relation(target, player)).toBe('friendly')
    expect(attackableTarget(target, player)).toBe(true)
})
