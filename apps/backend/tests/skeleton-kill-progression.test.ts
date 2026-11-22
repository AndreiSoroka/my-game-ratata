import {
    MASTERY_XP_SCALE,
    masteryThreshold,
    masteryTotalExperience,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { GameCharacter } from '../src/game/character'
import { restoreCharacter } from '../src/game/characterRecovery'
import { abilityHero } from './abilityTestHelpers'
import { trainingCombatFixture } from './trainingCombatFixture'

function skeleton(id = 'skeleton:reward-test', spawnedAt = 0): GameCharacter {
    return new GameCharacter({
        id,
        nickname: 'Skeleton',
        archetype: 'skeleton',
        controllerKind: 'mob1',
        faction: 'monsters',
        spawnPosition: { x: 100, y: 100 },
        spawnedAt,
    })
}

function undeadExperience(actor: GameCharacter): bigint {
    const mastery = actor.progression.masteries.undead
    return masteryTotalExperience(mastery.level) + mastery.experience
}

function hit(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    amount = target.hp
) {
    return resolveCharacterDamage({
        actor,
        target,
        amount,
        now,
        damageKind: 'physical',
        respawnDelayMs: 15_000,
        random: () => 0.99,
    })
}

describe('skeleton rewards for resolved combat deaths', () => {
    it('counts distinct hostile victims once per life and rewards a harder victim and a longer streak', () => {
        const actor = skeleton()
        const novice = abilityHero('vanguard')
        const veteran = abilityHero('ranger')
        veteran.progression.masteries.arrow.level = 3
        const start = undeadExperience(actor)

        hit(actor, novice, 1000, 1)
        expect(undeadExperience(actor)).toBe(start)
        expect(hit(actor, novice, 1500).events).toContainEqual({
            kind: 'death',
            actorId: actor.id,
            targetId: novice.id,
        })
        const first = undeadExperience(actor)
        expect(first - start).toBe(100n * MASTERY_XP_SCALE)

        hit(actor, novice, 1600, 1)
        restoreCharacter(novice, 2000, false)
        hit(actor, novice, 2500)
        expect(undeadExperience(actor)).toBe(first)

        hit(actor, veteran, 61_500)
        const second = undeadExperience(actor)
        expect(second - first).toBe(287_500_000n)

        actor.applyDamage(actor.hp, 62_000)
        restoreCharacter(actor, 77_000, true)
        restoreCharacter(novice, 77_000, false)
        hit(actor, novice, 77_500)
        expect(undeadExperience(actor) - second).toBe(100n * MASTERY_XP_SCALE)
    })

    it.each(['respawn', 'resurrection'])(
        'counts time since spawn before the first kill and resets age on %s',
        (recovery) => {
            const actor = skeleton('skeleton:older', 1000)
            const start = undeadExperience(actor)
            hit(actor, abilityHero('vanguard'), 121_000)
            const afterFirstKill = undeadExperience(actor)
            expect(afterFirstKill - start).toBe(110n * MASTERY_XP_SCALE)

            actor.applyDamage(actor.hp, 122_000)
            if (recovery === 'respawn') {
                actor.queueRespawn(122_000, 15_000)
                actor.tickTimedState(137_000)
            } else {
                restoreCharacter(actor, 137_000, false)
            }
            hit(actor, abilityHero('vanguard'), 137_500)
            expect(undeadExperience(actor) - afterFirstKill).toBe(
                100n * MASTERY_XP_SCALE
            )
        }
    )

    it('grants no experience for allies, training targets or a dead killer', () => {
        const actor = skeleton()
        const ally = skeleton('skeleton:ally')
        const { dummy } = trainingCombatFixture()
        const start = undeadExperience(actor)
        hit(actor, ally, 1000)
        hit(actor, dummy, 2000)
        expect(dummy.alive).toBe(true)
        actor.applyDamage(actor.hp, 3000)
        hit(actor, abilityHero('vanguard'), 4000)
        expect(undeadExperience(actor)).toBe(start)
    })

    it.each([
        ['undead.consume_half', 2n],
        ['undead.consume_full', 1n],
    ] as const)('copies exact earned micro-XP with %s', (star, divisor) => {
        const actor = skeleton()
        const victim = abilityHero('vanguard')
        actor.progression.constellations.opened.add(star)
        const mastery = victim.progression.masteries
        mastery.blade.level = 3
        mastery.blade.experience = 11n
        mastery.arrow.experience = 2n
        const copied = (masteryTotalExperience(3) + 13n) / divisor
        const start = undeadExperience(actor)

        hit(actor, victim, 1000)
        expect(undeadExperience(actor) - start).toBe(
            250n * MASTERY_XP_SCALE + copied
        )
        expect(mastery.blade).toEqual({ level: 3, experience: 11n })
        expect(mastery.arrow).toEqual({ level: 0, experience: 2n })
    })

    it('caps copying and later kill rewards at Нежить level 40', () => {
        const actor = skeleton()
        const victim = abilityHero()
        actor.progression.constellations.opened.add('undead.consume_full')
        const undead = actor.progression.masteries.undead
        undead.level = 39
        undead.experience = masteryThreshold(39) - 1n
        victim.progression.masteries.magic.level = 50

        hit(actor, victim, 1000)
        expect(undead).toEqual({ level: 40, experience: 0n })
        hit(actor, abilityHero(), 2000)
        expect(undeadExperience(actor)).toBe(masteryTotalExperience(40))
    })
})
