import { THEFT_RULES } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { interactionRangeText } from '../src/game/interactionRangeText'
import { theftFixture } from './theftFixtures'

it('expresses interaction thresholds using the current width and a Russian cell count', () => {
    expect(interactionRangeText(48, 16)).toBe('на расстоянии до 3 клеток')
    expect(interactionRangeText(64, 16)).toBe('на расстоянии до 4 клеток')
    expect(interactionRangeText(24, 24)).toBe('на расстоянии до 1 клетки')
    expect(interactionRangeText(64, 24)).toBe('на расстоянии до 2,67 клетки')
    expect(interactionRangeText(48)).toBe('поблизости')
})

it.each([
    { tileWidth: 16, label: '1,75 клетки' },
    { tileWidth: 24, label: '1,17 клетки' },
])(
    'keeps theft reach in world pixels on a $tileWidth px map',
    ({ tileWidth, label }) => {
        const { actor, victim, attempt } = theftFixture(tileWidth)
        victim.position.x = actor.position.x + THEFT_RULES.range + 0.01
        expect(attempt()[0]?.text).toContain(`до ${label}`)
        expect(victim.inventory).toHaveLength(1)

        victim.position.x = actor.position.x + THEFT_RULES.range
        attempt()
        expect(actor.inventory).toHaveLength(1)
        expect(victim.inventory).toHaveLength(0)
    }
)
