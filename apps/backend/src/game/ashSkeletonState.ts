import type {
    CharacterFactionId,
    SkeletonOrder,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

export interface AshSkeletonOrder {
    ownerId: string
    ownerFaction: CharacterFactionId
    ownerAshPact: boolean
    kind: Exclude<SkeletonOrder, 'wander'>
    locationId: string
    anchor: Vector2
}

const orders = new WeakMap<GameCharacter, AshSkeletonOrder>()
const summons = new WeakMap<GameCharacter, string>()
const wanderingSummons = new WeakSet<GameCharacter>()
const grantedGifts = new WeakSet<GameCharacter>()

export function ashSkeletonOrder(
    actor: GameCharacter
): AshSkeletonOrder | undefined {
    return orders.get(actor)
}

export function setAshSkeletonOrder(
    actor: GameCharacter,
    order: AshSkeletonOrder | undefined
): void {
    if (order === undefined) {
        orders.delete(actor)
    } else {
        orders.set(actor, order)
        wanderingSummons.delete(actor)
    }
}

export function ashSummoner(actor: GameCharacter): string | undefined {
    return summons.get(actor)
}

export function markAshSummon(actor: GameCharacter, ownerId: string): void {
    summons.set(actor, ownerId)
}

export function ashSummonWanders(actor: GameCharacter): boolean {
    return wanderingSummons.has(actor)
}

export function allowAshSummonWandering(actor: GameCharacter): void {
    if (summons.has(actor)) {
        wanderingSummons.add(actor)
    }
}

export function hasAshGift(actor: GameCharacter): boolean {
    return grantedGifts.has(actor)
}

export function applyAshGift(actor: GameCharacter, bonus: number): void {
    const previous = actor.maxHp
    actor.baseMaxHp *= 1 + bonus
    actor.hp += actor.maxHp - previous
    grantedGifts.add(actor)
}

export function ashActorAvailable(actor: GameCharacter): boolean {
    return (
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (actor.controllerKind !== 'network_player' || actor.connected)
    )
}
