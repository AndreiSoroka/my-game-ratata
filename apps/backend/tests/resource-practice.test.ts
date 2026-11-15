import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { restoreCharacter } from '../src/game/characterRecovery'
import {
    attemptAbilityAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import {
    confirmResourceSpend,
    consumeResourceRecovery,
    practiceResourceMissing,
    recordResourceSpend,
    recordUsefulResourceSpend,
} from '../src/game/resourcePractice'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function encounter() {
    const actor = abilityHero('arcanist')
    const target = abilityHero('vanguard', 'undead')
    target.reputation.peaceful = -100
    Object.assign(target, { faction: 'monsters', position: { x: 100, y: 132 } })
    const context = abilityContext([actor, target])
    return {
        actor,
        target,
        navigation: context.navigation,
        attack: {
            actor,
            targets: context.characters,
            now: 1000,
            tileSize: 16,
            navigation: context.navigation,
            respawnDelayMsFor: () => 15000,
            random: () => 0.5,
            targetId: target.id,
        },
    }
}

describe('meaningful resource recovery', () => {
    it('earns recoverable costs only when a paid attack actually hits a foe', () => {
        const { actor, attack } = encounter()
        attemptAbilityAttack(attack, 'spark')
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
        resolvePendingAttackHit({ ...attack, now: 1200 })
        expect(practiceResourceMissing(actor, 'mana')).toBe(6)
        expect(practiceResourceMissing(actor, 'energy')).toBe(5)
        expect(consumeResourceRecovery(actor, 'mana', 6, 6)).toBe(6)
        actor.mana += 6
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
    })

    it('does not reward an empty forward attack or a target that left before impact', () => {
        const { actor, target, attack } = encounter()
        attemptAbilityAttack(attack, 'spark')
        target.position.y = 300
        resolvePendingAttackHit({ ...attack, now: 1200 })
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
        const forward = { ...attack, targetId: undefined }
        attemptAbilityAttack({ ...forward, now: 2000 }, 'spark')
        resolvePendingAttackHit({ ...forward, now: 2200 })
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
    })

    it('cannot revive a pending cost already paid back by natural regeneration', () => {
        const { actor, attack } = encounter()
        attemptAbilityAttack(attack, 'spark')
        actor.config.resources.manaRegenIdle = 100
        actor.applyRegen(100, false, true, 1100)
        resolvePendingAttackHit({ ...attack, now: 1200 })
        expect(actor.mana).toBe(actor.config.resources.maxMana)
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
    })

    it.each(['network_player', 'scripted'] as const)(
        'credits a barrier cost once after real hostile absorption for %s',
        (controller) => {
            const actor = abilityHero('arcanist', 'humanoid', controller)
            const enemy = abilityHero('vanguard', 'undead')
            Object.assign(enemy, { faction: 'monsters' })
            const context = abilityContext([actor, enemy])
            handleAbilityCommand(
                actor,
                { type: 'use_ability', abilityId: 'barrier' },
                context
            )
            expect(practiceResourceMissing(actor, 'mana')).toBe(0)
            const hit = {
                actor: enemy,
                target: actor,
                amount: 2,
                now: 1100,
                damageKind: 'physical' as const,
                respawnDelayMs: 15000,
            }
            resolveCharacterDamage(hit)
            expect(practiceResourceMissing(actor, 'mana')).toBe(12)
            resolveCharacterDamage({ ...hit, now: 1200 })
            expect(practiceResourceMissing(actor, 'mana')).toBe(12)
        }
    )
})

describe('resource recovery receipts', () => {
    it('restores resources freely without recycling restorative prayer costs into practice', () => {
        const actor = abilityHero()
        actor.mana -= 6
        recordUsefulResourceSpend(actor, 'mana', 6)
        actor.mana -= 5 // The restoration prayer itself never creates useful debt.
        expect(consumeResourceRecovery(actor, 'mana', 11, 11)).toBe(6)
        actor.mana += 11
        for (let attempt = 0; attempt < 3; attempt += 1) {
            actor.mana -= 5
            expect(practiceResourceMissing(actor, 'mana')).toBe(0)
            expect(consumeResourceRecovery(actor, 'mana', 5, 5)).toBe(0)
            actor.mana += 5
        }
    })

    it('accounts for unrelated drains and never awards the same loss twice', () => {
        const actor = abilityHero()
        actor.mana -= 5
        actor.mana -= 6
        recordUsefulResourceSpend(actor, 'mana', 6)
        expect(consumeResourceRecovery(actor, 'mana', 5, 11)).toBe(0)
        actor.mana += 5
        expect(consumeResourceRecovery(actor, 'mana', 99, 6)).toBe(6)
        actor.mana += 6
        actor.mana -= 5
        expect(consumeResourceRecovery(actor, 'mana', 5, 5)).toBe(0)
    })

    it('consumes useful debt during natural recovery without granting prayer practice', () => {
        const actor = abilityHero()
        actor.energy -= 10
        recordUsefulResourceSpend(actor, 'energy', 10)
        actor.config.resources.energyRegenIdle = 4
        actor.applyRegen(1000, false, true, 1000)
        expect(practiceResourceMissing(actor, 'energy')).toBe(6)
        expect(consumeResourceRecovery(actor, 'energy', 6, 6)).toBe(6)
        expect(actor.progression.skills.faith.practice).toBe(0)
    })

    it('clears receipts on death and resurrection', () => {
        const actor = abilityHero()
        actor.mana -= 6
        const receipt = recordResourceSpend(actor, 'mana', 6)
        actor.applyDamage(actor.hp, 1000)
        confirmResourceSpend(receipt)
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
        restoreCharacter(actor, 2000, false)
        expect(practiceResourceMissing(actor, 'mana')).toBe(0)
        expect(practiceResourceMissing(actor, 'energy')).toBe(0)
    })

    it('requires actual dash displacement and credits its paid cost only once', () => {
        const actor = abilityHero()
        const context = abilityContext([actor])
        handleMovementCommand(actor, { type: 'dash' }, 1000)
        const cost = actor.config.resources.maxEnergy - actor.energy
        expect(practiceResourceMissing(actor, 'energy')).toBe(0)
        advanceCharacter({
            character: actor,
            navigation: context.navigation,
            now: 1050,
            deltaMs: 50,
        })
        expect(practiceResourceMissing(actor, 'energy')).toBe(cost)
        advanceCharacter({
            character: actor,
            navigation: context.navigation,
            now: 1100,
            deltaMs: 50,
        })
        expect(practiceResourceMissing(actor, 'energy')).toBe(cost)
    })
})
