import {
    type CharacterControllerKind,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityForDeity,
    type ProgressionClientMessage,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceRevive, beginRevive } from '../src/game/characterLife'
import { deityMood, deityMoodCycleMs, miracleChance } from '../src/game/deities'
import { studyMagic } from '../src/game/magicLearning'
import { NavigationService } from '../src/game/navigation'
import { handleProgressionCommand } from '../src/game/progressionCommands'
import { recordUsefulResourceSpend } from '../src/game/resourcePractice'
import { abilityContext } from './abilityTestHelpers'
import { masteryExperience, prayerXp } from './prayerMasteryTestHelpers'

describe('shared deities and meaningful miracles', () => {
    it('uses the same changing mood for everybody and reveals progressively better information', () => {
        const actor = hero()
        const peer = hero()
        const now = 15_000
        const vague = actor.snapshot(now).progression?.deity
        expect(vague).toEqual(peer.snapshot(now).progression?.deity)
        expect(vague).toMatchObject({
            id: 'hearth',
            perception: 'vague',
            mood: null,
            successChance: null,
            changesInMs: null,
        })
        expect(deityMood('hearth', now)).not.toBe(
            deityMood('hearth', now + deityMoodCycleMs)
        )

        actor.progression.constellations.opened.add('prayer.omen1')
        const hint = actor.snapshot(now).progression?.deity
        expect(hint).toMatchObject({
            perception: 'hint',
            mood: null,
            successChance: null,
        })
        expect(hint?.omen).not.toBe(vague?.omen)

        actor.progression.constellations.opened.add('prayer.omen2')
        actor.progression.constellations.opened.add('prayer.omen3')
        expect(actor.snapshot(now).progression?.deity).toMatchObject({
            perception: 'clear',
            mood: deityMood('hearth', now),
            successChance: miracleChance(actor, now),
            changesInMs: null,
        })

        actor.progression.constellations.opened.add('prayer.omen4')
        expect(actor.snapshot(now).progression?.deity).toMatchObject({
            perception: 'precise',
            changesInMs: 15_000,
        })
    })

    it('charges a failed prayer without granting XP from failure or cooldown spam', () => {
        const actor = hero()
        actor.abilities.known.add('pray')
        actor.hp -= 10
        const before = actor.hp
        expect(
            command(actor, { type: 'pray' }, [], 1_000, () => 1)
        ).toMatchObject([{ kind: 'cast', phase: 'started' }])
        expect(actor.mana).toBe(35)
        expect(command(actor, { type: 'pray' }, [], 1_500, () => 0)).toEqual([])
        expect(finishPrayer(actor, 4_000, () => 1)).toMatchObject([
            { kind: 'cast', phase: 'completed' },
            { kind: 'notice' },
        ])
        expect(actor.hp).toBe(before)
        expect(actor.mana).toBe(35)
        expect(masteryExperience(actor, 'prayer')).toBe(prayerXp(0))
        command(actor, { type: 'pray' }, [], 4_000, () => 0)
        finishPrayer(actor, 7_000, () => 0)
        expect(actor.hp).toBeGreaterThan(before)
        expect(masteryExperience(actor, 'prayer')).toBe(prayerXp(30))
    })

    it.each(['hearth', 'road', 'lantern'] as const)(
        '%s grants only its own useful resource miracle',
        (deityId) => {
            const actor = hero()
            actor.abilities.known.add('pray')
            actor.progression.patron = deityId
            const abilityId = prayerAbilityForDeity(deityId)
            actor.abilities.known.add(abilityId)
            actor.hp = 10
            actor.energy = 20
            actor.mana = 20
            if (deityId === 'road') {
                recordUsefulResourceSpend(
                    actor,
                    'energy',
                    actor.config.resources.maxEnergy - actor.energy
                )
            }
            if (deityId === 'lantern') {
                recordUsefulResourceSpend(
                    actor,
                    'mana',
                    actor.config.resources.maxMana - actor.mana
                )
            }
            command(actor, { type: 'pray', abilityId }, [], 1_000, () => 0)
            const events = finishPrayer(actor, 4_000, () => 0)
            expect(
                events.find((event) => event.kind === 'heal')?.amount
            ).toBeGreaterThan(0)
            expect(actor.hp > 10).toBe(deityId === 'hearth')
            expect(actor.energy > 20).toBe(deityId === 'road')
            expect(actor.mana > 20).toBe(deityId === 'lantern')
            expect(
                masteryExperience(
                    actor,
                    PRAYER_SCHOOL_DEFINITIONS[abilityId].constellationId
                )
            ).toBe(prayerXp(30))
        }
    )
})

