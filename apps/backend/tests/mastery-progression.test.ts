import {
    backgroundMasteryMultiplier,
    constellationIds,
    createMasteryLevels,
    formatMasteryExperience,
    masteryConflict,
    masteryRewardMicros,
    masteryThreshold,
    masteryTotalExperience,
    parseMasteryExperience,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { fullConstellationCatalog } from '../src/game/constellationNodes'
import { minimumConstellationLevel } from '../src/game/constellationRequirements'
import {
    finishConstellationAction,
    hasStar,
    syncAbilityConstellations,
} from '../src/game/constellations'
import { publicProgression } from '../src/game/progressionObservation'
import {
    awardMasteries,
    captureMasteryFactors,
    snapshotProgression,
} from '../src/game/skillProgression'
import { abilityHero } from './abilityTestHelpers'

const xp = parseMasteryExperience

function unboostedAward(
    actor: GameCharacter,
    constellationId: (typeof constellationIds)[number]
) {
    return {
        constellationId,
        experience:
            8117.125 /
            backgroundMasteryMultiplier(actor.heroClass, constellationId),
    }
}

describe('exact uncapped mastery arithmetic', () => {
    it('keeps the Fibonacci opening and switches to the lower power threshold after 2100 XP', () => {
        expect(
            Array.from({ length: 10 }, (_, level) =>
                formatMasteryExperience(masteryThreshold(level))
            )
        ).toEqual([
            '100',
            '100',
            '200',
            '300',
            '500',
            '800',
            '1300',
            '2100',
            '2700',
            '3162.27766',
        ])
        expect(
            Array.from({ length: 11 }, (_, level) =>
                formatMasteryExperience(masteryTotalExperience(level))
            )
        ).toEqual([
            '0',
            '100',
            '200',
            '400',
            '700',
            '1200',
            '2000',
            '3300',
            '5400',
            '8100',
            '11262.27766',
        ])
        expect(masteryTotalExperience(35)).toBe(xp('297307.498302'))
    })
    it('floors power thresholds to micro-XP while keeping square targets exact', () => {
        expect(masteryThreshold(16)).toBe(xp('7009.279563'))
        expect(masteryThreshold(15)).toBe(xp('6400'))
        expect(masteryThreshold(24)).toBe(xp('12500'))
        expect(masteryTotalExperience(17) - masteryTotalExperience(16)).toBe(
            xp('7009.279563')
        )
    })
    it('keeps huge thresholds and decimal XP exact through serialization', () => {
        const large = masteryThreshold(999_999)
        expect(large).toBe(xp('100000000000'))
        expect(large).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER))
        expect(xp(formatMasteryExperience(large + 123456n))).toBe(
            large + 123456n
        )
        expect(formatMasteryExperience(xp('00030.125000'))).toBe('30.125')
        expect(formatMasteryExperience(1n)).toBe('0.000001')
        expect(() => xp('1.0000001')).toThrow(RangeError)
        expect(() => xp('-1')).toThrow(RangeError)
    })
    it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects invalid level %s',
        (level) => {
            expect(() => masteryThreshold(level)).toThrow(RangeError)
            expect(() => masteryTotalExperience(level)).toThrow(RangeError)
        }
    )
    it('preserves a positive minimum and rejects invalid rewards', () => {
        expect(masteryRewardMicros(30, 1)).toBe(xp('30'))
        expect(masteryRewardMicros(30, 1e-20)).toBe(1n)
        expect(() => masteryRewardMicros(0, 1)).toThrow(RangeError)
        expect(() => masteryRewardMicros(30, 2)).toThrow(RangeError)
    })
})

