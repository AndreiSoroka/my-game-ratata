import type {
    AgentDecision,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    CHEST_INTERACTION_RANGE,
    containerBounds,
    DOOR_INTERACTION_RANGE,
    doorActionForState,
    doorApproachPoints,
    FARM_INTERACTION_RANGE,
    interactionApproachPoints,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { distance } from '../game/math'
import type { NavigationService } from '../game/navigation'
import type { NpcAiTarget } from './observationTypes'

interface EnvironmentTarget extends Omit<
    NpcAiTarget,
    'key' | 'distance' | 'commands'
> {
    command: AgentDecision
}
type Approach = (areas: readonly WorldObjectBounds[]) => Vector2 | undefined

export function environmentTargets(
    snapshot: WorldSnapshot,
    actor: GameCharacter,
    navigation: NavigationService,
    visible: (point: Vector2) => boolean
): NpcAiTarget[] {
    const approach: Approach = (areas) =>
        interactionApproachPoints(actor.position, areas, 8).find(
            (point) =>
                !navigation.isSolidTile(navigation.worldToTile(point)) &&
                visible(point)
        )
    return [
        ...itemTargets(snapshot),
        ...chestTargets(snapshot, approach),
        ...worldTargets(snapshot, actor, visible, approach),
        ...resourceTargets(snapshot, actor.locationId, approach),
        ...farmTargets(snapshot, actor.locationId),
    ].flatMap(({ command, ...target }) => {
        if (!visible(target.position)) {
            return []
        }
        const range = distance(actor.position, target.position)
        return [
            {
                ...target,
                key: `${target.kind}:${target.id}`,
                position: { ...target.position },
                distance: range,
                commands: [
                    {
                        type: 'move_to' as const,
                        target: { ...target.position },
                    },
                    ...(range <= target.interactionRange ? [command] : []),
                ],
            },
        ]
    })
}

function itemTargets(snapshot: WorldSnapshot): EnvironmentTarget[] {
    return snapshot.items.map((item) => ({
        kind: 'item',
        id: item.id,
        name: item.itemId,
        position: item.position,
        interactionRange: 24,
        command: { type: 'pickup_item', worldItemId: item.id },
        details: { itemId: item.itemId, quantity: item.quantity ?? 1 },
    }))
}

function chestTargets(
    snapshot: WorldSnapshot,
    approach: Approach
): EnvironmentTarget[] {
    return snapshot.chests.flatMap((chest) => {
        const point = approach([
            chest.bounds ?? containerBounds(chest.position),
        ])
        return point === undefined
            ? []
            : [
                  {
                      kind: 'chest',
                      id: chest.id,
                      name: chest.title ?? 'Сундук',
                      position: point,
                      interactionRange: CHEST_INTERACTION_RANGE,
                      command: { type: 'open_chest', chestId: chest.id },
                      details: {
                          kind: chest.kind ?? 'chest',
                          state: chest.state,
                      },
                  },
              ]
    })
}

function worldTargets(
    snapshot: WorldSnapshot,
    actor: GameCharacter,
    visible: (point: Vector2) => boolean,
    approach: Approach
): EnvironmentTarget[] {
    return (snapshot.adventure?.worldObjects ?? []).flatMap((object) => {
        const door = object.door?.state
        const point =
            door === undefined
                ? approach(object.interactionAreas ?? [object.bounds])
                : doorApproachPoints(object.bounds, door)
                      .filter(visible)
                      .sort(
                          (a, b) =>
                              distance(actor.position, a) -
                              distance(actor.position, b)
                      )[0]
        return point === undefined
            ? []
            : [
                  {
                      kind: 'world',
                      id: object.id,
                      name: object.name,
                      position: point,
                      interactionRange:
                          door === undefined ? 48 : DOOR_INTERACTION_RANGE,
                      command: {
                          type: 'world_interact',
                          objectId: object.id,
                          ...(door === undefined
                              ? {}
                              : { doorAction: doorActionForState(door) }),
                      },
                      details: {
                          kind: object.kind,
                          depleted: object.depleted,
                          ...(door === undefined ? {} : { state: door }),
                      },
                  },
              ]
    })
}

function resourceTargets(
    snapshot: WorldSnapshot,
    locationId: string,
    approach: Approach
): EnvironmentTarget[] {
    return (snapshot.adventure?.resourceNodes ?? []).flatMap((resource) => {
        if (
            resource.locationId !== locationId ||
            resource.phase === 'removed'
        ) {
            return []
        }
        const bounds = resource.collisionBounds ?? resource.bounds
        const point =
            bounds === undefined ? resource.position : approach([bounds])
        return point === undefined
            ? []
            : [
                  {
                      kind: 'resource',
                      id: resource.id,
                      name: resource.kind,
                      position: point,
                      interactionRange: 48,
                      command: { type: 'gather', nodeId: resource.id },
                      details: {
                          kind: resource.kind,
                          phase: resource.phase,
                          remaining: resource.remaining,
                      },
                  },
              ]
    })
}

function farmTargets(
    snapshot: WorldSnapshot,
    locationId: string
): EnvironmentTarget[] {
    return (snapshot.adventure?.farmPlots ?? [])
        .filter((plot) => plot.locationId === locationId)
        .map((plot) => ({
            kind: 'farm',
            id: plot.id,
            name: plot.name,
            position: plot.position,
            interactionRange: FARM_INTERACTION_RANGE,
            command: {
                type: 'farm_action',
                plotId: plot.id,
                action: plot.phase === 'ripe' ? 'harvest' : 'sow',
            },
            details: { phase: plot.phase, crop: plot.crop },
        }))
}