describe('learned schools and the selected HUD deity', () => {
    it('changes the HUD patron only near a living religious guide after learning its school', () => {
        const actor = hero('cleric')
        const guide = hero('cleric')
        guide.position.x += 65
        const message = {
            type: 'choose_deity',
            deityId: 'road',
            targetId: guide.id,
        } as const
        expect(command(actor, message, [guide])).toEqual([])
        expect(actor.progression.patron).toBe('hearth')
        guide.position.x -= 1
        command(actor, message, [guide])
        expect(actor.progression.patron).toBe('hearth')
        actor.abilities.known.add('pray_road')
        command(actor, message, [guide])
        expect(actor.progression.patron).toBe('road')
        expect(actor.snapshot(1_000).progression?.resurrectionUnlocked).toBe(
            true
        )
        command(actor, { ...message, deityId: 'hearth' }, [guide])
        expect(actor.snapshot(1_000).progression?.resurrectionUnlocked).toBe(
            true
        )
    })
})

describe('unreliable resurrection', () => {
    it('finishes the same three-second channel, charges for refusal, and can succeed on another attempt before expiry', () => {
        const caster = hero('cleric')
        const target = hero()
        target.applyDamage(target.hp, 1_000)
        expect(
            beginRevive(
                caster,
                target,
                2_000,
                abilityContext([caster, target], 2_000)
            )
        ).toBe(true)
        expect(
            advanceRevive(
                caster,
                () => target,
                4_999,
                () => 0
            )
        ).toEqual([])
        expect(
            advanceRevive(
                caster,
                () => target,
                5_000,
                () => 1
            )
        ).toContainEqual(expect.objectContaining({ kind: 'notice' }))
        expect(target.alive).toBe(false)
        expect(target.reviveUntil).toBe(61_000)
        expect(caster.mana).toBe(115)
        expect(masteryExperience(caster, 'prayer')).toBe(prayerXp(0))
        expect(
            beginRevive(
                caster,
                target,
                5_001,
                abilityContext([caster, target], 5_001)
            )
        ).toBe(true)
        expect(
            advanceRevive(
                caster,
                () => target,
                8_001,
                () => 0
            )
        ).toContainEqual(expect.objectContaining({ kind: 'revive' }))
        expect(target.alive).toBe(true)
        expect(caster.mana).toBe(110)
        expect(masteryExperience(caster, 'prayer')).toBe(prayerXp(200))
    })
})

