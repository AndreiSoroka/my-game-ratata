import type {
    CharacterControllerKind,
    ProgressionClientMessage,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceRevive, beginRevive } from '../src/game/characterLife'
import { deityMood, deityMoodCycleMs, miracleChance } from '../src/game/deities'
import { studyMagic } from '../src/game/magicLearning'
import { NavigationService } from '../src/game/navigation'
import { handleProgressionCommand } from '../src/game/progressionCommands'
import {
    practiceThreshold,
    trainingMultiplier,
    trainSkill,
} from '../src/game/skillProgression'

describe('shared deities and meaningful faith', () => {
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
        actor.progression.skills.faith.level = 4
        const hint = actor.snapshot(now).progression?.deity
        expect(hint).toMatchObject({
            perception: 'hint',
            mood: null,
            successChance: null,
        })
        expect(hint?.omen).not.toBe(vague?.omen)
        actor.progression.skills.faith.level = 7
        expect(actor.snapshot(now).progression?.deity).toMatchObject({
            perception: 'clear',
            mood: deityMood('hearth', now),
            successChance: miracleChance(actor, now),
            changesInMs: null,
        })
        actor.progression.skills.faith.level = 10
        expect(actor.snapshot(now).progression?.deity).toMatchObject({
            perception: 'precise',
            changesInMs: 15_000,
        })
    })

    it('charges a failed prayer, trains faith, and never trains miracles from failure or cooldown spam', () => {
        const actor = hero()
        actor.abilities.known.add('pray')
        actor.hp -= 10
        const before = actor.hp
        expect(
            command(actor, { type: 'pray' }, [], 1_000, () => 1)
        ).toMatchObject([{ kind: 'cast' }, { kind: 'notice' }])
        expect(actor.hp).toBe(before)
        expect(actor.mana).toBe(35)
        expect(actor.progression.skills.faith.practice).toBe(1)
        expect(actor.progression.skills.miracles.practice).toBe(0)
        expect(
            command(actor, { type: 'pray' }, [], 1_500, () => 0)
        ).toMatchObject([{ kind: 'notice' }])
        expect(actor.mana).toBe(35)
        expect(actor.progression.skills.faith.practice).toBe(1)
        command(actor, { type: 'pray' }, [], 4_000, () => 0)
        expect(actor.hp).toBeGreaterThan(before)
        expect(actor.progression.skills.faith.practice).toBe(2)
        expect(actor.progression.skills.miracles.practice).toBe(1)
    })

    it.each(['hearth', 'road', 'lantern'] as const)(
        '%s grants only its own useful resource miracle',
        (deityId) => {
            const actor = hero()
            actor.abilities.known.add('pray')
            actor.progression.patron = deityId
            actor.hp = 10
            actor.energy = 20
            actor.mana = 20
            const events = command(actor, { type: 'pray' }, [], 1_000, () => 0)
            expect(
                events.find((event) => event.kind === 'heal')?.amount
            ).toBeGreaterThan(0)
            expect(actor.hp > 10).toBe(deityId === 'hearth')
            expect(actor.energy > 20).toBe(deityId === 'road')
            expect(actor.mana > 20).toBe(deityId === 'lantern')
            expect(actor.progression.skills.miracles.practice).toBe(1)
        }
    )

    it('changes patron only near a living religious guide and gates resurrection by patron', () => {
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
        expect(actor.progression.patron).toBe('road')
        expect(actor.snapshot(1_000).progression?.resurrectionUnlocked).toBe(
            false
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
        expect(beginRevive(caster, target, 2_000)).toBe(true)
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
        ).toMatchObject([{ kind: 'notice' }])
        expect(target.alive).toBe(false)
        expect(target.reviveUntil).toBe(61_000)
        expect(caster.mana).toBe(100)
        expect(caster.progression.skills.faith.practice).toBe(1)
        expect(caster.progression.skills.miracles.practice).toBe(0)
        expect(beginRevive(caster, target, 5_001)).toBe(true)
        expect(
            advanceRevive(
                caster,
                () => target,
                8_001,
                () => 0
            )
        ).toMatchObject([{ kind: 'revive' }])
        expect(target.alive).toBe(true)
        expect(caster.mana).toBe(80)
        expect(caster.progression.skills.faith.practice).toBe(2)
        expect(caster.progression.skills.miracles.practice).toBe(1)
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
        expect(actor.progression.skills.arcana.level).toBe(2)
        expect(actor.progression.skills.arcana.practice).toBe(16)
        expect(actor.progression.skills.fireball.unlocked).toBe(false)
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
        student.progression.skills.arcana.level = 3
        const message = { type: 'teach_magic', targetId: student.id } as const
        expect(command(teacher, message, [student])).toEqual([])
        teacher.progression.skills.fireball.unlocked = true
        student.position.x += 65
        expect(command(teacher, message, [student])).toEqual([])
        student.position.x -= 1
        expect(command(teacher, message, [student])).toMatchObject([
            { kind: 'notice' },
            { kind: 'skill_up' },
        ])
        expect(student.progression.skills.fireball.unlocked).toBe(true)
        expect(student.progression.skills.arcana.level).toBe(3)
        expect(teacher.progression.skills.arcana.level).toBe(2)
        const before = structuredClone(teacher.progression)
        expect(command(teacher, message, [student])).toEqual([])
        expect(teacher.progression).toEqual(before)
        expect(
            command(teacher, { ...message, targetId: teacher.id }, [teacher])
        ).toEqual([])
    })

    it('adds multi-branch difficulty only after genuine practice, on top of all earned levels', () => {
        const actor = hero()
        actor.progression.skills.fireball.unlocked = true
        expect(trainingMultiplier(actor.progression)).toBe(1)
        trainSkill(actor, 'swordsmanship')
        expect(trainingMultiplier(actor.progression)).toBe(1)
        trainSkill(actor, 'faith')
        expect(trainingMultiplier(actor.progression)).toBe(1.25)
        trainSkill(actor, 'miracles')
        expect(trainingMultiplier(actor.progression)).toBe(1.25)
        trainSkill(actor, 'arcana')
        expect(trainingMultiplier(actor.progression)).toBe(1.5)
        expect(practiceThreshold(actor.progression, 'swordsmanship')).toBe(18)
        trainSkill(actor, 'swordsmanship', 17)
        expect(trainingMultiplier(actor.progression)).toBe(1.6)
        expect(actor.snapshot(0).progression?.practicedBranches).toEqual([
            'warfare',
            'faith',
            'arcana',
        ])
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
