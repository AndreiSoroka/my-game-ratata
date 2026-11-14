import assert from 'node:assert/strict'
import test from 'node:test'

import { createPondDrinkingAreas } from './generate-pond-interactions.mjs'
import { SMALL_POND_MAX_CELLS } from './generate-world-settings.mjs'

function pond(cells, settings) {
    const width = cells + 2
    const terrain = Array(width * 3).fill(0)
    terrain.fill(110, width + 1, width + cells + 1)
    return { width, height: 3, terrain, settings }
}

test('default pond threshold includes exactly 64 cells and excludes 65', () => {
    assert.equal(SMALL_POND_MAX_CELLS, 64)
    const atLimit = createPondDrinkingAreas(pond(64), () => true)
    assert.equal(atLimit.length, 1)
    assert.deepEqual(atLimit[0].interactionAreas, [
        { x: 16, y: 16, width: 64 * 16, height: 16 },
    ])
    assert.deepEqual(
        createPondDrinkingAreas(pond(65), () => true),
        []
    )
})

test('generator context configures classification without changing pond identity or geometry', () => {
    const settings = { smallPondMaxCells: 8 }
    const standard = createPondDrinkingAreas(pond(8), () => true)
    assert.deepEqual(
        createPondDrinkingAreas(pond(8, settings), () => true),
        standard
    )
    assert.deepEqual(
        createPondDrinkingAreas(pond(9, settings), () => true),
        []
    )
    assert.equal(createPondDrinkingAreas(pond(9), () => true).length, 1)
    assert.deepEqual(
        createPondDrinkingAreas(pond(8, settings), () => false),
        []
    )
})

test('invalid thresholds cannot emit unsupported runtime geometry', () => {
    for (const smallPondMaxCells of [0, -1, 1.5, 65, Infinity, NaN]) {
        assert.throws(
            () =>
                createPondDrinkingAreas(
                    pond(8, { smallPondMaxCells }),
                    () => true
                ),
            /smallPondMaxCells must be between/
        )
    }
})
