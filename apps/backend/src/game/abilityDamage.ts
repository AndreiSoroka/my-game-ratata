import type { DamageKind, GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { grantRetaliation, hasDirectRetaliationRight } from './crimeRelations'
import { canTargetByFaction } from './factions'
import { wearHitEquipment } from './itemDurability'
import { cancelPrayerCast } from './prayerCancellation'
import { trainSkill } from './skillProgression'
export interface DamageResolution {
    hpDamage: number
    absorbed: number
    trainableDamage: number
    events: GameEventPayload[]
}
export interface CharacterDamageInput {
    actor: GameCharacter
    target: GameCharacter
    amount: number
    now: number
    damageKind: DamageKind
    respawnDelayMs: number
}
export function resolveCharacterDamage(
    input: CharacterDamageInput
): DamageResolution {
    const { actor, target, now, damageKind } = input
    const result: DamageResolution = {
        hpDamage: 0,
        absorbed: 0,
        trainableDamage: 0,
        events: [],
    }
    if (!canReceiveDamage(input)) {
        return result
    }
    const hostile =
        actor.id !== target.id &&
        actor.faction !== target.faction &&
        canTargetByFaction(actor, target, now)
    absorbDamage(input, result, hostile)
    if (
        actor.id !== target.id &&
        !hostile &&
        !hasDirectRetaliationRight(actor, target, now)
    ) {
        grantRetaliation(target, actor, now + 30_000)
    }
    result.hpDamage = Math.min(target.hp, input.amount - result.absorbed)
    if (result.hpDamage <= 0) {
        return result
    }
    const tainted = Math.min(
        target.abilities.untrainableHpDamage,
        target.maxHp - target.hp
    )
    target.applyDamage(result.hpDamage, now)
    wearHitEquipment(target)
    result.events.push(...cancelPrayerCast(target, now))
    target.abilities.untrainableHpDamage = Math.min(
        target.maxHp - target.hp,
        tainted + (hostile ? 0 : result.hpDamage)
    )
    result.trainableDamage = hostile ? result.hpDamage : 0
    result.events.push({
        kind: 'damage',
        actorId: actor.id,
        targetId: target.id,
        amount: result.hpDamage,
        damageKind,
    })
    finishDamageDeath(input, result.events)
    return result
}
function canReceiveDamage({ target, amount }: CharacterDamageInput): boolean {
    return (
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        Number.isFinite(amount) &&
        amount > 0
    )
}
function absorbDamage(
    input: CharacterDamageInput,
    result: DamageResolution,
    hostile: boolean
): void {
    const { actor, target, now, damageKind } = input
    const barrier = target.abilities.barrier
    if (
        barrier === null ||
        barrier.expiresAt <= now ||
        barrier.remaining <= 0
    ) {
        return
    }
    result.absorbed = Math.min(input.amount, barrier.remaining)
    barrier.remaining -= result.absorbed
    result.events.push({
        kind: 'absorb',
        actorId: actor.id,
        targetId: target.id,
        amount: result.absorbed,
        damageKind,
        statusId: 'barrier',
    })
    if (hostile && !barrier.practiced && result.absorbed > 0) {
        barrier.practiced = true
        result.events.push(...trainSkill(target, 'arcana'))
    }
    if (barrier.remaining <= 0) {
        target.abilities.barrier = null
    }
}
function finishDamageDeath(
    input: CharacterDamageInput,
    events: GameEventPayload[]
): void {
    const { actor, target, now } = input
    if (target.alive) {
        return
    }
    target.abilities.barrier = null
    target.abilities.casting = null
    target.queueRespawn(now, input.respawnDelayMs)
    events.push({ kind: 'death', actorId: actor.id, targetId: target.id })
}
