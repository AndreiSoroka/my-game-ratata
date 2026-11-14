import type {
    AdventureResourceNode,
    ItemId,
    ScenarioSearchKind,
    Vector2,
    WorldChestSnapshot,
    WorldItemSnapshot,
} from '@my-game-ratata/contracts'
import { chestInteractionDistance } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { chestHasLineOfSight } from './chestInteraction'
import { distance } from './math'
import type { GameRoom } from './room'

export interface ScenarioTarget {
    id: string
    position: Vector2
    resource?: AdventureResourceNode
    chest?: WorldChestSnapshot
    item?: WorldItemSnapshot
    character?: GameCharacter
    farmId?: string
}
export function visibleScenarioTargets(
    actor: GameCharacter,
    room: GameRoom,
    kind: ScenarioSearchKind,
    itemId?: ItemId,
    now = Date.now()
): ScenarioTarget[] {
    if (kind === 'enemy') {
        const target = room.findVisibleTarget(actor, 240, now)
        return target === undefined
            ? []
            : [{ id: target.id, position: target.position, character: target }]
    }
    const navigation = room.navigationFor(actor)
    const environment = room.scenarioEnvironment(actor)
    const targets = environmentalTargets(actor, room, kind, itemId, now)
    const visible = (point: Vector2) =>
        distance(actor.position, point) <= 240 &&
        navigation.hasLineOfSight(actor.position, point)
    if (kind === 'chest') {
        targets.push(
            ...environment.chests
                .filter((chest) => chest.kind !== 'corpse')
                .map((chest) => ({
                    id: chest.id,
                    position: chest.position,
                    chest,
                }))
        )
    }
    if (kind === 'item') {
        targets.push(
            ...environment.items
                .filter(
                    (item) => itemId === undefined || item.itemId === itemId
                )
                .map((item) => ({ id: item.id, position: item.position, item }))
        )
    }
    return targets
        .filter(
            (target) =>
                visible(target.position) ||
                resourceEdgeVisible(actor, target.resource, room) ||
                chestEdgeVisible(actor, target.chest, room)
        )
        .sort(
            (a, b) =>
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
        )
}
function chestEdgeVisible(
    actor: GameCharacter,
    chest: WorldChestSnapshot | undefined,
    room: GameRoom
): boolean {
    return (
        chest !== undefined &&
        chestInteractionDistance(
            actor.position,
            chest.position,
            chest.bounds
        ) <= 240 &&
        chestHasLineOfSight(
            actor.position,
            chest.position,
            room.navigationFor(actor),
            240,
            chest.bounds
        )
    )
}
function environmentalTargets(
    actor: GameCharacter,
    room: GameRoom,
    kind: ScenarioSearchKind,
    itemId: ItemId | undefined,
    now: number
): ScenarioTarget[] {
    const material = kind === 'tree' ? 'wood' : kind
    const service = room.adventureForWorkers()
    const targets: ScenarioTarget[] = service
        .resourceSnapshot(actor.locationId)
        .filter(
            (node) =>
                node.kind === material &&
                node.remaining > 0 &&
                (node.phase === undefined || node.phase === 'ready') &&
                (itemId === undefined || node.kind === itemId)
        )
        .map((resource) => ({
            id: resource.id,
            position: resource.position,
            resource,
        }))
    if (kind === 'grain') {
        targets.push(
            ...service
                .farmSnapshot(actor.locationId, now)
                .filter((plot) => plot.phase === 'ripe')
                .map((plot) => ({
                    id: plot.id,
                    position: plot.position,
                    farmId: plot.id,
                }))
        )
    }
    return targets
}
function resourceEdgeVisible(
    actor: GameCharacter,
    node: AdventureResourceNode | undefined,
    room: GameRoom
): boolean {
    const bounds = node?.bounds
    if (bounds === undefined) {
        return false
    }
    const point = {
        x: Math.max(
            bounds.x - 1,
            Math.min(actor.position.x, bounds.x + bounds.width + 1)
        ),
        y: Math.max(
            bounds.y - 1,
            Math.min(actor.position.y, bounds.y + bounds.height + 1)
        ),
    }
    return (
        distance(actor.position, point) <= 240 &&
        room.navigationFor(actor).hasLineOfSight(actor.position, point)
    )
}
