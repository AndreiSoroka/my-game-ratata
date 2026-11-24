import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { characterAt } from './runtimeCharacterTargets'
import {
    runtimeCanSelect,
    type RuntimeSelectionContext,
    runtimeSelectionVisible,
} from './runtimeSelection'

describe('rendered character targeting', () => {
    it('hits the rendered body instead of an old server coordinate without changing authority', () => {
        const actor = characterFixture('npc', { position: { x: 50, y: 50 } })
        const snapshot = worldFixture([actor])
        const position = () => ({ x: 90, y: 50 })
        expect(characterAt(snapshot, undefined, { x: 95, y: 50 }, () => true, position)).toBe('npc')
        expect(
            characterAt(snapshot, undefined, { x: 45, y: 50 }, () => true, position)
        ).toBeUndefined()
        expect(
            characterAt(snapshot, undefined, { x: 95, y: 50 }, () => false, position)
        ).toBeUndefined()
        expect(actor.position).toEqual({ x: 50, y: 50 })
    })
    it('selects the nearest painted body in depth when sprites overlap', () => {
        const rear = characterFixture('rear', { position: { x: 64, y: 64 } })
        const front = characterFixture('front', { position: { x: 64, y: 80 } })
        const snapshot = worldFixture([rear, front])
        const point = { x: 64, y: 52 }

        expect(characterAt(snapshot, undefined, point, () => true)).toBe('front')
        expect(characterAt(snapshot, undefined, point, (id) => id !== 'front')).toBe('rear')
        expect(characterAt(snapshot, 'front', point, () => true)).toBe('rear')
        expect(characterAt(snapshot, undefined, { x: 82, y: 64 }, () => true)).toBeUndefined()
    })
    it('uses the rendered position for viewport intersection while range remains server-owned', () => {
        const player = characterFixture('self', { position: { x: 80, y: 80 } })
        const npc = characterFixture('npc', { position: { x: 110, y: 80 } })
        const context: RuntimeSelectionContext = {
            snapshot: worldFixture([player, npc]),
            playerId: 'self',
            tileSize: 16,
            viewport: { left: 0, top: 0, right: 90, bottom: 100 },
            positionVisible: () => true,
            characterVisible: () => true,
            characterPosition: () => ({ x: 85, y: 80 }),
        }
        const target = {
            key: 'character:npc',
            kind: 'character' as const,
            id: 'npc',
            position: npc.position,
            name: npc.nickname,
            character: npc,
        }
        expect(runtimeSelectionVisible(target, context)).toBe(true)
        expect(runtimeCanSelect(target.key, context)).toBe(true)
        npc.position = { x: 1000, y: 80 }
        expect(runtimeCanSelect(target.key, context)).toBe(false)
    })
})
