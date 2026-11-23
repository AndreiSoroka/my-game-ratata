import type { GameCharacter } from './character'

/** A private motive makes targeting possible without granting legal retaliation rights. */
const motives = new WeakMap<
    GameCharacter,
    WeakMap<GameCharacter, Map<string, number>>
>()
const declarations = new WeakMap<GameCharacter, WeakSet<GameCharacter>>()
type HostileGroup = 'living_humans'
const groups = new WeakMap<GameCharacter, Set<HostileGroup>>()

export function setDeclaredHostility(
    actor: GameCharacter,
    target: GameCharacter,
    hostile: boolean
): void {
    if (!hostile) {
        declarations.get(actor)?.delete(target)
        return
    }
    const targets = declarations.get(actor) ?? new WeakSet<GameCharacter>()
    targets.add(target)
    declarations.set(actor, targets)
}

export function hasDeclaredHostility(
    actor: GameCharacter,
    target: GameCharacter
): boolean {
    return declarations.get(actor)?.has(target) === true
}

export function setGroupHostility(
    actor: GameCharacter,
    group: HostileGroup,
    hostile: boolean
): void {
    if (!hostile) {
        groups.get(actor)?.delete(group)
        return
    }
    const active = groups.get(actor) ?? new Set<HostileGroup>()
    active.add(group)
    groups.set(actor, active)
}

export function isLivingHuman(actor: GameCharacter): boolean {
    return (
        actor.alive &&
        actor.archetype === 'human' &&
        actor.creatureType === 'humanoid'
    )
}

export function hasGroupHostility(
    actor: GameCharacter,
    target: GameCharacter
): boolean {
    return (
        actor !== target &&
        groups.get(actor)?.has('living_humans') === true &&
        isLivingHuman(target)
    )
}

export function grantPersonalHostility(
    actor: GameCharacter,
    target: GameCharacter,
    cause: string,
    until: number
): void {
    const targets =
        motives.get(actor) ?? new WeakMap<GameCharacter, Map<string, number>>()
    const causes = targets.get(target) ?? new Map<string, number>()
    causes.set(cause, Math.max(causes.get(cause) ?? 0, until))
    targets.set(target, causes)
    motives.set(actor, targets)
}

export function hasPersonalHostility(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    cause?: string
): boolean {
    const causes = motives.get(actor)?.get(target)
    if (causes === undefined) {
        return false
    }
    if (cause !== undefined) {
        return (causes.get(cause) ?? 0) > now
    }
    for (const until of causes.values()) {
        if (until > now) {
            return true
        }
    }
    return false
}

export function revokePersonalHostility(
    actor: GameCharacter,
    target: GameCharacter,
    cause: string
): void {
    motives.get(actor)?.get(target)?.delete(cause)
}
