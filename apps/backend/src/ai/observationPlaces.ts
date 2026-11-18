import type { AgentDecision, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import {
    containsBuildingPoint,
    type MapBuildingDefinition,
} from '../game/mapBuildings'
import { distance } from '../game/math'
import type { NavigationService } from '../game/navigation'
import { knownGuidePlaces } from './guideTargets'
import type { NpcAiTarget } from './observationTypes'

const moveTo = (target: Vector2): AgentDecision => ({
    type: 'move_to',
    target: { ...target },
})
export function buildingTargets(
    buildings: readonly MapBuildingDefinition[],
    actor: GameCharacter
): NpcAiTarget[] {
    return buildings.map((building) => ({
        key: `building:${building.id}`,
        kind: 'building',
        id: building.id,
        name: building.name,
        position: { ...building.entry },
        distance: distance(actor.position, building.entry),
        interactionRange: 0,
        commands: [
            moveTo(building.entry),
            moveTo(building.interior),
            { type: 'guide', targetKey: `building:${building.id}` },
        ],
        details: {
            entry: { ...building.entry },
            interior: { ...building.interior },
            bounds: { ...building.bounds },
            entered: containsBuildingPoint(building.bounds, actor.position),
        },
    }))
}
export function landmarkTargets(
    actor: GameCharacter,
    navigation: NavigationService
): NpcAiTarget[] {
    const known = new Set(
        knownGuidePlaces(actor, navigation).map((place) => place.key)
    )
    return (navigation.grid.landmarks ?? []).flatMap((landmark) => {
        const key = `landmark:${actor.locationId}:${landmark.id}`
        if (!known.has(key)) {
            return []
        }
        return [
            {
                key,
                kind: 'landmark' as const,
                id: landmark.id,
                name: landmark.name,
                position: { ...landmark.position },
                distance: distance(actor.position, landmark.position),
                interactionRange: 0,
                commands: [
                    moveTo(landmark.position),
                    { type: 'guide' as const, targetKey: key },
                ],
                details: {
                    kind: landmark.kind,
                    direction: landmark.direction,
                    destinationLocationId: landmark.destinationLocationId,
                },
            },
        ]
    })
}