describe('finite studies and shared teaching', () => {
    it('reads each chapter once across all scholars and practices arcana without unlocking spells for free', () => {
        const actor = hero()
        const scholar = hero()
        scholar.tags.add('scholar')
        const message = { type: 'study_magic', targetId: scholar.id } as const
        for (let index = 0; index < 3; index += 1) {
            expect(command(actor, message, [scholar]).length).toBeGreaterThan(0)
        }
        expect(actor.progression.magicChaptersRead).toBe(3)
        expect(actor.progression.masteries.magic.level).toBe(1)
        expect(masteryExperience(actor, 'magic')).toBe(prayerXp(150))
        expect(actor.abilities.known.has('fireball')).toBe(false)
        const before = structuredClone(actor.progression)
        expect(command(actor, message, [scholar])).toEqual([])
        const secondScholar = hero()
        secondScholar.tags.add('scholar')
        expect(
            command(actor, { ...message, targetId: secondScholar.id }, [
                secondScholar,
            ])
        ).toEqual([])
        expect(actor.progression).toEqual(before)
    })

    it('validates teacher knowledge and distance, teaches atomically to another controller and prevents repeat practice', () => {
        const teacher = hero()
        const student = hero('vanguard', 'scripted')
        student.progression.masteries.magic.level = 3
        const message = { type: 'teach_magic', targetId: student.id } as const
        expect(command(teacher, message, [student])).toEqual([])
        teacher.abilities.known.add('fireball')
        student.position.x += 65
        expect(command(teacher, message, [student])).toEqual([])
        student.position.x -= 1
        expect(command(teacher, message, [student])).toContainEqual(
            expect.objectContaining({ kind: 'notice' })
        )
        expect(student.abilities.known.has('fireball')).toBe(true)
        expect(student.progression.masteries.magic.level).toBe(3)
        expect(masteryExperience(student, 'magic')).toBe(prayerXp(400))
        expect(masteryExperience(teacher, 'magic')).toBe(prayerXp(50))
        const before = structuredClone(teacher.progression)
        expect(command(teacher, message, [student])).toEqual([])
        expect(teacher.progression).toEqual(before)
        expect(
            command(teacher, { ...message, targetId: teacher.id }, [teacher])
        ).toEqual([])
    })
})

describe('shared knowledge action guards', () => {
    it.each(['network_player', 'scripted'] as const)(
        'rejects unavailable %s actors even through the shared study service',
        (controllerKind) => {
            const actor = hero('vanguard', controllerKind)
            const scholar = hero()
            scholar.tags.add('scholar')
            actor.stunUntil = 2_000
            expect(studyMagic(actor, scholar, 1_000)).toEqual([])
            actor.stunUntil = 0
            actor.actionLockUntil = 2_000
            expect(studyMagic(actor, scholar, 1_000)).toEqual([])
            actor.actionLockUntil = 0
            actor.tags.add('offline')
            expect(studyMagic(actor, scholar, 1_000)).toEqual([])
            actor.tags.delete('offline')
            expect(studyMagic(actor, scholar, 1_000).length).toBeGreaterThan(0)
            actor.applyDamage(actor.hp, 2_000)
            expect(studyMagic(actor, scholar, 3_000)).toEqual([])
            expect(actor.progression.magicChaptersRead).toBe(1)
        }
    )

    it('requires another religious guide, including for a cleric background', () => {
        const actor = hero('cleric')
        expect(
            command(
                actor,
                { type: 'choose_deity', deityId: 'road', targetId: actor.id },
                [actor]
            )
        ).toEqual([])
        expect(actor.progression.patron).toBe('hearth')
    })
})

let nextId = 0
function hero(
    heroClass: 'vanguard' | 'cleric' = 'vanguard',
    controllerKind: CharacterControllerKind = 'network_player'
): GameCharacter {
    return new GameCharacter({
        archetype: 'human',
        controllerKind,
        heroClass,
        faction: 'peaceful',
        id: `faith-${String(nextId++)}`,
        nickname: 'Hero',
        spawnPosition: { x: 100, y: 100 },
    })
}
function command(
    actor: GameCharacter,
    message: ProgressionClientMessage,
    characters: GameCharacter[],
    now = 1_000,
    random: () => number = () => 0
) {
    const navigation = new NavigationService({
        id: 'test',
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(32 * 32).fill(false),
        solidLayerNames: [],
    })
    return handleProgressionCommand(actor, message, {
        characters,
        navigation,
        now,
        random,
    })
}

function finishPrayer(actor: GameCharacter, now: number, random: () => number) {
    const navigation = new NavigationService({
        id: 'test',
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(1024).fill(false),
        solidLayerNames: [],
    })
    return advanceRevive(actor, () => actor, now, random, {
        characters: [actor],
        navigation,
        now,
        random,
    })
}
