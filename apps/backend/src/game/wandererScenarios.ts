import {
    CENTER_LOCATION_ID,
    type ScenarioDefinition,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cityResidents } from './cityResidents'
import type { NavigationService } from './navigation'
import { walkableNear } from './workerNavigation'

/** The same scenario runner executes these authored city walks and player orders. */
export function createWandererScenario(
    character: GameCharacter,
    navigation: NavigationService
): ScenarioDefinition | undefined {
    const route = cityResidents.find(
        (resident) => resident.id === character.id
    )?.idleRouteTiles
    if (route === undefined) {
        return undefined
    }
    const points = route
        .map((tile) => walkableNear(navigation, navigation.tileToWorld(tile)))
        .filter(
            (point) =>
                navigation.findPathWorld(character.spawnPosition, point)
                    .length > 0
        )
    return {
        id: `idle-${character.id}`,
        name: 'Прогулка по Новогороду',
        repeat: null,
        threat: 'flee',
        steps: points.flatMap((position, index) => [
            {
                id: `walk-${String(index)}`,
                kind: 'go' as const,
                destination: {
                    kind: 'point' as const,
                    locationId: CENTER_LOCATION_ID,
                    position,
                },
            },
            {
                id: `rest-${String(index)}`,
                kind: 'wait' as const,
                durationMs: 2500,
            },
        ]),
    }
}
