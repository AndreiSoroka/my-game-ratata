import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

// The reason belongs to the offender; mutual fighting rights do not merge two separate crimes.
const retaliation = new WeakMap<GameCharacter, WeakMap<GameCharacter, number>>()
const damageAuthority = Symbol('damageRetaliation')
type RetaliationDamage = GameEventPayload & { [damageAuthority]?: boolean }

/** Capture legal authority before an impact can grant its recipient a new right. */
export function markDamageRetaliation(
    event: GameEventPayload,
    authorized: boolean
): GameEventPayload {
    const marked: RetaliationDamage = event
    marked[damageAuthority] = authorized
    return marked
}

export function damageRetaliation(
    event: RetaliationDamage
): boolean | undefined {
    return event[damageAuthority]
}

export function grantRetaliation(
    defender: GameCharacter,
    offender: GameCharacter,
    until: number
): void {
    const defenders =
        retaliation.get(offender) ?? new WeakMap<GameCharacter, number>()
    defenders.set(defender, Math.max(defenders.get(defender) ?? 0, until))
    retaliation.set(offender, defenders)
}

export function hasRetaliationRight(
    actor: GameCharacter,
    target: GameCharacter,
    now = Date.now()
): boolean {
    return (
        Math.max(
            retaliation.get(actor)?.get(target) ?? 0,
            retaliation.get(target)?.get(actor) ?? 0
        ) > now
    )
}

/** A lawful response must not manufacture a second offense owned by the defender. */
export function hasDirectRetaliationRight(
    defender: GameCharacter,
    offender: GameCharacter,
    now = Date.now()
): boolean {
    return (retaliation.get(offender)?.get(defender) ?? 0) > now
}

export function revokeRetaliation(
    offender: GameCharacter,
    defender: GameCharacter
): void {
    retaliation.get(offender)?.delete(defender)
}
