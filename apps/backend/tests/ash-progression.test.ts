import {
    ASH_RULES,
    MASTERY_XP_SCALE,
    masteryTotalExperience,
    type PrayerIntent,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { canWalkDuringPrayer } from '../src/game/combatMovement'
import { hasStar, syncAbilityConstellations } from '../src/game/constellations'
import { effectiveDashCost } from '../src/game/effectiveParameters'
import { previewPrayer } from '../src/game/prayerContext'
import {
    awardMasteryExperience,
    retainMasteryExperience,
    transferMasteryExperience,
} from '../src/game/skillProgression'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function ashCaster(level = 0): GameCharacter {
    const actor = abilityHero('vanguard')
    actor.abilities.known.add('pray_grave')
    actor.progression.masteries.prayer_grave.level = level
    syncAbilityConstellations(actor)
    return actor
}

function cast(
    actor: GameCharacter,
    characters: GameCharacter[],
    intent: PrayerIntent,
    now = 30_000
) {
    const context = abilityContext(characters, now)
    const started = handleAbilityCommand(
        actor,
        { type: 'use_ability', abilityId: 'pray_grave', intent },
        context
    )
    expect(started).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ kind: 'cast', phase: 'started' }),
        ])
    )
    return {
        context,
        finish() {
            const endsAt = actor.abilities.casting?.completesAt
            if (endsAt === undefined) {
                throw new Error('Prayer did not start')
            }
            return advanceRevive(
                actor,
                (id) => characters.find((character) => character.id === id),
                endsAt,
                undefined,
                context
            )
        },
    }
}

it('uses only the pinned hostile target and advances the Ash cooldown', () => {
    const actor = ashCaster()
    const ooze = (id: string) =>
        new GameCharacter({
            id,
            nickname: 'Слизень',
            faction: 'monsters',
            archetype: 'slime',
            controllerKind: 'mob1',
            spawnPosition: { x: 126, y: 100 },
        })
    const first = ooze('ash-test-first')
    const second = ooze('ash-test-second')
    const characters = [actor, first, second]
    expect(
        previewPrayer(actor, abilityContext(characters), first.id, 'pray_grave')
    ).toMatchObject({
        intent: { mode: 'harm', targetId: first.id },
        durationMs: ASH_RULES.brandWindupMs,
        harmfulTargets: 1,
    })
    const prayer = cast(actor, characters, { mode: 'harm', targetId: first.id })
    const firstHp = first.hp
    const secondHp = second.hp
    expect(prayer.finish().some((event) => event.kind === 'damage')).toBe(true)
    expect(first.hp).toBeLessThan(firstHp)
    expect(second.hp).toBe(secondHp)
    expect(actor.abilities.availableAt.pray_grave).toBe(
        prayer.context.now + ASH_RULES.brandWindupMs + ASH_RULES.brandCooldownMs
    )
})

it('pins a second healing target, allows walking, and grants the single dash discount', () => {
    const actor = ashCaster(12)
    actor.progression.patron = 'grave'
    for (const star of ['heal_second', 'heal_walk', 'dash', 'mana']) {
        actor.progression.constellations.opened.add(`prayer_grave.${star}`)
    }
    const first = abilityHero('vanguard', 'undead')
    const second = abilityHero('vanguard', 'undead')
    first.hp -= 10
    second.hp -= 10
    first.position.x += 16
    second.position.x += 30
    const baseDashCost = effectiveDashCost(actor, 33_000)
    const before = actor.mana
    const prayer = cast(actor, [actor, first, second], {
        mode: 'restore',
        targetId: first.id,
    })
    expect(canWalkDuringPrayer(actor)).toBe(true)
    actor.position.x += 8
    const events = prayer.finish()
    expect(
        events
            .filter((event) => event.kind === 'heal')
            .map((event) => event.targetId)
    ).toEqual([first.id, second.id])
    expect(actor.mana).toBe(before - 10 + ASH_RULES.manaGift)
    expect(effectiveDashCost(actor, 33_000)).toBe(
        baseDashCost - ASH_RULES.dashDiscount
    )
    expect(effectiveDashCost(actor, 41_000)).toBe(baseDashCost)
})

it('conserves donated micro-XP, lowers mastery and reactivates dormant abilities without a duplicate opening', () => {
    const donor = ashCaster(10)
    const recipient = abilityHero('vanguard', 'undead')
    const ash = donor.progression.masteries.prayer_grave
    ash.experience = 70n * MASTERY_XP_SCALE
    expect(
        transferMasteryExperience(
            donor,
            recipient,
            'prayer_grave',
            'life',
            70n * MASTERY_XP_SCALE,
            false,
            1
        )
    ).toBeDefined()
    expect(ash.level).toBe(10)
    expect(ash.experience).toBe(0n)
    expect(
        transferMasteryExperience(
            donor,
            recipient,
            'prayer_grave',
            'life',
            1n,
            false,
            2
        )
    ).toBeUndefined()

    const deepCost = 200n * MASTERY_XP_SCALE
    expect(
        transferMasteryExperience(
            donor,
            recipient,
            'prayer_grave',
            'life',
            deepCost,
            true,
            3
        )
    ).toBeDefined()
    expect(ash.level).toBe(9)
    expect(donor.abilities.known.has('ash_sacrifice')).toBe(false)
    expect(hasStar(donor, 'prayer_grave.sacrifice')).toBe(false)
    const life = recipient.progression.masteries.life
    expect(masteryTotalExperience(life.level) + life.experience).toBe(
        270n * MASTERY_XP_SCALE
    )

    awardMasteryExperience(donor, 'prayer_grave', deepCost, { now: 4 })
    expect(donor.abilities.known.has('ash_sacrifice')).toBe(true)
    expect(donor.progression.constellations.credits.prayer_grave).toBe(0)
})

it('retains exactly seven tenths of each mastery with integer rounding', () => {
    const actor = ashCaster(9)
    const masteries = actor.progression.masteries
    masteries.prayer_grave.experience = 16n
    masteries.life.experience = 11n
    const previous = masteryTotalExperience(9) + 16n
    retainMasteryExperience(actor, 7n, 10n)
    expect(masteries.life.experience).toBe(7n)
    expect(
        masteryTotalExperience(masteries.prayer_grave.level) +
            masteries.prayer_grave.experience
    ).toBe((previous * 7n) / 10n)
    expect(actor.abilities.known.has('ash_heart')).toBe(false)
})
