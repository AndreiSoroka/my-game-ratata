import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import {
    runtimeCanSelect,
    type RuntimeSelectionContext,
    runtimeSelectionVisible,
} from './runtimeSelection'

function context(): RuntimeSelectionContext {
    const player = characterFixture('self', { position: { x: 100, y: 100 } })
    return {
        playerId: player.id,
        snapshot: worldFixture([
            player,
            characterFixture('near', { position: { x: 140, y: 100 } }),
            characterFixture('far', { position: { x: 400, y: 100 } }),
        ]),
        tileSize: 16,
        viewport: { left: 0, top: 0, right: 500, bottom: 300 },
        characterVisible: () => true,
        positionVisible: () => true,
    }
}

describe('runtime selection shared by pointer and UI', () => {
    it('requires range, the camera viewport and roof visibility together', () => {
        const state = context()
        expect(runtimeCanSelect('character:near', state)).toBe(true)
        expect(runtimeCanSelect('character:far', state)).toBe(false)
        state.viewport = { left: 0, top: 0, right: 120, bottom: 300 }
        expect(runtimeCanSelect('character:near', state)).toBe(false)
        state.viewport.right = 500
        state.characterVisible = () => false
        expect(runtimeCanSelect('character:near', state)).toBe(false)
        state.characterVisible = () => true
        state.viewport = undefined
        expect(runtimeCanSelect('character:near', state)).toBe(false)
    })
    it('requires one compound surface to be both on-screen and unobscured', () => {
        const state = context()
        state.positionVisible = (point) => point.x > 500
        const target = {
            key: 'world:pond',
            id: 'pond',
            kind: 'world' as const,
            name: 'Пруд',
            position: { x: 200, y: 100 },
            interactionAreas: [
                { x: 190, y: 90, width: 16, height: 16 },
                { x: 590, y: 90, width: 16, height: 16 },
            ],
        }
        expect(runtimeSelectionVisible(target, state)).toBe(false)
        state.positionVisible = () => true
        expect(runtimeSelectionVisible(target, state)).toBe(true)
    })
})