describe('symmetric constellation conflict', () => {
    it.each([
        [[10, 0, 0], 0, 30, 30],
        [[10, 10, 0], 0, 30, 20.03],
        [[10, 10, 10], 0, 30, 15.6],
        [[10, 2, 0], 1, 30, 7.51],
        [[10, 10, 2], 2, 30, 4.06],
        [[3, 0, 0], 1, 15, 5.15],
    ] as const)(
        'matches agreed reward %s target%s',
        (values, index, base, expected) => {
            const levels = {
                ...createMasteryLevels(),
                magic: values[0],
                blade: values[1],
                prayer: values[2],
            }
            const target = ['magic', 'blade', 'prayer'][index] as
                'magic' | 'blade' | 'prayer'
            expect(
                Number(
                    formatMasteryExperience(
                        masteryRewardMicros(
                            base,
                            masteryConflict(levels, target)
                        )
                    )
                )
            ).toBeCloseTo(expected, 2)
        }
    )
    it('includes Life and every prayer school, and remains symmetric under renaming', () => {
        for (const path of constellationIds) {
            const own = { ...createMasteryLevels(), [path]: 2 }
            const other = path === 'blade' ? 'magic' : 'blade'
            own[other] = 10
            expect(masteryConflict(own, path)).toBeCloseTo(0.25045363719)
        }
    })
    it('reduces the penalty when catching up and increases it when another branch grows', () => {
        const levels = { ...createMasteryLevels(), magic: 10, prayer: 2 }
        const initial = masteryConflict(levels, 'prayer')
        levels.prayer = 5
        expect(masteryConflict(levels, 'prayer')).toBeGreaterThan(initial)
        levels.prayer = 2
        levels.life = 10
        expect(masteryConflict(levels, 'prayer')).toBeLessThan(initial)
    })
})

describe('authoritative mastery awards', () => {
    it.each(['network_player', 'scripted', 'mob1'] as const)(
        'starts all nine at zero and carries XP for %s',
        (controllerKind) => {
            const actor = abilityHero('cleric', 'humanoid', controllerKind)
            expect(
                Object.values(actor.progression.masteries).every(
                    (entry) => entry.level === 0 && entry.experience === 0n
                )
            ).toBe(true)
            expect(hasStar(actor, 'prayer.root')).toBe(true)
            expect(hasStar(actor, 'prayer.revive')).toBe(true)
            awardMasteries(
                actor,
                [{ constellationId: 'prayer', experience: 120 }],
                { now: 1000, random: () => 0 }
            )
            expect(actor.progression.masteries.prayer).toEqual({
                level: 1,
                experience: xp('44'),
            })
            awardMasteries(
                actor,
                [{ constellationId: 'prayer', experience: 90 }],
                { now: 2000, random: () => 0 }
            )
            expect(actor.progression.masteries.prayer).toEqual({
                level: 2,
                experience: xp('52'),
            })
        }
    )
    it('banks openings past ten when the school has no random stars', () => {
        const actor = abilityHero('cleric')
        actor.abilities.known.add('pray_road')
        awardMasteries(
            actor,
            [
                {
                    constellationId: 'prayer_road',
                    experience:
                        Number(
                            formatMasteryExperience(masteryTotalExperience(12))
                        ) / 1.2,
                },
            ],
            { now: 1000 }
        )
        expect(actor.progression.masteries.prayer_road.level).toBe(12)
        expect(actor.progression.constellations.credits.prayer_road).toBe(12)
    })
})

