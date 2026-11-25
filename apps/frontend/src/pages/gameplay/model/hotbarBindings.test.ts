import { describe, expect, it } from 'vitest'

import { characterFixture } from '../../../game/testing/characterFixture'
import { prayerDescription } from './hotbarBindings'

describe('pinned prayer description', () => {
    it('discloses collateral targets even when the primary intent restores or revives an ally', () => {
        const player = characterFixture('self'),
            ally = characterFixture('ally', { nickname: 'Вера' })
        const text = prayerDescription(
            {
                intent: { mode: 'revive', targetId: ally.id },
                manaCost: 20,
                harmfulTargets: 3,
                includesAllies: true,
                includesSelf: true,
                unavailableReason: null,
            },
            [player, ally],
            player
        )
        expect(text).toContain('Воскресить Вера · 20 MP')
        expect(text).toContain('Волна: 3 целей, включая союзников, включая вас')
    })
})
