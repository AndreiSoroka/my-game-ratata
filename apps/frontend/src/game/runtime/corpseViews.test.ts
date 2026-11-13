import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { visibleCorpses } from './corpseViews'

describe('corpse presentation survives character lifecycle', () => {
    it('keeps the animated dead character until removal, then renders its independent body', () => {
        const actor = characterFixture('fallen', { alive: false })
        const corpse = {
            id: 'corpse:fallen:1',
            kind: 'corpse' as const,
            itemCount: 1,
            state: 'closed' as const,
            position: actor.position,
            corpse: { characterId: actor.id, visualId: actor.visualId, facing: actor.facing },
        }
        expect(visibleCorpses([corpse], [actor])).toEqual([])
        expect(visibleCorpses([corpse], [])).toEqual([corpse])
        expect(visibleCorpses([corpse], [{ ...actor, alive: true }])).toEqual([corpse])
        expect(visibleCorpses([corpse], [{ ...actor, position: { x: 999, y: 999 } }])).toEqual([
            corpse,
        ])
        expect(visibleCorpses([], [actor])).toEqual([])
    })
})
