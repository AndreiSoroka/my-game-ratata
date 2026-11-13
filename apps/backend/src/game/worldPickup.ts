import type {
    GameEventPayload,
    PickupItemClientMessage,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { addInventoryItem, type InventoryItemInstance } from './inventory'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { canPerformSkillAction } from './skillProgression'

const pickupRadius = 24

export interface LooseWorldItem {
    id: string
    item: InventoryItemInstance
    position: Vector2
}

export type PickupRequest = (
    actor: GameCharacter,
    worldItemId: string | undefined,
    now: number
) => GameEventPayload[]

export function parsePickupCommand(
    record: Record<string, unknown>
): PickupItemClientMessage | undefined {
    if (!Object.hasOwn(record, 'worldItemId')) {
        return { type: 'pickup_item' }
    }
    const id = record['worldItemId']
    return typeof id === 'string' && id.trim().length > 0 && id.length <= 100
        ? { type: 'pickup_item', worldItemId: id }
        : undefined
}

export function pickupWorldItem(
    actor: GameCharacter,
    items: Map<string, LooseWorldItem>,
    locationId: string,
    worldItemId: string | undefined,
    now: number,
    navigation?: NavigationService
): GameEventPayload[] {
    if (
        actor.locationId !== locationId ||
        !canPerformSkillAction(actor, now) ||
        actor.tags.has('state.retired')
    ) {
        return []
    }
    const item =
        worldItemId === undefined
            ? nearestItem(actor.position, items.values(), navigation)
            : items.get(worldItemId)
    if (
        item === undefined ||
        distance(actor.position, item.position) > pickupRadius ||
        (navigation !== undefined &&
            !navigation.hasLineOfSight(actor.position, item.position)) ||
        !addInventoryItem(actor.inventory, item.item)
    ) {
        return []
    }
    items.delete(item.id)
    return [
        { actorId: actor.id, itemId: item.item.itemId, kind: 'item_pickup' },
    ]
}

function nearestItem(
    position: Vector2,
    items: Iterable<LooseWorldItem>,
    navigation?: NavigationService
): LooseWorldItem | undefined {
    return [...items]
        .map((item) => ({ distance: distance(position, item.position), item }))
        .filter(
            (candidate) =>
                candidate.distance <= pickupRadius &&
                (navigation === undefined ||
                    navigation.hasLineOfSight(
                        position,
                        candidate.item.position
                    ))
        )
        .sort((a, b) => a.distance - b.distance)[0]?.item
}
