import type {
    CharacterControllerKind,
    HeroClass,
    ProgressionClientMessage,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { handleProgressionCommand } from '../src/game/progressionCommands'
import { practiceThreshold, trainSkill } from '../src/game/skillProgression'
import { castSpell } from '../src/game/spellCasting'

describe('practice-driven knowledge', () => {
    it('starts with basic skills, makes later training harder, and caps each branch at ten', () => {
        const actor = hero()
        expect(actor.snapshot(0).progression).toMatchObject({
            totalEarnedLevels: 0,
            trainingMultiplier: 1,
            resurrectionUnlocked: false,
        })
        expect(practiceThreshold(actor.progression, 'miracles')).toBe(8)
        expect(trainSkill(actor, 'swordsmanship', 11)).toEqual([])
        expect(trainSkill(actor, 'swordsmanship')).toMatchObject([
            { kind: 'skill_up', amount: 2 },
        ])
        expect(practiceThreshold(actor.progression, 'miracles')).toBe(9)
        expect(practiceThreshold(actor.progression, 'swordsmanship')).toBe(27)
        expect(actor.snapshot(0).progression?.totalEarnedLevels).toBe(1)
        trainSkill(actor, 'fireball', 100_000)
        expect(actor.progression.skills.fireball.level).toBe(1)
        actor.progression.skills.fireball.unlocked = true
        trainSkill(actor, 'fireball', 100_000)
        expect(actor.progression.skills.fireball.level).toBe(10)
        expect(actor.progression.skills.fireball.practice).toBe(0)
        expect(actor.progression.skills.greater_fireball.unlocked).toBe(true)
        expect(practiceThreshold(actor.progression, 'fireball')).toBe(0)
        expect(trainSkill(actor, 'fireball', 100_000)).toEqual([])
    })

    it('practices swords only on damaging hits with an equipped sword', () => {
        const actor = hero()
        const target = enemy()
        strike(actor, target, 1_000)
        expect(actor.progression.skills.swordsmanship.practice).toBe(0)
        actor.equipment.weapon = createItemInstance('old_sword')
        target.position.y = 200
        strike(actor, target, 2_000)
        expect(actor.progression.skills.swordsmanship.practice).toBe(0)
        target.position.y = 112
        strike(actor, target, 3_000)
        expect(actor.progression.skills.swordsmanship.practice).toBe(1)
        const before = actor.snapshot(3_000).stats.minDamage
        trainSkill(actor, 'swordsmanship', 11)
        expect(actor.snapshot(3_000).stats.minDamage).toBe(before + 1)
        expect(actor.level).toBe(1)
        expect(actor.xp).toBe(0)
    })

    it('clears learned spells and all skill practice at permanent death', () => {
        const actor = hero()
        actor.progression.skills.fireball.unlocked = true
        trainSkill(actor, 'fireball', 100_000)
        trainSkill(actor, 'miracles', 30)
        actor.applyDamage(actor.hp, 1_000)
        retireCharacter(actor)
        expect(actor.progression.skills.fireball).toEqual({
            level: 1,
            practice: 0,
            unlocked: false,
        })
        expect(actor.progression.skills.greater_fireball.unlocked).toBe(false)
        expect(actor.progression.skills.miracles).toEqual({
            level: 1,
            practice: 0,
            unlocked: true,
        })
    })
})

describe('shared prayers and learning', () => {
    it.each(['network_player', 'scripted'] as const)(
        'heals and practices only useful prayers through the same service for %s',
        (controllerKind) => {
            const actor = hero('cleric', controllerKind)
            const startMana = actor.mana
            expect(command(actor, { type: 'pray' }, [], 1_000)).toMatchObject([
                { kind: 'cast', abilityId: 'pray', phase: 'completed' },
            ])
            expect(actor.mana).toBe(startMana)
            expect(actor.progression.skills.faith.practice).toBe(0)
            expect(actor.progression.skills.miracles.practice).toBe(0)
            actor.hp -= 15
            const events = command(actor, { type: 'pray' }, [], 4_000)
            const restored =
                events.find((event) => event.kind === 'heal')?.amount ?? 0
            expect(restored).toBeGreaterThan(0)
            expect(actor.progression.skills.miracles.practice).toBe(1)
            expect(actor.hp).toBe(actor.maxHp - 15 + restored)
            expect(actor.mana).toBe(startMana - 5)
            expect(command(actor, { type: 'pray' }, [], 5_000)).toMatchObject([
                { kind: 'notice' },
            ])
            expect(actor.progression.skills.miracles.practice).toBe(1)
            command(actor, { type: 'pray' }, [], 7_000)
            expect(actor.progression.skills.miracles.practice).toBe(2)
            actor.mana = 4
            expect(command(actor, { type: 'pray' }, [], 10_000)).toMatchObject([
                { kind: 'notice' },
            ])
        }
    )

    it.each(['vanguard', 'ranger', 'arcanist', 'cleric'] as const)(
        'teaches fireball to %s only near a living friendly scholar',
        (heroClass) => {
            const actor = hero(heroClass)
            actor.progression.skills.arcana.level = 3
            const scholar = hero()
            scholar.tags.add('scholar')
            scholar.position.x += 65
            expect(
                command(
                    actor,
                    {
                        type: 'learn_skill',
                        skillId: 'fireball',
                        targetId: scholar.id,
                    },
                    [scholar]
                )
            ).toEqual([])
            expect(actor.progression.skills.fireball.unlocked).toBe(false)
            scholar.position.x -= 1
            expect(
                command(
                    actor,
                    {
                        type: 'learn_skill',
                        skillId: 'fireball',
                        targetId: scholar.id,
                    },
                    [scholar]
                )
            ).toMatchObject([{ kind: 'notice' }])
            expect(actor.progression.skills.fireball.unlocked).toBe(true)
            expect(actor.progression.skills.greater_fireball.unlocked).toBe(
                false
            )
        }
    )
})

describe('authoritative ranged spells', () => {
    it('damages an enemy, spends mana, observes cooldown, and trains on successful hits', () => {
        const actor = hero()
        actor.progression.skills.fireball.unlocked = true
        const target = enemy()
        target.position.x += 100
        const events = command(
            actor,
            { type: 'cast_spell', skillId: 'fireball', targetId: target.id },
            [target],
            1_000
        )
        expect(events).toMatchObject([
            { kind: 'attack' },
            { kind: 'damage', amount: 8 },
        ])
        expect(target.hp).toBe(target.maxHp - 8)
        expect(actor.mana).toBe(28)
        expect(actor.progression.skills.fireball.practice).toBe(1)
        expect(
            command(
                actor,
                {
                    type: 'cast_spell',
                    skillId: 'fireball',
                    targetId: target.id,
                },
                [target],
                1_500
            )
        ).toEqual([])
        expect(actor.mana).toBe(28)
        target.hp = 3
        expect(
            command(
                actor,
                {
                    type: 'cast_spell',
                    skillId: 'fireball',
                    targetId: target.id,
                },
                [target],
                2_000
            )
        ).toMatchObject([
            { kind: 'attack' },
            { kind: 'damage', amount: 3 },
            { kind: 'death' },
        ])
        expect(target.alive).toBe(false)
        expect(target.respawnAt).toBe(17_000)
        expect(actor.progression.skills.fireball.practice).toBe(2)
        expect(
            command(
                actor,
                {
                    type: 'cast_spell',
                    skillId: 'fireball',
                    targetId: target.id,
                },
                [target],
                3_000
            )
        ).toEqual([])
    })
})

describe('spell validation', () => {
    it('rejects locked knowledge, allies, offline or remote targets, walls, range, stun and insufficient mana without practice', () => {
        const actor = hero()
        const target = enemy()
        const message: ProgressionClientMessage = {
            type: 'cast_spell',
            skillId: 'fireball',
            targetId: target.id,
        }
        const check = (): void => {
            expect(command(actor, message, [target])).toEqual([])
        }
        check()
        actor.progression.skills.fireball.unlocked = true
        target.tags.add('offline')
        check()
        target.tags.delete('offline')
        target.locationId = 'map-0-0'
        check()
        target.locationId = actor.locationId
        target.position.x += 161
        check()
        target.position.x -= 161
        actor.stunUntil = 2_000
        check()
        actor.stunUntil = 0
        actor.mana = 11
        check()
        actor.mana = 40
        const ally = hero()
        expect(
            command(actor, { ...message, targetId: ally.id }, [ally])
        ).toEqual([])
        const navigation = openMap()
        navigation.grid.solid[7 * 32 + 6] = true
        expect(
            handleProgressionCommand(actor, message, {
                characters: [target],
                navigation,
                now: 1_000,
            })
        ).toEqual([])
        expect(actor.mana).toBe(40)
        expect(actor.progression.skills.fireball.practice).toBe(0)
    })

    it('requires greater fireball mastery and validates the caster even at the shared spell entry point', () => {
        const actor = hero()
        const target = enemy()
        const message = {
            type: 'cast_spell',
            skillId: 'greater_fireball',
            targetId: target.id,
        } as const
        expect(command(actor, message, [target])).toEqual([])
        actor.progression.skills.fireball.unlocked = true
        trainSkill(actor, 'fireball', 100_000)
        const context = {
            characters: [target],
            navigation: openMap(),
            now: 1_000,
        }
        actor.stunUntil = 2_000
        expect(castSpell(actor, message, context)).toEqual([])
        actor.stunUntil = 0
        actor.actionLockUntil = 2_000
        expect(castSpell(actor, message, context)).toEqual([])
        actor.actionLockUntil = 0
        expect(castSpell(actor, message, context)).toMatchObject([
            { kind: 'attack' },
            { kind: 'damage', amount: 18 },
        ])
        expect(actor.mana).toBe(16)
        expect(actor.progression.skills.greater_fireball.practice).toBe(1)
        actor.applyDamage(actor.hp, 2_000)
        expect(castSpell(actor, message, { ...context, now: 4_000 })).toEqual(
            []
        )
    })
})

let nextId = 0
function hero(
    heroClass: HeroClass = 'vanguard',
    controllerKind: CharacterControllerKind = 'network_player'
): GameCharacter {
    return new GameCharacter({
        archetype: 'human',
        controllerKind,
        heroClass,
        faction: 'peaceful',
        id: `hero-${String(nextId++)}`,
        nickname: 'Hero',
        spawnPosition: { x: 100, y: 100 },
    })
}
function enemy(): GameCharacter {
    return new GameCharacter({
        archetype: 'slime',
        controllerKind: 'mob1',
        id: `enemy-${String(nextId++)}`,
        nickname: 'Enemy',
        spawnPosition: { x: 100, y: 112 },
    })
}
function openMap(): NavigationService {
    return new NavigationService({
        id: 'test',
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(32 * 32).fill(false),
        solidLayerNames: [],
    })
}
function command(
    actor: GameCharacter,
    message: ProgressionClientMessage,
    characters: GameCharacter[],
    now = 1_000
) {
    return handleProgressionCommand(actor, message, {
        characters,
        navigation: openMap(),
        now,
        random: () => 0,
    })
}
function strike(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): void {
    const context = {
        actor,
        targets: [target],
        now,
        tileSize: 16,
        respawnDelayMsFor: () => 15_000,
    }
    attemptAttack(context)
    resolvePendingAttackHit({
        ...context,
        now: now + actor.config.combat.attackWindupMs,
    })
}
