import type { HeroClass } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { CHARACTER_CONFIG } from '../src/game/characterConfig'
import {
    advanceRevive,
    beginRevive,
    retireCharacter,
    shouldRetireCharacter,
} from '../src/game/characterLife'
import { createItemInstance } from '../src/game/inventory'
import { trainSkill } from '../src/game/skillProgression'

describe('shared hero classes and progression', () => {
    it('changes actual common stats for each class without changing archetype defaults', () => {
        const vanguard = hero('vanguard')
        const ranger = hero('ranger')
        const arcanist = hero('arcanist')
        const cleric = hero('cleric')
        expect(vanguard.maxHp).toBe(30)
        expect(ranger.config.moveSpeed).toBeGreaterThan(
            vanguard.config.moveSpeed
        )
        expect(ranger.config.basicAttackKind).toBe('melee')
        expect(ranger.config.attackZones[0]?.maxY).toBeLessThan(1)
        expect(arcanist.config.resources.attackManaCost).toBe(0)
        expect(arcanist.config.basicAttackKind).toBe('melee')
        expect(cleric.config.resources.maxMana).toBe(120)
        expect(CHARACTER_CONFIG.human.resources.maxMana).toBe(40)
        ranger.config.combat.maxHp = 500
        expect(vanguard.maxHp).toBe(30)
        expect(CHARACTER_CONFIG.human.combat.maxHp).toBe(30)
    })

    it('keeps hit points and class configuration independent of skill practice', () => {
        const actor = hero('ranger')
        trainSkill(actor, 'swordsmanship', 12)
        expect(actor.progression.skills.swordsmanship.level).toBe(2)
        expect(actor.maxHp).toBe(24)
        expect(actor.config.combat.minDamage).toBe(4)
        expect(actor.snapshot(1_050)).toMatchObject({
            level: 1,
            xp: 0,
            xpToNext: 0,
        })
    })
})

describe('hero death and retirement', () => {
    it('keeps a corpse for sixty seconds without the old automatic respawn', () => {
        const actor = hero('vanguard')
        actor.inventory.push(createItemInstance('boots'))
        actor.equipment.weapon = createItemInstance('simple_sword')
        trainSkill(actor, 'swordsmanship', 12)
        kill(actor, 2_000)
        actor.tickTimedState(7_001)
        expect(actor.alive).toBe(false)
        expect(actor.respawnAt).toBe(62_000)
        expect(actor.inventory).toHaveLength(1)
        expect(shouldRetireCharacter(actor, 61_999)).toBe(false)
        actor.tickTimedState(62_000)
        expect(actor.alive).toBe(false)
        expect(shouldRetireCharacter(actor, 62_000)).toBe(true)
        expect(retireCharacter(actor)).toEqual({
            actorId: actor.id,
            kind: 'permadeath',
        })
        expect(actor.inventory).toEqual([])
        expect(actor.equipment).toEqual({})
        expect(actor.xp).toBe(0)
        expect(actor.level).toBe(1)
        expect(actor.progression.skills.swordsmanship.level).toBe(1)
        expect(actor.progression.skills.fireball.unlocked).toBe(false)
    })

    it('keeps NPC respawning as a life policy on the same character class', () => {
        const npc = new GameCharacter({
            archetype: 'human',
            controllerKind: 'mob1',
            heroClass: 'cleric',
            faction: 'peaceful',
            id: 'npc',
            nickname: 'Cleric',
            spawnPosition: { x: 40, y: 40 },
        })
        kill(npc, 2_000)
        npc.position = { x: 90, y: 90 }
        npc.tickTimedState(7_000)
        expect(npc.alive).toBe(true)
        expect(npc.position).toEqual(npc.spawnPosition)
        expect(npc.hp).toBe(npc.maxHp)
    })
})

describe('shared cleric revival ability', () => {
    it('channels for three seconds, spends mana and preserves the revived hero identity', () => {
        const caster = hero('cleric')
        const target = hero('ranger')
        trainSkill(target, 'miracles', 8)
        target.inventory.push(createItemInstance('boots'))
        kill(target, 2_000)
        expect(beginRevive(caster, target, 3_000)).toBe(true)
        expect(beginRevive(caster, target, 3_500)).toBe(false)
        expect(advanceRevive(caster, () => target, 5_999)).toEqual([])
        expect(target.alive).toBe(false)
        expect(
            advanceRevive(
                caster,
                () => target,
                6_000,
                () => 0
            )
        ).toEqual([{ actorId: caster.id, targetId: target.id, kind: 'revive' }])
        expect(target.alive).toBe(true)
        expect(target.hp).toBe(Math.ceil(target.maxHp / 2))
        expect(target.progression.skills.miracles.level).toBe(2)
        expect(caster.progression.skills.miracles.practice).toBe(1)
        expect(target.inventory).toHaveLength(1)
        expect(caster.mana).toBe(100)
        expect(target.reviveUntil).toBe(0)
        expect(advanceRevive(caster, () => target, 6_100)).toEqual([])
    })

    it('requires a living cleric with mana, in range and in the same location', () => {
        const target = hero('vanguard')
        const caster = hero('cleric')
        kill(target, 2_000)
        expect(beginRevive(hero('ranger'), target, 3_000)).toBe(false)
        caster.position.x += 49
        expect(beginRevive(caster, target, 3_000)).toBe(false)
        caster.position = { ...target.position }
        caster.locationId = 'map-0-0'
        expect(beginRevive(caster, target, 3_000)).toBe(false)
        caster.locationId = target.locationId
        caster.mana = 19
        expect(beginRevive(caster, target, 3_000)).toBe(false)
        caster.mana = 120
        expect(beginRevive(caster, target, 62_000)).toBe(false)
    })

    it('allows other backgrounds to resurrect after practicing miracles', () => {
        const caster = hero('vanguard')
        const target = hero('ranger')
        kill(target, 2_000)
        expect(beginRevive(caster, target, 3_000)).toBe(false)
        caster.abilities.known.add('pray')
        trainSkill(caster, 'miracles', 200)
        expect(caster.progression.skills.miracles.level).toBeGreaterThanOrEqual(
            5
        )
        expect(caster.snapshot(3_000).progression?.resurrectionUnlocked).toBe(
            true
        )
        expect(beginRevive(caster, target, 3_000)).toBe(true)
    })

    it('interrupts the cast if the cleric is stunned before completion', () => {
        const caster = hero('cleric')
        const target = hero('vanguard')
        kill(target, 2_000)
        beginRevive(caster, target, 3_000)
        caster.stunUntil = 7_000
        expect(
            advanceRevive(
                caster,
                () => target,
                6_000,
                () => 0
            )
        ).toMatchObject([{ kind: 'cast', phase: 'interrupted' }])
        expect(target.alive).toBe(false)
        expect(caster.mana).toBe(120)
    })
})

function hero(heroClass: HeroClass): GameCharacter {
    return new GameCharacter({
        archetype: 'human',
        controllerKind: 'network_player',
        heroClass,
        id: heroClass,
        nickname: heroClass,
        spawnPosition: { x: 100, y: 100 },
    })
}

function kill(character: GameCharacter, now: number): void {
    character.applyDamage(character.maxHp, now)
    character.queueRespawn(now, 5_000)
}
