import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterStats } from '../src/game/characterStats'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { canTargetByFaction } from '../src/game/factions'
import { createItemInstance } from '../src/game/inventory'
import { previewPrayer } from '../src/game/prayerContext'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function encounter() {
    const actor = abilityHero('arcanist')
    const target = abilityHero('vanguard', 'undead')
    target.reputation.peaceful = -100
    Object.assign(target, { faction: 'monsters', position: { x: 100, y: 132 } })
    const context = abilityContext([actor, target], 1000, () => 0.5)
    return {
        actor,
        target,
        context,
        attack: {
            actor,
            targets: context.characters,
            now: context.now,
            tileSize: 16,
            navigation: context.navigation,
            respawnDelayMsFor: () => 15000,
            random: () => 0.5,
            targetId: target.id,
        },
    }
}

describe('resolved shared attack abilities', () => {
    it('uses spark costs and cooldown for the basic attack and ignores a sword', () => {
        const { actor, target, attack } = encounter()
        actor.equipment.weapon = createItemInstance('old_sword')
        expect(
            resolveCharacterStats(actor.config, actor.equipment, 20).maxDamage
        ).toBe(6)
        const mana = actor.mana
        expect(attemptAttack(attack)[0]).toMatchObject({
            kind: 'attack',
            abilityId: 'spark',
            targetId: target.id,
        })
        expect(actor.mana).toBe(mana - 6)
        expect(resolvePendingAttackHit({ ...attack, now: 1199 })).toEqual([])
        expect(
            resolvePendingAttackHit({ ...attack, now: 1200 })
        ).toContainEqual(
            expect.objectContaining({
                kind: 'damage',
                damageKind: 'arcane',
                amount: 5,
            })
        )
        expect(attemptAbilityAttack({ ...attack, now: 1799 }, 'spark')).toEqual(
            []
        )
        expect(
            attemptAbilityAttack({ ...attack, now: 1800 }, 'spark')
        ).toHaveLength(1)
    })
    it('does not spend for an unreachable target or an empty mana pool', () => {
        const { actor, target, attack } = encounter()
        target.position.y = 200
        const mana = actor.mana
        expect(attemptAttack(attack)).toEqual([])
        expect(actor.mana).toBe(mana)
        target.position.y = 132
        actor.mana = 0
        expect(attemptAttack(attack)).toEqual([])
        expect(actor.pendingAttack).toBeUndefined()
    })
    it('absorbs actual damage and emits one death after a barrier is exhausted', () => {
        const { actor, target, attack } = encounter()
        target.abilities.barrier = {
            remaining: 8,
            expiresAt: 5000,
            practiced: false,
        }
        target.hp = 2
        attemptAttack(attack)
        expect(
            resolvePendingAttackHit({ ...attack, now: 1200 })
        ).toContainEqual(expect.objectContaining({ kind: 'absorb', amount: 5 }))
        expect(target.hp).toBe(2)
        attemptAttack({ ...attack, now: 1800 })
        const events = resolvePendingAttackHit({ ...attack, now: 2000 })
        expect(events.filter((event) => event.kind === 'death')).toHaveLength(1)
        expect(target.alive).toBe(false)
        expect(resolvePendingAttackHit({ ...attack, now: 2001 })).toEqual([])
        expect(actor.progression.skills.arcana.practice).toBeGreaterThan(0)
    })
    it('pins a harmful prayer target and does not replace a stale selection', () => {
        const { actor, target, context } = encounter()
        actor.abilities.known.add('pray')
        actor.progression.skills.miracles.level = 3
        const intent = previewPrayer(actor, context, target.id).intent
        expect(intent).toEqual({ mode: 'harm', targetId: target.id })
        target.position.y = 300
        const other = abilityHero('cleric', 'undead')
        context.characters = [...context.characters, other]
        if (intent === null) {
            throw new Error('Expected a pinned harmful intent')
        }
        const mana = actor.mana
        const events = handleAbilityCommand(
            actor,
            { type: 'use_ability', abilityId: 'pray', intent },
            context
        )
        expect(events.some((event) => event.kind === 'damage')).toBe(false)
        expect(actor.mana).toBe(mana)
        expect(canTargetByFaction(other, actor, context.now)).toBe(false)
    })
})
