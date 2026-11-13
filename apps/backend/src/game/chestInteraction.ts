import {
    CHEST_FOOTPRINT_SIZE,
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    type GameEventPayload,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { InventoryItemInstance } from './inventory'
import { clamp, distance } from './math'
import type { NavigationService } from './navigation'
import { canPerformSkillAction } from './skillProgression'
import { dropPosition, generateChestContents } from './worldInventoryHelpers'

export function chestOpenRefusal(
    actor: GameCharacter,
    position: Vector2,
    navigation: NavigationService,
    locationId: string,
    now: number
): string | undefined {
    if (!canPerformSkillAction(actor, now) || actor.tags.has('state.retired')) {
        return 'Сейчас сундук открыть нельзя.'
    }
    if (actor.locationId !== locationId) {
        return 'Сундук недоступен в этой локации.'
    }
    if (
        chestInteractionDistance(actor.position, position) >
        CHEST_INTERACTION_RANGE
    ) {
        return 'Подойди к сундуку ближе, чтобы открыть его.'
    }
    return chestHasLineOfSight(
        actor.position,
        position,
        navigation,
        CHEST_INTERACTION_RANGE + 1
    )
        ? undefined
        : 'К сундуку нельзя дотянуться через преграду.'
}

export function chestHasLineOfSight(
    actor: Vector2,
    position: Vector2,
    navigation: NavigationService,
    maxDistance = Number.POSITIVE_INFINITY
): boolean {
    const half = CHEST_FOOTPRINT_SIZE / 2
    const left = position.x - half,
        right = position.x + half
    const top = position.y - half,
        bottom = position.y + half
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
    contents: InventoryItemInstance[]
    id: string
    opened: boolean
    position: Vector2
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
        drop(item, dropPosition(chest.position, index))
    }
    return [{ actorId: actor.id, chestId: chest.id, kind: 'chest_open' }]
}

export function findNearestChest(
    chests: Iterable<WorldChest>,
    position: Vector2
): WorldChest | undefined {
    return [...chests]
        .map((chest) => ({
            chest,
            distance: chestInteractionDistance(position, chest.position),
        }))
        .filter((candidate) => candidate.distance <= CHEST_INTERACTION_RANGE)
        .sort((a, b) => a.distance - b.distance)[0]?.chest
}

export function createWorldChests(
    navigation: NavigationService
): Map<string, WorldChest> {
    const chests = new Map<string, WorldChest>()
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
    for (const [index, tile] of tiles.entries()) {
        const id = `chest_forest_${String(index + 1)}`
        chests.set(id, {
            contents: generateChestContents(large && index === 0),
            id,
            opened: false,
            position: navigation.tileToWorld(tile),
        })
    }
    return chests
}
