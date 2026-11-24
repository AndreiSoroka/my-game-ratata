import {
    DOOR_INTERACTION_RANGE,
    FARM_INTERACTION_RANGE,
    GRAVE_INTERACTION_RANGE,
    PORTAL_INTERACTION_TILES,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { graveName } from '../ui/graveInteractions'
import type { AgentTarget } from './agentObservation'

type TargetDescription = Omit<AgentTarget, 'key' | 'distance' | 'actions'>
export function environmentTargets(snapshot: WorldSnapshot): TargetDescription[] {
    return [
        ...(snapshot.portals ?? [])
            .filter(
                (portal) =>
                    portal.expiresAt > snapshot.serverTime &&
                    (snapshot.location === undefined || portal.locationId === snapshot.location.id)
            )
            .map((portal): TargetDescription => ({
                id: portal.id,
                kind: 'portal',
                name: `Портал — ${portal.destinationName}`,
                position: portal.position,
                interactionRange:
                    (snapshot.location?.map.tileWidth ?? 16) * PORTAL_INTERACTION_TILES,
                details: { destination: portal.destinationLocationId, expiresAt: portal.expiresAt },
            })),
        ...(snapshot.graves ?? [])
            .filter((grave) => grave.phase !== 'purified')
            .map((grave): TargetDescription => ({
                id: grave.id,
                kind: 'grave',
                name: graveName(grave),
                position: grave.position,
                bounds: { x: grave.position.x - 8, y: grave.position.y - 8, width: 16, height: 16 },
                interactionRange: GRAVE_INTERACTION_RANGE,
                details: {
                    phase: grave.phase,
                    health: grave.health,
                    material: grave.material,
                    restoresAt: grave.restoresAt,
                },
            })),
        ...(snapshot.adventure?.worldObjects ?? [])
            .filter((object) => object.kind !== 'barrel')
            .map((object): TargetDescription => ({
                id: object.id,
                kind: 'world',
                name: object.name,
                position: object.position,
                bounds: object.bounds,
                interactionAreas: object.interactionAreas,
                interactionRange: object.kind === 'door' ? DOOR_INTERACTION_RANGE : 48,
                details: {
                    kind: object.kind,
                    depleted: object.depleted,
                    ...(object.door ? { state: object.door.state } : {}),
                },
            })),
        ...(snapshot.adventure?.resourceNodes ?? [])
            .filter((node) => node.phase !== 'removed')
            .map((node): TargetDescription => ({
                id: node.id,
                kind: 'resource',
                name: node.kind,
                position: node.position,
                ...(node.bounds === undefined ? {} : { bounds: node.bounds }),
                interactionRange: 48,
                details: {
                    material: node.kind,
                    remaining: node.remaining,
                    treeProfile: node.treeProfile,
                    treeSize: node.treeSize,
                    source: node.source,
                    phase: node.phase,
                    readyAt: node.readyAt,
                },
            })),
        ...(snapshot.adventure?.farmPlots ?? []).map((plot): TargetDescription => ({
            id: plot.id,
            kind: 'farm',
            name: plot.name,
            position: plot.position,
            interactionRange: FARM_INTERACTION_RANGE,
            details: { crop: plot.crop, phase: plot.phase, readyAt: plot.readyAt },
        })),
    ]
}
