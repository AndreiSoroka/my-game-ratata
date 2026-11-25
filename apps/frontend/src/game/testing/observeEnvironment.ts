import {
    type CharacterSnapshot,
    DOOR_INTERACTION_RANGE,
    FARM_INTERACTION_RANGE,
    GRAVE_INTERACTION_RANGE,
    PORTAL_INTERACTION_TILES,
    type WorldGraveSnapshot,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { graveName } from '@/entities/graves'
import { tGame } from '@/shared/lib/i18n'

import { gravePrayerPreview } from '../ui/graveInteractions'
import { type InteractionAction, nearbyInteractionTarget } from '../ui/nearbyInteractionActions'
import type { AgentTarget, ObservationOptions } from './agentObservation'

type TargetDescription = Omit<AgentTarget, 'key' | 'distance' | 'actions'>

export function observedTargetActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    target: TargetDescription,
    visibility: ObservationOptions
): InteractionAction[] {
    const nearby = nearbyInteractionTarget(
        snapshot,
        player,
        characters,
        visibility.isInteractionVisible,
        `${target.kind}:${target.id}`,
        true
    )
    if (!nearby) return []
    const grave =
        target.kind === 'grave' ? snapshot.graves?.find(({ id }) => id === target.id) : undefined
    return grave ? [...graveCommands(player, grave), ...nearby.actions] : nearby.actions
}

/** The playtest interface includes the grave's ordinary hotbar commands. */
function graveCommands(player: CharacterSnapshot, grave: WorldGraveSnapshot): InteractionAction[] {
    const address = { kind: 'grave', id: grave.id } as const
    const prayer = gravePrayerPreview(player, grave)
    return [
        {
            id: `grave:attack:${grave.id}`,
            label: tGame(
                grave.phase === 'active' ? 'game.world.basicAttack' : 'game.world.graveDestroyed'
            ),
            disabled: grave.phase !== 'active',
            command: { type: 'attack', target: address },
        },
        {
            id: `grave:purify:${grave.id}`,
            label: prayer.unavailableReason ?? tGame('game.world.cleanseGraveAction'),
            disabled: prayer.unavailableReason !== null,
            command: {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'purify_grave', target: address },
            },
        },
    ]
}

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