describe('authoritative mastery crossover', () => {
    it.each([-1n, 0n, 1n])(
        'resolves the fractional power threshold with a %s micro-XP difference',
        (difference) => {
            const actor = abilityHero('cleric')
            actor.abilities.known.add('pray_road')
            const mastery = actor.progression.masteries.prayer_road
            mastery.level = 9
            mastery.experience = xp('3161.27766')
            actor.progression.constellations.credits.prayer_road = 4
            actor.progression.rewardReceipts.add('previous-practice')
            const awards = [
                {
                    constellationId: 'prayer_road' as const,
                    experience:
                        Number(formatMasteryExperience(xp('1') + difference)) /
                        1.2,
                },
            ]
            const options = { now: 1000, receiptId: 'threshold-practice' }
            const events = awardMasteries(actor, awards, options)
            const levelsGained = difference < 0n ? 0 : 1
            const expected = {
                level: 9 + levelsGained,
                experience: difference < 0n ? xp('3162.277659') : difference,
            }
            expect(mastery).toEqual(expected)
            expect(
                events.filter((event) => event.kind === 'skill_up')
            ).toHaveLength(levelsGained)
            expect(actor.progression.constellations.credits.prayer_road).toBe(
                4 + levelsGained
            )
            expect(actor.progression.rewardReceipts).toEqual(
                new Set(['previous-practice', 'threshold-practice'])
            )
            expect(awardMasteries(actor, awards, options)).toEqual([])
            expect(mastery).toEqual(expected)
            expect(actor.progression.constellations.credits.prayer_road).toBe(
                4 + levelsGained
            )
        }
    )
    it('carries one award across the Fibonacci and power steps without losing micro-XP or credits', () => {
        const actor = abilityHero('cleric')
        actor.abilities.known.add('pray_road')
        actor.progression.masteries.prayer_road.level = 7
        actor.progression.constellations.credits.prayer_road = 2
        const events = awardMasteries(
            actor,
            [{ constellationId: 'prayer_road', experience: 7962.40266 / 1.2 }],
            { now: 1000, receiptId: 'cross-both-curves' }
        )
        expect(actor.progression.masteries.prayer_road).toEqual({
            level: 10,
            experience: xp('0.125'),
        })
        expect(
            events
                .filter((event) => event.kind === 'skill_up')
                .map((event) => event.amount)
        ).toEqual([8, 9, 10])
        expect(actor.progression.constellations.credits.prayer_road).toBe(5)
        expect(
            snapshotProgression(actor, 1000).masteries.find(
                (entry) => entry.id === 'prayer_road'
            )
        ).toMatchObject({
            level: 10,
            experience: '0.125',
            totalExperience: '11262.40266',
            pendingOpenings: 5,
        })
    })
    it.each(['network_player', 'scripted', 'mob1'] as const)(
        'uses the same crossover and retained openings for all nine constellations with %s control',
        (controllerKind) => {
            for (const constellationId of constellationIds) {
                const actor = abilityHero('cleric', 'humanoid', controllerKind)
                for (const node of fullConstellationCatalog.filter(
                    (node) =>
                        node.constellationId === constellationId &&
                        node.acquisition === 'random'
                )) {
                    actor.progression.constellations.opened.add(node.id)
                }
                const awards = [unboostedAward(actor, constellationId)]
                const options = {
                    now: 1000,
                    receiptId: `crossover:${controllerKind}:${constellationId}`,
                }
                const events = awardMasteries(actor, awards, options)
                expect(actor.progression.masteries[constellationId]).toEqual({
                    level: 9,
                    experience: xp('17.125'),
                })
                expect(
                    events.filter((event) => event.kind === 'skill_up')
                ).toHaveLength(9)
                expect(
                    actor.progression.constellations.credits[constellationId]
                ).toBe(9)
                expect(awardMasteries(actor, awards, options)).toEqual([])
                expect(
                    actor.progression.masteries[constellationId].experience
                ).toBe(xp('17.125'))
                expect(
                    actor.progression.constellations.credits[constellationId]
                ).toBe(9)
            }
        }
    )
})

describe('authoritative mastery receipts and availability', () => {
    it('uses frozen factors across branches and rejects duplicate action receipts before XP', () => {
        const actor = abilityHero('cleric')
        actor.progression.masteries.life.experience = xp('90')
        const factors = captureMasteryFactors(actor)
        const options = {
            now: 1000,
            receiptId: 'one-action',
            factors,
            random: () => 0,
        }
        const awards = [
            { constellationId: 'life' as const, experience: 20 },
            { constellationId: 'prayer' as const, experience: 60 },
        ]
        awardMasteries(actor, awards, options)
        expect(actor.progression.masteries.life).toEqual({
            level: 1,
            experience: xp('10'),
        })
        expect(actor.progression.masteries.prayer.experience).toBe(xp('72'))
        expect(awardMasteries(actor, awards, options)).toEqual([])
        expect(actor.progression.masteries.prayer.experience).toBe(xp('72'))
    })
    it('never rewards disconnected, dead, retired or training characters', () => {
        for (const state of ['offline', 'dead', 'retired', 'training']) {
            const actor =
                state === 'training'
                    ? new GameCharacter({
                          id: 'training',
                          nickname: 'Training',
                          archetype: 'human',
                          controllerKind: 'scripted',
                          heroClass: 'cleric',
                          spawnPosition: { x: 100, y: 100 },
                          trainingTarget: { areaId: 'training' },
                      })
                    : abilityHero('cleric')
            if (state === 'offline') {
                actor.tags.add('offline')
            }
            if (state === 'dead') {
                actor.applyDamage(actor.hp, 1000)
            }
            if (state === 'retired') {
                actor.tags.add('state.retired')
            }
            expect(
                awardMasteries(
                    actor,
                    [{ constellationId: 'prayer', experience: 300 }],
                    { now: 1000 }
                )
            ).toEqual([])
            expect(actor.progression.masteries.prayer.experience).toBe(0n)
        }
    })
})

