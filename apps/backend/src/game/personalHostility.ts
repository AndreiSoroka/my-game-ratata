import type { GameCharacter } from './character'

/** A private motive makes targeting possible without granting legal retaliation rights. */
const motives = new WeakMap<
    GameCharacter,
    WeakMap<GameCharacter, { cause: string; until: number }>
>()

export function grantPersonalHostility(
    actor: GameCharacter,
    target: GameCharacter,
    cause: string,
    until: number
): void {
    const targets = motives.get(actor) ?? new WeakMap()
    targets.set(target, { cause, until })
    motives.set(actor, targets)
}

export function hasPersonalHostility(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): boolean {
    return (motives.get(actor)?.get(target)?.until ?? 0) > now
}

export function revokePersonalHostility(
    actor: GameCharacter,
    target: GameCharacter,
    cause: string
): void {
    const targets = motives.get(actor)
    if (targets?.get(target)?.cause === cause) {
        targets.delete(target)
    }
}
