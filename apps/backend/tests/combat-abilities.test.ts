import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterStats } from '../src/game/characterStats'
import {
    attemptAbilityAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { canTargetByFaction } from '../src/game/factions'
import { createItemInstance } from '../src/game/inventory'
import { previewPrayer } from '../src/game/prayerContext'
import { abilityContext, abilityHero } from './abilityTestHelpers'

const spark = ABILITY_DEFINITIONS.spark

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
    it('uses explicit Spark costs and cooldown while ignoring melee weapon bonuses', () => {
        const { actor, target, attack } = encounter()
        actor.equipment.weapon = createItemInstance('simple_sword')
        expect(
            resolveCharacterStats(actor.config, actor.equipment).maxDamage
        ).toBeGreaterThan(6)
        const mana = actor.mana
        expect(attemptAbilityAttack(attack, 'spark')[0]).toMatchObject({
            kind: 'attack',
            abilityId: 'spark',
            targetId: target.id,
        })
        expect(actor.mana).toBe(mana - 6)
        const hitAt = attack.now + spark.windupMs
        expect(actor.snapshot(attack.now).animation).toMatchObject({
            pose: 'prepare',
            hitAt,
        })
        actor.updateMovementAnimation(true, hitAt - 1)
        expect(actor.snapshot(hitAt - 1).animation.pose).toBe('prepare')
        actor.updateMovementAnimation(true, hitAt)
        expect(actor.snapshot(hitAt).animation.action).toBe('walk')
        const nextAt = attack.now + spark.cooldownMs
        expect(resolvePendingAttackHit({ ...attack, now: hitAt - 1 })).toEqual(
            []
        )
        expect(
            attemptAbilityAttack({ ...attack, now: nextAt - 1 }, 'spark')
        ).toEqual([])
        expect(
            resolvePendingAttackHit({ ...attack, now: hitAt })
        ).toContainEqual(
            expect.objectContaining({
                kind: 'damage',
                damageKind: 'arcane',
                amount: 5,
            })
        )
        expect(
            attemptAbilityAttack({ ...attack, now: nextAt }, 'spark')
        ).toHaveLength(1)
    })
    it('does not spend for an unreachable target or an empty mana pool', () => {
        const { actor, target, attack } = encounter()
        target.position.y = 200
        const mana = actor.mana
        expect(attemptAbilityAttack(attack, 'spark')).toEqual([])
        expect(actor.mana).toBe(mana)
        target.position.y = 132
        actor.mana = 0
        expect(attemptAbilityAttack(attack, 'spark')).toEqual([])
        expect(actor.pendingAttack).toBeUndefined()
    })
    it('absorbs actual damage and emits one death after a barrier is exhausted', () => {
        const { actor, target, attack } = encounter()
        target.mana = 8
        target.abilities.barrier = {
            expiresAt: 5000,
            practiced: false,
        }
        target.hp = 2
        attemptAbilityAttack(attack, 'spark')
        expect(
            resolvePendingAttackHit({
                ...attack,
                now: attack.now + spark.windupMs,
            })
        ).toContainEqual(expect.objectContaining({ kind: 'absorb', amount: 5 }))
        expect(target.hp).toBe(2)
        const nextAt = attack.now + spark.cooldownMs
        attemptAbilityAttack({ ...attack, now: nextAt }, 'spark')
        const hitAt = nextAt + spark.windupMs
        const events = resolvePendingAttackHit({ ...attack, now: hitAt })
        expect(events.filter((event) => event.kind === 'death')).toHaveLength(1)
        expect(target.alive).toBe(false)
        expect(resolvePendingAttackHit({ ...attack, now: hitAt + 1 })).toEqual(
            []
        )
        expect(actor.progression.masteries.magic.experience).toBeGreaterThan(0n)
    })
    it('pins a harmful prayer target and does not replace a stale selection', () => {
        const { actor, target, context } = encounter()
        actor.abilities.known.add('pray')
        actor.progression.constellations.opened.add('prayer.harm')
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
