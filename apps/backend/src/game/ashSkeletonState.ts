import type {
    CharacterFactionId,
    SkeletonOrder,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { clearPursuit, territories } from './pursuitState'

export interface AshSkeletonOrder {
    ownerId: string
    ownerFaction: CharacterFactionId
    ownerAshPact: boolean
    kind: Exclude<SkeletonOrder, 'wander'>
    locationId: string
    anchor: Vector2
}

export interface AshSkeletonBond {
    owner: GameCharacter
    deathSequence: number
    guard?: { locationId: string; position: Vector2 }
}

const orders = new WeakMap<GameCharacter, AshSkeletonOrder>()
const summons = new WeakMap<GameCharacter, string>()
const wanderingSummons = new WeakSet<GameCharacter>()
const grantedGifts = new WeakSet<GameCharacter>()
const bonds = new WeakMap<GameCharacter, AshSkeletonBond>()
const followers = new WeakMap<GameCharacter, Set<GameCharacter>>()
const attackOrders = new WeakMap<GameCharacter, GameCharacter>()

export function ashSkeletonBond(
    actor: GameCharacter
): AshSkeletonBond | undefined {
    const bond = bonds.get(actor)
    if (
        bond !== undefined &&
        (bond.deathSequence !== actor.deathSequence ||
            bond.owner.tags.has('state.retired'))
    ) {
        releaseAshSkeleton(actor)
        return undefined
    }
    return bond
}

export function releaseAshSkeleton(actor: GameCharacter): void {
    const bond = bonds.get(actor)
    if (bond !== undefined) {
        followers.get(bond.owner)?.delete(actor)
        bonds.delete(actor)
        orders.delete(actor)
        attackOrders.delete(actor)
    }
}

export function ashBoundSkeletons(owner: GameCharacter): GameCharacter[] {
    return [...(followers.get(owner) ?? [])].filter(
        (actor) => ashSkeletonBond(actor)?.owner === owner && actor.alive
    )
}

export function bindAshSkeleton(
    actor: GameCharacter,
    owner: GameCharacter,
    guard?: AshSkeletonBond['guard']
): void {
    const group = followers.get(owner) ?? new Set<GameCharacter>()
    group.add(actor)
    followers.set(owner, group)
    bonds.set(actor, {
        owner,
        deathSequence: actor.deathSequence,
        ...(guard === undefined ? {} : { guard }),
    })
    orders.delete(actor)
    territories.delete(actor)
    actor.tags.delete('grave.guardian')
    cancelCharacterControl(actor)
    clearPursuit(actor)
    actor.clearPendingAttackHit()
}

export function guardAshSkeleton(
    actor: GameCharacter,
    guard: NonNullable<AshSkeletonBond['guard']>
): void {
    const bond = ashSkeletonBond(actor)
    if (bond !== undefined) {
        bond.guard = guard
        orders.delete(actor)
    }
}

export function ashSkeletonGuard(
    actor: GameCharacter
): AshSkeletonBond['guard'] {
    const order = ashSkeletonOrder(actor)
    if (order === undefined) {
        return ashSkeletonBond(actor)?.guard
    }
    return order.kind === 'guard'
        ? { locationId: order.locationId, position: order.anchor }
        : undefined
}

export function ashSkeletonOwnerId(actor: GameCharacter): string | undefined {
    return (
        ashSkeletonBond(actor)?.owner.id ??
        ashSummoner(actor) ??
        ashSkeletonOrder(actor)?.ownerId
    )
}

export function ashAssaultTarget(
    actor: GameCharacter
): GameCharacter | undefined {
    return attackOrders.get(actor)
}

export function directAshAssault(
    actor: GameCharacter,
    target: GameCharacter | undefined
): void {
    if (attackOrders.get(actor) === target) {
        return
    }
    if (target === undefined) {
        attackOrders.delete(actor)
    } else {
        attackOrders.set(actor, target)
    }
    actor.clearPath()
    actor.clearPendingAttackHit()
}

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
