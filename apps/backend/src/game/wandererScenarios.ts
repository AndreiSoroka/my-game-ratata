import {
    CENTER_LOCATION_ID,
    type ScenarioDefinition,
    type ScenarioStep,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cityResidents } from './cityResidents'
import { findActorPath } from './doorNavigation'
import type { NavigationService } from './navigation'
import { walkableNear } from './workerNavigation'

/** The same scenario runner executes these authored city walks and player orders. */
export function createWandererScenario(
    character: GameCharacter,
    navigation: NavigationService
): ScenarioDefinition | undefined {
    const profile = cityResidents.find(
        (resident) => resident.id === character.id
    )
    const route = profile?.idleRouteTiles
    if (route === undefined) {
        return undefined
    }
    const authored = navigation.grid.cityAnchors
    const destinations =
        authored === undefined
            ? route.map((tile) => navigation.tileToWorld(tile))
            : (profile?.idleRouteAnchors ?? []).map((id) => {
                  const point = authored[id]
                  if (point === undefined) {
                      throw new Error(`Missing city route anchor: ${id}`)
                  }
                  return point
              })
    const points = destinations
        .map((point) => walkableNear(navigation, point))
        .filter(
            (point) =>
                findActorPath(
                    navigation,
                    character,
                    point,
                    character.spawnPosition
                ).length > 0
        )
    const shelter = points[0]
    if (shelter === undefined) {
        return undefined
    }
    return {
        id: `idle-${character.id}`,
        name: 'Прогулка по Новогороду',
        repeat: null,
        sequences: [
            {
                id: 'shelter',
                name: 'Укрытие',
                steps: [waypoint('retreat', shelter)],
            },
        ],
        reactions: [
            {
                id: 'danger',
                trigger: { kind: 'enemy_visible', distanceTiles: 15 },
                sequenceId: 'shelter',
            },
        ],
        main: points.flatMap((position, index) => [
            waypoint(`walk-${String(index)}`, position),
            {
                id: `rest-${String(index)}`,
                kind: 'wait' as const,
                durationMs: 2500,
            },
        ]),
    }
}

function waypoint(id: string, position: Vector2): ScenarioStep {
    return {
        id,
        kind: 'go',
        destination: {
            kind: 'point',
            locationId: CENTER_LOCATION_ID,
            position,
        },
    }
}
