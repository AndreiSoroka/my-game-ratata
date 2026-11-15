import { expect, it } from 'vitest'

import { constellationDistance } from './constellationDistance'

it('displays world pixels and cell bonuses in the supplied map cell size', () => {
    expect(constellationDistance(48, 0, 16)).toBe('3 клетки')
    expect(constellationDistance(48, 1, 16)).toBe('4 клетки')
    expect(constellationDistance(48, 2, 16)).toBe('5 клеток')
    expect(constellationDistance(48, 2, 24)).toBe('4 клетки')
    expect(constellationDistance(24, 0, 24)).toBe('1 клетка')
    expect(constellationDistance(80, 1, 24)).toBe('4,33 клетки')
    expect(constellationDistance(28, 0, 16)).toBe('1,75 клетки')
})

it('keeps unknown map geometry explicit instead of assuming a cell size', () => {
    for (const tileWidth of [undefined, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(constellationDistance(64, 2, tileWidth)).toBe('64 px + 2 клетки')
        expect(constellationDistance(48, 0, tileWidth)).toBe('48 px')
    }
})
