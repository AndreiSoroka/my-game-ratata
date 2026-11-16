import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import {
    recordMartyrHostileDamage,
    recordMartyrPrayer,
    recordMartyrRecovery,
    resetMartyrStreak,
} from '../src/game/martyr'
import { abilityHero } from './abilityTestHelpers'

function cycle(actor: GameCharacter, receiptId: string, levelBefore = 2) {
    recordMartyrHostileDamage(actor, 1, 1000)
    return recordMartyrPrayer(
        actor,
        { selfHealed: 1, otherMeaningful: false, receiptId, levelBefore },
        2000
    )
}

describe('Martyr useful hostile wound and Mother self-healing sequence', () => {
    it('opens the free special star on the fifth cycle before the level-two action awards XP', () => {
        const actor = abilityHero()
        const before = structuredClone(actor.progression.masteries)
        for (let index = 0; index < 4; index += 1) {
            expect(cycle(actor, `cast-${String(index)}`)).toEqual([])
        }
        const events = cycle(actor, 'cast-4')
        expect(events).toEqual([
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
                text: 'Открыта звезда: Мученик.',
            },
        ])
        expect(
            actor.progression.constellations.opened.has('prayer.martyr')
        ).toBe(true)
        expect(actor.progression.masteries).toEqual(before)
        expect(actor.progression.constellations.credits.prayer).toBe(0)
        actor.progression.masteries.prayer.level = 3
        expect(cycle(actor, 'later', 3)).toEqual([])
    })

    it('accepts levels zero through two but rejects a cycle that starts at level three', () => {
        const actor = abilityHero()
        cycle(actor, 'zero', 0)
        cycle(actor, 'one', 1)
        cycle(actor, 'two', 2)
        expect(actor.martyr.cycles).toBe(3)
        cycle(actor, 'three', 3)
        expect(actor.martyr.cycles).toBe(0)
        expect(
            actor.progression.constellations.opened.has('prayer.martyr')
        ).toBe(false)
    })

    it('does not multiply one pending cycle by repeated incoming hits or repeated self-heals', () => {
        const actor = abilityHero()
        recordMartyrHostileDamage(actor, 1, 1)
        recordMartyrHostileDamage(actor, 3, 2)
        recordMartyrHostileDamage(actor, 5, 3)
        recordMartyrPrayer(
            actor,
            {
                selfHealed: 0.1,
                otherMeaningful: false,
                receiptId: 'first',
                levelBefore: 1,
            },
            4
        )
        recordMartyrPrayer(
            actor,
            {
                selfHealed: 4,
                otherMeaningful: false,
                receiptId: 'second',
                levelBefore: 1,
            },
            5
        )
        expect(actor.martyr.cycles).toBe(1)
        expect(actor.martyr.pendingHostileWound).toBe(false)
    })

    it('deduplicates actual cast receipts, including replay after a new wound or reset', () => {
        const actor = abilityHero()
        cycle(actor, 'same')
        cycle(actor, 'same')
        expect(actor.martyr.cycles).toBe(1)
        expect(actor.martyr.pendingHostileWound).toBe(true)
        resetMartyrStreak(actor)
        cycle(actor, 'same')
        expect(actor.martyr.cycles).toBe(0)
        cycle(actor, 'fresh')
        expect(actor.martyr.cycles).toBe(1)
    })

    it('ignores misses and refusal but resets on an actual other meaningful outcome', () => {
        const actor = abilityHero()
        cycle(actor, 'first')
        recordMartyrHostileDamage(actor, 1, 1)
        recordMartyrPrayer(
            actor,
            {
                selfHealed: 0,
                otherMeaningful: false,
                receiptId: 'refused',
                levelBefore: 1,
            },
            2
        )
        expect(actor.martyr.cycles).toBe(1)
        expect(actor.martyr.pendingHostileWound).toBe(true)
        recordMartyrPrayer(
            actor,
            {
                selfHealed: 1,
                otherMeaningful: true,
                receiptId: 'also-helped-another',
                levelBefore: 1,
            },
            3
        )
        expect(actor.martyr.cycles).toBe(0)
        expect(actor.martyr.pendingHostileWound).toBe(false)
    })
})

describe('Martyr wound provenance and identity', () => {
    it('expires an externally closed wound without counting a cycle or erasing earlier cycles', () => {
        const actor = abilityHero()
        cycle(actor, 'first')
        recordMartyrHostileDamage(actor, 1, 1)
        actor.progression.constellations.hostileWound = 0
        recordMartyrRecovery(actor, 'other-healer')
        expect(actor.martyr.cycles).toBe(1)
        expect(actor.martyr.pendingHostileWound).toBe(false)
        recordMartyrHostileDamage(actor, 1, 2)
        recordMartyrRecovery(actor)
        expect(actor.martyr.pendingHostileWound).toBe(false)
    })

    it('preserves a completed own self-heal until the cast outcome can count its cycle', () => {
        const actor = abilityHero()
        recordMartyrHostileDamage(actor, 1, 1)
        actor.progression.constellations.hostileWound = 0
        recordMartyrRecovery(actor, actor.id)
        recordMartyrPrayer(
            actor,
            {
                selfHealed: 1,
                otherMeaningful: false,
                receiptId: 'own',
                levelBefore: 1,
            },
            2
        )
        expect(actor.martyr.cycles).toBe(1)
    })

    it('excludes zero damage, invalid values, dead, offline, retired and training identities', () => {
        const actor = abilityHero()
        for (const amount of [0, -1, Number.NaN, Infinity]) {
            recordMartyrHostileDamage(actor, amount, 1)
        }
        expect(actor.martyr.pendingHostileWound).toBe(false)
        for (const tag of ['offline', 'state.retired']) {
            actor.tags.add(tag)
            expect(cycle(actor, tag)).toEqual([])
            actor.tags.delete(tag)
        }
        actor.alive = false
        expect(cycle(actor, 'dead')).toEqual([])
        const target = new GameCharacter({
            id: 'dummy',
            nickname: 'dummy',
            archetype: 'human',
            heroClass: 'cleric',
            controllerKind: 'scripted',
            trainingTarget: { areaId: 'test' },
            spawnPosition: { x: 0, y: 0 },
        })
        expect(cycle(target, 'dummy')).toEqual([])
        expect(target.martyr.cycles).toBe(0)
    })

    it('resets unfinished progress on temporary death and gives a fresh identity no trait or receipts', () => {
        const actor = abilityHero()
        cycle(actor, 'unfinished')
        actor.applyDamage(actor.hp, 10)
        expect(actor.martyr.cycles).toBe(0)
        expect(actor.martyr.pendingHostileWound).toBe(false)
        const fresh = abilityHero()
        expect(fresh.martyr.receipts.size).toBe(0)
        expect(
            fresh.progression.constellations.opened.has('prayer.martyr')
        ).toBe(false)
    })
})
