import {
    CHEST_CAPACITY,
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    containerBounds,
    type ContainerKind,
    FARM_SUPPLY_CHESTS,
    type GameEventPayload,
    type Vector2,
    type WorldChestSnapshot,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { breakHeartSeal } from './heartSeals'
import {
    canAddInventoryItems,
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
    transferInventoryItem,
    transferInventoryQuantity,
} from './inventory'
import { resetMartyrStreak } from './martyr'
import { clamp, distance } from './math'
import type { NavigationService } from './navigation'
import { overlaps } from './resourcePlacement'
import { availableInventoryQuantity } from './rewardReservations'
import { canPerformSkillAction } from './skillProgression'
import {
    dropPosition,
    generateChestContents,
    generateFarmSupplyContents,
} from './worldInventoryHelpers'
import { withWorldSound } from './worldSound'

export function chestOpenRefusal(
    actor: GameCharacter,
    position: Vector2,
    navigation: NavigationService,
    locationId: string,
    now: number,
    bounds?: WorldObjectBounds
): string | undefined {
    if (!canPerformSkillAction(actor, now) || actor.tags.has('state.retired')) {
        return 'Сейчас сундук открыть нельзя.'
    }
    if (actor.locationId !== locationId) {
        return 'Сундук недоступен в этой локации.'
    }
    if (
        chestInteractionDistance(actor.position, position, bounds) >
        CHEST_INTERACTION_RANGE
    ) {
        return 'Подойди к сундуку ближе, чтобы открыть его.'
    }
    return chestHasLineOfSight(
        actor.position,
        position,
        navigation,
        CHEST_INTERACTION_RANGE + 1,
        bounds
    )
        ? undefined
        : 'К сундуку нельзя дотянуться через преграду.'
}

export function chestHasLineOfSight(
    actor: Vector2,
    position: Vector2,
    navigation: NavigationService,
    maxDistance = Number.POSITIVE_INFINITY,
    bounds = containerBounds(position)
): boolean {
    const left = bounds.x,
        right = bounds.x + bounds.width
    const top = bounds.y,
        bottom = bounds.y + bounds.height
    const x = clamp(actor.x, left, right),
        y = clamp(actor.y, top, bottom)
    // A solid chest blocks its center. Reach an exterior edge without letting
    // the line cross the chest itself or a wall between the actor and that edge.
    const edges = [
        { x, y: top - 1 },
        { x, y: bottom + 1 },
        { x: left - 1, y },
        { x: right + 1, y },
    ]
    return edges.some(
        (edge) =>
            distance(actor, edge) <= maxDistance &&
            !navigation.isSolidTile(navigation.worldToTile(edge)) &&
            navigation.hasLineOfSight(actor, edge)
    )
}

export function chestRefusalNotice(
    actorId: string,
    text: string
): GameEventPayload[] {
    return [{ kind: 'notice', actorId, audienceIds: [actorId], text }]
}

export interface WorldChest {
    ashRemains?: {
        readyAt: number
        expiresAt: number
        death?: { actor: GameCharacter; sequence: number }
    }
    kind?: ContainerKind
    propId?: string
    bounds?: WorldObjectBounds
    title?: string
    gold?: number
    corpse?: NonNullable<WorldChestSnapshot['corpse']>
    contents: InventoryItemInstance[]
    id: string
    opened: boolean
    position: Vector2
}

export function chestCapacity(chest: WorldChest): number | undefined {
    return chest.kind === undefined || chest.kind === 'chest'
        ? CHEST_CAPACITY
        : undefined
}

export function chestHasLoot(chest: WorldChest): boolean {
    return chest.contents.length > 0 || (chest.gold ?? 0) > 0
}

export function transferToChest(
    actor: GameCharacter,
    chest: WorldChest,
    instanceId: string,
    quantity?: number
): InventoryItemInstance | 'full' | undefined {
    const capacity = chestCapacity(chest) ?? Infinity
    const source = actor.inventory
    const destination = chest.contents
    const transferred =
        quantity === undefined
            ? transferInventoryItem(source, destination, instanceId, capacity)
            : transferInventoryQuantity(
                  source,
                  destination,
                  instanceId,
                  quantity,
                  capacity
              )
    if (transferred !== undefined || capacity === Infinity) {
        return transferred
    }
    const item = source.find((entry) => entry.instanceId === instanceId)
    if (item === undefined) {
        return undefined
    }
    // Only report capacity if this deposit would otherwise be allowed.
    const amount = quantity ?? itemQuantity(item)
    return amount <= availableInventoryQuantity(source, instanceId) &&
        canAddInventoryItems(
            destination,
            [{ ...item, quantity: amount }],
            Infinity
        )
        ? 'full'
        : undefined
}

export function chestPickup(
    actor: GameCharacter,
    chest: WorldChest,
    item: InventoryItemInstance
): GameEventPayload {
    breakHeartSeal(chest, item.instanceId)
    resetMartyrStreak(actor)
    return {
        kind: 'item_pickup',
        actorId: actor.id,
        chestId: chest.id,
        itemId: item.itemId,
        audienceIds: [actor.id],
    }
}

export function revealChestContents(
    actor: GameCharacter,
    chest: WorldChest,
    drop: (item: InventoryItemInstance, position: Vector2) => void
): GameEventPayload[] {
    if (chest.opened && chest.contents.length === 0) {
        return []
    }
    const contents = chest.contents.splice(0)
    chest.opened = true
    for (const [index, item] of contents.entries()) {
        breakHeartSeal(chest, item.instanceId)
        drop(item, dropPosition(chest.position, index))
    }
    return [chestOpened(actor, chest)]
}

export function chestOpened(
    actor: GameCharacter,
    chest: WorldChest
): GameEventPayload {
    return withWorldSound(
        { actorId: actor.id, chestId: chest.id, kind: 'chest_open' },
        'chestOpen',
        actor.locationId,
        chest.position,
        { sourceBounds: chest.bounds ?? containerBounds(chest.position) }
    )
}

export function findNearestChest(
    chests: Iterable<WorldChest>,
    position: Vector2
): WorldChest | undefined {
    return [...chests]
        .map((chest) => ({
            chest,
            distance: chestInteractionDistance(
                position,
                chest.position,
                chest.bounds
            ),
        }))
        .filter((candidate) => candidate.distance <= CHEST_INTERACTION_RANGE)
        .sort((a, b) => a.distance - b.distance)[0]?.chest
}

export function createWorldChests(
    navigation: NavigationService,
    locationId = navigation.grid.id,
    random: () => number = Math.random
): Map<string, WorldChest> {
    const chests = new Map<string, WorldChest>()
    const authoredContainers = navigation.grid.containers ?? []
    const farmChests = FARM_SUPPLY_CHESTS.filter(
        (chest) => chest.locationId === locationId
    )
    const occupied = [
        ...authoredContainers.map((container) => container.bounds),
        ...farmChests.map((chest) => containerBounds(chest.position)),
    ]
    const large = navigation.grid.width >= 64 && navigation.grid.height >= 64
    const tiles = large
        ? [
              { x: 50, y: 43 },
              { x: 20, y: 20 },
              { x: 74, y: 20 },
              { x: 20, y: 60 },
              { x: 74, y: 60 },
          ]
        : [{ x: 6, y: 4 }]
    for (const [index, preferred] of tiles.entries()) {
        const tile = navigation.findWalkableTileNear(preferred, (candidate) => {
            const bounds = containerBounds(navigation.tileToWorld(candidate))
            return (
                navigation
                    .cellsInBounds(bounds)
                    .every((cell) => navigation.grid.solid[cell] !== true) &&
                !occupied.some((area) => overlaps(area, bounds)) &&
                navigation.walkableNeighbors(candidate).length > 0
            )
        })
        if (tile === undefined) {
            continue
        }
        const id = `chest_forest_${String(index + 1)}`
        const position = navigation.tileToWorld(tile)
        occupied.push(containerBounds(position))
        chests.set(id, {
            contents: generateChestContents(large && index === 0, random),
            id,
            opened: false,
            position,
        })
    }
    for (const definition of farmChests) {
        chests.set(definition.id, {
            contents: generateFarmSupplyContents(random),
            id: definition.id,
            position: { ...definition.position },
            opened: false,
        })
    }
    for (const definition of authoredContainers) {
        const { bounds, contents, ...metadata } = definition
        if (chests.has(definition.id)) {
            throw new Error(`Duplicate container: ${definition.id}`)
        }
        chests.set(definition.id, {
            ...metadata,
            bounds: { ...bounds },
            position: {
                x: bounds.x + bounds.width / 2,
                y: bounds.y + bounds.height / 2,
            },
            contents: contents.flatMap(({ itemId, quantity }) =>
                Array.from({ length: quantity }, () =>
                    createItemInstance(itemId)
                )
            ),
            opened: false,
        })
    }
    return chests
}