describe('private mastery observation', () => {
    it('exposes exact XP only to the owner and serializes no raw BigInts', () => {
        const actor = abilityHero('cleric')
        awardMasteries(
            actor,
            [{ constellationId: 'prayer_road', experience: 120 }],
            { now: 1000 }
        )
        const snapshot = snapshotProgression(actor, 1000)
        expect(JSON.stringify(snapshot)).toContain('"totalExperience":"144"')
        const publicView = publicProgression(snapshot)
        expect(
            publicView.masteries.every(
                (entry) =>
                    entry.experience === '0' &&
                    entry.pendingOpenings === 0 &&
                    entry.totalExperience === '0'
            )
        ).toBe(true)
        expect(publicView.constellations).toBeUndefined()
    })
})

describe('all required star conditions', () => {
    it('assigns explicit acquisition methods and gates to the complete fixed catalogue', () => {
        expect(fullConstellationCatalog).toHaveLength(138)
        expect(minimumConstellationLevel('prayer.harm')).toBe(1)
        expect(minimumConstellationLevel('prayer.harm1')).toBe(6)
        expect(minimumConstellationLevel('prayer.harm2')).toBe(12)
        expect(minimumConstellationLevel('prayer.area')).toBe(1)
        expect(minimumConstellationLevel('magic.fire_damage')).toBe(3)
        expect(minimumConstellationLevel('prayer.revive', 'cleric')).toBe(0)
        expect(minimumConstellationLevel('prayer.revive', 'ranger')).toBe(5)
        expect(minimumConstellationLevel('prayer.revive_master')).toBe(12)
        expect(minimumConstellationLevel('prayer.revive_angelic')).toBe(12)
        expect(minimumConstellationLevel('life.endurance')).toBe(3)
        expect(minimumConstellationLevel('life.rest')).toBe(3)
        expect(minimumConstellationLevel('life.work')).toBe(3)
    })
    it('keeps credits when parents exist but level is too low, without consuming RNG', () => {
        const actor = abilityHero('cleric')
        const state = actor.progression.constellations
        for (const node of fullConstellationCatalog.filter(
            (node) =>
                node.constellationId === 'prayer' &&
                node.acquisition === 'random' &&
                !['prayer.revive_master', 'prayer.revive_angelic'].includes(
                    node.id
                )
        )) {
            state.opened.add(node.id)
        }
        actor.progression.masteries.prayer.level = 11
        state.credits.prayer = 1
        const random = vi.fn(() => 0)
        expect(finishConstellationAction(actor, { now: 1000, random })).toEqual(
            []
        )
        expect(random).not.toHaveBeenCalled()
        expect(state.credits.prayer).toBe(1)
        actor.progression.masteries.prayer.level = 12
        finishConstellationAction(actor, { now: 2000, random })
        expect(hasStar(actor, 'prayer.revive_master')).toBe(true)
        expect(hasStar(actor, 'prayer.revive_angelic')).toBe(false)
        expect(state.credits.prayer).toBe(0)
    })
    it('grants learned abilities separately from level slots', () => {
        const actor = abilityHero('ranger')
        actor.abilities.known.add('pray')
        actor.abilities.known.add('fireball')
        actor.progression.masteries.prayer.level = 4
        actor.progression.masteries.magic.level = 9
        syncAbilityConstellations(actor)
        expect(hasStar(actor, 'prayer.revive')).toBe(false)
        expect(actor.abilities.known.has('greater_fireball')).toBe(false)
        actor.progression.masteries.prayer.level = 5
        actor.progression.masteries.magic.level = 10
        syncAbilityConstellations(actor)
        expect(hasStar(actor, 'prayer.revive')).toBe(true)
        expect(actor.abilities.known.has('greater_fireball')).toBe(true)
        expect(actor.progression.constellations.credits.magic).toBe(0)
    })
})
