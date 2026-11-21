import type {
    CharacterControllerKind,
    PrayerAbilityId,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { advanceRevive, beginRevive } from '../src/game/characterLife'
import { restoreCharacter } from '../src/game/characterRecovery'
import { completePrayer } from '../src/game/prayerEffects'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

const experienced = 'prayer.revive_experienced'
const higher = 'prayer.revive_higher'
const angelic = 'prayer.revive_angelic'
const stable = 'prayer.revive_stable'
const master = 'prayer.revive_master'
function fixture(
    stars: string[] = [],
    withContext = true,
    abilityId: PrayerAbilityId = 'pray',
    controller: CharacterControllerKind = 'network_player',
    startedAt = 31_000
) {
    const caster = abilityHero('cleric', 'humanoid', controller)
    const target = abilityHero(
        'vanguard',
        abilityId === 'pray_grave' ? 'undead' : 'humanoid'
    )
    caster.abilities.known.add(abilityId)
    caster.progression.masteries[
        abilityId === 'pray' ? 'prayer' : 'prayer_grave'
    ].level = 12
    for (const id of stars) {
        caster.progression.constellations.opened.add(id)
    }
    target.applyDamage(target.hp, startedAt - 1000)
    const random = vi.fn(() => 0)
    const context = abilityContext([caster, target], startedAt, random)
    const initialMana = caster.mana
    expect(
        beginRevive(
            caster,
            target,
            startedAt,
            abilityId === 'pray' || withContext ? context : undefined,
            abilityId
        )
    ).toBe(true)
    const complete = () =>
        advanceRevive(
            caster,
            () => target,
            startedAt + 3000,
            random,
            withContext ? { ...context, now: startedAt + 3000 } : undefined
        )
    return { caster, target, random, complete, initialMana }
}

for (const withContext of [false, true]) {
    describe(`resurrection completion with context=${String(withContext)}`, () => {
        it('uses the one-percent Mother base and resolves an identity only once', () => {
            const f = fixture([], withContext)
            const events = f.complete()
            expect(
                events.filter((event) => event.kind === 'revive')
            ).toHaveLength(1)
            expect(f.target.hp).toBe(1)
            expect(f.target.mana).toBe(
                Math.max(1, f.target.config.resources.maxMana * 0.01)
            )
            expect(f.target.energy).toBe(
                Math.max(1, f.target.config.resources.maxEnergy * 0.01)
            )
            expect(f.caster.mana).toBe(f.initialMana - 5)
            expect(
                masteryExperience(f.caster) - masteryExperienceAtLevel12()
            ).toBe(prayerXp(240))
            expect(f.random).toHaveBeenCalledTimes(1)
            expect(f.complete()).toEqual([])
            expect(f.random).toHaveBeenCalledTimes(1)
        })
        it('applies the success bonuses while keeping them out of restored resource fractions', () => {
            const f = fixture(
                [experienced, higher, master, stable],
                withContext
            )
            f.random.mockReturnValue(0.79)
            expect(f.complete()).toContainEqual(
                expect.objectContaining({ kind: 'revive' })
            )
            expect(f.target.hp).toBe(f.target.maxHp)
            expect(f.target.mana).toBe(
                Math.max(1, f.target.config.resources.maxMana * 0.01)
            )
            expect(f.random).toHaveBeenCalledTimes(1)
        })
        it('rolls Angelic independently after success and sets every resource to 150 percent', () => {
            const f = fixture(
                [higher, experienced, angelic, stable],
                withContext
            )
            f.random.mockReturnValueOnce(0.69).mockReturnValueOnce(0.299999)
            expect(f.complete()).toContainEqual(
                expect.objectContaining({ kind: 'revive' })
            )
            expect(f.target.hp).toBe(Math.ceil(f.target.maxHp * 1.5))
            expect(f.target.mana).toBe(f.target.config.resources.maxMana * 1.5)
            expect(f.target.energy).toBe(
                f.target.config.resources.maxEnergy * 1.5
            )
            expect(f.random).toHaveBeenCalledTimes(2)
        })
        it.each([false, true])(
            'uses the normal health fraction at the Angelic boundary with Stable=%s',
            (hasStable) => {
                const stars = [
                    higher,
                    experienced,
                    angelic,
                    ...(hasStable ? [stable] : []),
                ]
                const f = fixture(stars, withContext)
                f.random.mockReturnValueOnce(0).mockReturnValueOnce(0.3)
                f.complete()
                expect(f.target.hp).toBe(
                    Math.ceil(f.target.maxHp * (hasStable ? 1 : 0.75))
                )
                expect(f.target.energy).toBe(
                    Math.max(1, f.target.config.resources.maxEnergy * 0.01)
                )
                expect(f.random).toHaveBeenCalledTimes(2)
            }
        )
        it('does not draw Angelic or grant experience when the resurrection fails', () => {
            const f = fixture(
                [higher, experienced, master, stable, angelic],
                withContext
            )
            f.random.mockReturnValue(0.8)
            expect(
                f.complete().filter((event) => event.kind === 'revive')
            ).toHaveLength(0)
            expect(f.target.alive).toBe(false)
            expect(f.caster.mana).toBe(f.initialMana - 5)
            expect(f.random).toHaveBeenCalledTimes(1)
            expect(masteryExperience(f.caster)).toBe(
                masteryExperienceAtLevel12()
            )
        })
    })
    describe(`resurrection boundaries with context=${String(withContext)}`, () => {
        it('does not refund prepaid Mother mana or draw outcomes after cancellation', () => {
            const f = fixture([higher, experienced, angelic], withContext)
            f.caster.stunUntil = 35_000
            expect(f.complete()).toContainEqual(
                expect.objectContaining({ kind: 'cast', phase: 'interrupted' })
            )
            expect(f.caster.mana).toBe(f.initialMana - 5)
            expect(f.target.alive).toBe(false)
            expect(f.random).not.toHaveBeenCalled()
        })
        it('keeps the 95 percent boundary strict in the frozen benevolent profile', () => {
            const f = fixture(
                [higher, experienced, master, stable],
                withContext,
                'pray',
                'network_player',
                61_000
            )
            expect(
                f.caster.abilities.casting?.plan?.resurrection.successChance
            ).toBe(0.95)
            f.random.mockReturnValue(0.95)
            const context = withContext
                ? abilityContext([f.caster, f.target], 64_000, f.random)
                : undefined
            expect(
                advanceRevive(
                    f.caster,
                    () => f.target,
                    64_000,
                    f.random,
                    context
                ).filter((event) => event.kind === 'revive')
            ).toHaveLength(0)
            expect(f.target.alive).toBe(false)
            expect(f.random).toHaveBeenCalledTimes(1)
        })
        it('does not apply ordinary healing multipliers to Higher restoration', () => {
            const f = fixture(
                [higher, 'prayer.gift1', 'prayer.gift2'],
                withContext
            )
            f.complete()
            expect(f.target.hp).toBe(Math.ceil(f.target.maxHp * 0.75))
            expect(f.target.mana).toBe(
                Math.max(1, f.target.config.resources.maxMana * 0.01)
            )
        })
        it('preserves Grave at 50 percent without borrowing Mother success or Angelic upgrades', () => {
            const f = fixture(
                [higher, experienced, master, stable, angelic],
                withContext,
                'pray_grave'
            )
            expect(f.caster.mana).toBe(f.initialMana)
            f.random.mockReturnValue(0)
            f.complete()
            expect(f.caster.mana).toBe(f.initialMana - 20)
            expect(f.target.hp).toBe(Math.ceil(f.target.maxHp * 0.5))
            expect(f.target.mana).toBe(f.target.config.resources.maxMana * 0.5)
            expect(f.target.energy).toBe(
                f.target.config.resources.maxEnergy * 0.5
            )
            expect(f.random).toHaveBeenCalledTimes(1)
        })
        it('sends a failed Grave resurrection result only to the caster', () => {
            const f = fixture([], withContext, 'pray_grave')
            f.random.mockReturnValue(1)
            expect(
                f.complete().filter((event) => event.kind === 'notice')
            ).toEqual([
                {
                    kind: 'notice',
                    noticeKind: 'prayer_unanswered',
                    actorId: f.caster.id,
                    audienceIds: [f.caster.id],
                    abilityId: 'pray_grave',
                    text: 'Божество не ответило',
                },
            ])
            expect(f.target.alive).toBe(false)
            expect(f.caster.mana).toBe(f.initialMana - 20)
            expect(f.random).toHaveBeenCalledTimes(1)
        })
    })
}

it.each(['scripted', 'mob1'] as const)(
    'uses the same Angelic simulation for %s controllers',
    (controller) => {
        const f = fixture(
            [higher, experienced, angelic],
            true,
            'pray',
            controller
        )
        f.complete()
        expect(f.target.hp).toBe(Math.ceil(f.target.maxHp * 1.5))
    }
)
it('keeps ordinary automatic spawn restoration at 100 percent', () => {
    const actor = abilityHero()
    actor.applyDamage(actor.hp, 1000)
    restoreCharacter(actor, 2000, true, { hp: 1, mana: 1, energy: 1 })
    expect(actor.hp).toBe(actor.maxHp)
    expect(actor.mana).toBe(actor.config.resources.maxMana)
    expect(actor.energy).toBe(actor.config.resources.maxEnergy)
})
it('does not apply resurrection success bonuses to ordinary healing', () => {
    const caster = abilityHero()
    const target = abilityHero()
    for (const id of [higher, experienced, master, stable, angelic]) {
        caster.progression.constellations.opened.add(id)
    }
    target.hp -= 10
    const before = target.hp
    const context = abilityContext([caster, target], 34_000)
    completePrayer(
        caster,
        { mode: 'restore', targetId: target.id },
        context,
        0.6,
        1
    )
    expect(target.hp).toBe(before)
})
function masteryExperienceAtLevel12() {
    const actor = abilityHero()
    actor.progression.masteries.prayer.level = 12
    return masteryExperience(actor)
}
