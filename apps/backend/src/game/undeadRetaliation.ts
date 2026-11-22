import type { GameCharacter } from './character'

export interface RetaliationEffect {
    damageBonus: number
    durationMs: number
}

interface RetaliationFocus {
    actorDeath: number
    targetDeath: number
    targetId: string
    locationId: string
    until: number
    damageBonus: number
}

const retaliation = new WeakMap<GameCharacter, RetaliationFocus>()

export function rememberUndeadAttacker(
    defender: GameCharacter,
    attacker: GameCharacter,
    effect: RetaliationEffect,
    now: number
): void {
    retaliation.set(defender, {
        actorDeath: defender.deathSequence,
        targetDeath: attacker.deathSequence,
        targetId: attacker.id,
        locationId: defender.locationId,
        until: now + effect.durationMs,
        damageBonus: effect.damageBonus,
    })
}

export function undeadRetaliationFocus(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): RetaliationFocus | undefined {
    const focus = retaliation.get(actor)
    return focus?.actorDeath === actor.deathSequence &&
        focus.targetId === target.id &&
        focus.targetDeath === target.deathSequence &&
        focus.locationId === actor.locationId &&
        focus.until > now
        ? focus
        : undefined
}

export function consumeUndeadRetaliation(
    actor: GameCharacter,
    focus: RetaliationFocus | undefined
): void {
    if (focus !== undefined && retaliation.get(actor) === focus) {
        retaliation.delete(actor)
    }
}
