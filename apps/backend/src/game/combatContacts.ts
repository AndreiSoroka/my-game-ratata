import {
    type GameEventPayload,
    ITEM_DEFINITIONS,
} from '@my-game-ratata/contracts'

import { type DamageResolution, resolveCharacterDamage } from './abilityDamage'
import {
    advanceBladeCombo,
    bladeComboBonus,
    comboEligible,
    prepareComboTarget,
} from './bladeCombo'
import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import type { AttackContext } from './combat'
import { resolveCounterAttack } from './combatCounter'
import {
    applyAttackStun,
    resolveAttackDamage,
    resolveRawAttackDamage,
} from './combatDamage'
import { attackDelivery, defendContact } from './combatDefense'
import { rewardCharacterHit } from './combatMastery'
import { invalidateWeaponAction } from './combatState'
import { damageGrave } from './graveCombat'
import type { GraveCombatTarget } from './graveRules'
import { wearWeapon } from './itemDurability'
import { prayerAuraEffects, prayerStunImmune } from './prayerAuras'
import {
    confirmCombatResourceSpend,
    confirmResourceSpend,
    recordUsefulResourceSpend,
} from './resourcePractice'
import { captureMasteryFactors } from './skillProgression'

interface ContactResult {
    events: GameEventPayload[]
    impact: number
    result?: DamageResolution
    counter?: GameCharacter
}
export function resolveContactBatch(
    context: AttackContext,
    attack: PendingAttackHit,
    targets: readonly GameCharacter[],
    graves: readonly GraveCombatTarget[] = [],
    allowCounters = true
): GameEventPayload[] {
    const { actor, now } = context
    const factors = captureMasteryFactors(actor)
    const contacts = targets.map((target) => ({
        target,
        contact: resolveCharacterContact(context, attack, target),
    }))
    const events = contacts.flatMap(({ contact }) => contact.events)
    let impact = contacts.reduce((sum, { contact }) => sum + contact.impact, 0)
    const graveResult = resolveGraveContacts(context, attack, graves)
    events.push(...graveResult.events)
    impact += graveResult.impact
    const useful = contacts.find(
        ({ contact }) => (contact.result?.trainableDamage ?? 0) > 0
    )
    if (useful?.contact.result !== undefined) {
        events.push(
            ...rewardCharacterHit(
                context,
                attack,
                useful.target,
                useful.contact.result,
                context.random ?? Math.random,
                factors
            )
        )
    }
    events.push(...resolvedWeaponWear(actor, attack, impact, now))
    if (allowCounters) {
        for (const { contact } of contacts) {
            if (contact.counter !== undefined) {
                events.push(
                    ...resolveCounterAttack(context, contact.counter, actor)
                )
            }
        }
    }
    return events
}
function resolveCharacterContact(
    context: AttackContext,
    attack: PendingAttackHit,
    target: GameCharacter
): ContactResult {
    const { actor, now } = context
    const random = context.random ?? Math.random
    if (
        attack.abilityId !== 'wide_swing' &&
        attack.abilityId !== 'circular_swing'
    ) {
        prepareComboTarget(actor, target.id)
    }
    const defense = defendContact(actor, target, attack, now, random)
    if (defense.outcome !== 'hit') {
        return {
            events: defense.events,
            impact: 0,
            ...(defense.outcome === 'parry' && attack.origin !== 'counter'
                ? { counter: target }
                : {}),
        }
    }
    const withCombo = {
        ...attack,
        comboBonus: comboEligible(attack)
            ? bladeComboBonus(actor, target.id, now)
            : 0,
    }
    const effects = prayerAuraEffects(target, now)
    const immune = prayerStunImmune(target, now)
    const roll = resolveRawAttackDamage(actor, withCombo, random, now)
    const result = resolveCharacterDamage({
        actor,
        target,
        now,
        amount: roll.amount * defense.multiplier,
        roundFinal: true,
        random,
        targetAuraEffects: effects,
        hitQuality: roll.hitQuality,
        damageKind: attackDelivery(attack) === 'magic' ? 'arcane' : 'physical',
        respawnDelayMs: context.respawnDelayMsFor(target),
    })
    confirmCombatResourceSpend(
        actor,
        target,
        result,
        attack.resourceSpends ?? [],
        now
    )
    const events = contactEvents(result.events, attack, roll.critical)
    if (result.hpDamage > 0) {
        drainHitEnergy(target, attack, result, defense.paidGuard)
        events.push(
            ...applyAttackStun(
                actor,
                target,
                attack,
                now,
                random,
                prayerAuraEffects(actor, now).advantage,
                immune
            )
        )
    }
    if (result.impactDamage + result.absorbed > 0) {
        advanceBladeCombo(actor, target, attack, now)
    }
    return { events, impact: result.impactDamage + result.absorbed, result }
}
function drainHitEnergy(
    target: GameCharacter,
    attack: PendingAttackHit,
    result: DamageResolution,
    paidGuard: boolean
): void {
    const drained = paidGuard ? 0 : target.drainEnergy(attack.targetEnergyDrain)
    if (result.trainableDamage > 0) {
        recordUsefulResourceSpend(target, 'energy', drained)
    }
}
export function usesAttackWeapon(attack: PendingAttackHit): boolean {
    return (
        attack.weaponAttack === true ||
        attack.abilityId === undefined ||
        attack.abilityId === 'skeleton_strike'
    )
}
function resolvedWeaponWear(
    actor: GameCharacter,
    attack: PendingAttackHit,
    impact: number,
    now: number
): GameEventPayload[] {
    const weapon = actor.equipment.weapon
    if (
        weapon === undefined ||
        !usesAttackWeapon(attack) ||
        impact <= 0 ||
        !wearWeapon(actor)
    ) {
        return []
    }
    invalidateWeaponAction(actor, now)
    return [
        {
            kind: 'notice',
            actorId: actor.id,
            text: `${ITEM_DEFINITIONS[weapon.itemId].name}: предмет сломан. Нужен ремонт у кузнеца.`,
        },
    ]
}

function resolveGraveContacts(
    context: AttackContext,
    attack: PendingAttackHit,
    graves: readonly GraveCombatTarget[]
) {
    const { actor, now } = context
    const events: GameEventPayload[] = []
    let impact = 0
    for (const grave of graves) {
        if (context.graves === undefined) {
            continue
        }
        const roll =
            attack.rawDamage === undefined
                ? resolveAttackDamage(
                      actor,
                      attack,
                      context.random ?? Math.random,
                      now
                  )
                : {
                      amount: attack.rawDamage,
                      critical: false,
                      hitQuality: 'normal' as const,
                  }
        const hit = damageGrave(
            actor,
            grave,
            attack,
            roll.amount,
            roll.critical,
            now,
            context.graves,
            roll.hitQuality
        )
        events.push(...hit.events)
        impact += hit.hpDamage
        if (hit.hpDamage > 0) {
            attack.resourceSpends?.forEach(confirmResourceSpend)
        }
    }
    return { events, impact }
}

function contactEvents(
    source: GameEventPayload[],
    attack: PendingAttackHit,
    critical: boolean
): GameEventPayload[] {
    return source.map((event) => ({
        ...event,
        ...(attack.actionId === undefined ? {} : { actionId: attack.actionId }),
        attackOrigin:
            attack.origin ??
            (attack.abilityId === undefined ? 'basic' : 'ability'),
        delivery: attackDelivery(attack),
        ...(attack.abilityId === undefined
            ? {}
            : { abilityId: attack.abilityId }),
        ...(event.kind === 'damage' ? { critical } : {}),
    }))
}
