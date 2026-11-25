import type {
    CharacterSnapshot,
    ClientMessage,
    Vector2,
    WorldObjectBounds,
    WorldObjectSnapshot,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    CHEST_FOOTPRINT_SIZE,
    CHEST_INTERACTION_RANGE,
    COMPANION_REQUEST_RANGE,
    doorApproachPoints,
    FARM_INTERACTION_RANGE,
    interactionApproachPoints,
    PORTAL_INTERACTION_TILES,
    THEFT_RULES,
} from '@my-game-ratata/contracts'

import { itemStackLabel } from '@/entities/items'
import { characterName, locationName, tGame, tLocalized } from '@/shared/lib/i18n'

import type { TargetHighlight } from '../runtime/interactionTargetViews'
import { ashCharacterActions } from './ashActions'
import { chestActions } from './chestActions'
import { relation } from './combatTargeting'
import { corpseSharesGrave, graveTargets } from './graveInteractions'
import { facingInteractionTarget, interactionDistance } from './interactionTargets'
import { justiceActions } from './justiceActions'
import type { NearbyAction } from './nearbyActions'
import {
    characterActions,
    civicServiceActions,
    followActions,
    hostilityActions,
    partyActions,
    reviveActions,
    socialActions,
} from './nearbyCharacterActions'
import { farmAction, pickupActions, resourceActions } from './nearbyMaterialActions'
import { theftActions } from './theftActions'
import { worldInteractionTargets } from './worldInteractionActions'

export interface InteractionAction extends NearbyAction {
    command: ClientMessage
}
export interface InteractionTarget extends TargetHighlight {
    name: string
    actions: InteractionAction[]
}
interface TargetCandidate extends InteractionTarget {
    range: number
    door?: WorldObjectSnapshot['door']
}
type InteractionVisibility = (
    position: Vector2,
    bounds?: WorldObjectBounds,
    range?: number
) => boolean
type CanSelectTarget = (key: string) => boolean

export function nearbyInteractionActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    isPositionVisible?: InteractionVisibility
): InteractionAction[] {
    return nearbyInteractionTarget(snapshot, player, characters, isPositionVisible)?.actions ?? []
}

export function nearbyInteractionTarget(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    isPositionVisible: InteractionVisibility = () => true,
    targetKey?: string,
    ignoreFacing = false,
    canSelectTarget?: CanSelectTarget
): InteractionTarget | undefined {
    if (!player.alive || player.tags.includes('offline')) return undefined
    const candidates = [
        ...characterTargets(snapshot, player, characters, targetKey),
        ...portalTargets(snapshot, player),
        ...graveTargets(snapshot, player),
        ...worldInteractionTargets(snapshot, player),
        ...resourceTargets(snapshot, player),
        ...farmTargets(snapshot, player),
        ...chestTargets(snapshot, player),
        ...itemTargets(snapshot, player),
    ]
    return facingInteractionTarget(
        candidates.filter(
            (candidate) =>
                (targetKey === undefined || candidate.key === targetKey) &&
                isAvailable(candidate, player, isPositionVisible, canSelectTarget)
        ),
        player,
        targetKey,
        ignoreFacing
    )
}

export function nearbyCharacterInteractionTargets(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    isPositionVisible: InteractionVisibility = () => true,
    canSelectTarget?: CanSelectTarget
): InteractionTarget[] {
    if (!player.alive || player.tags.includes('offline')) return []
    return characterTargets(snapshot, player, characters).filter(
        (candidate) =>
            candidate.actions.some((action) => !action.disabled) &&
            isAvailable(candidate, player, isPositionVisible, canSelectTarget)
    )
}

function isAvailable(
    candidate: TargetCandidate,
    player: CharacterSnapshot,
    visible: InteractionVisibility,
    canSelectTarget?: CanSelectTarget
): boolean {
    return (
        candidate.actions.length > 0 &&
        targetVisible(candidate, player.position, visible) &&
        canSelectTarget?.(candidate.key) !== false
    )
}

function portalTargets(snapshot: WorldSnapshot, player: CharacterSnapshot): TargetCandidate[] {
    if (
        player.abilities?.rootedUntil ||
        player.abilities?.magicChannel ||
        player.abilities?.casting ||
        player.cooldowns.stunMsLeft > 0
    )
        return []
    const range = (snapshot.location?.map.tileWidth ?? 16) * PORTAL_INTERACTION_TILES
    return (snapshot.portals ?? [])
        .filter(
            (portal) =>
                portal.expiresAt > snapshot.serverTime &&
                (snapshot.location === undefined || portal.locationId === snapshot.location.id) &&
                interactionDistance(player, portal) <= range
        )
        .map((portal) => ({
            key: `portal:${portal.id}`,
            name: tGame('game.world.portalDestination', {
                destination: locationName(portal.destinationLocationId, portal.destinationName),
            }),
            position: portal.position,
            range,
            actions: [
                {
                    id: 'use-portal',
                    label: tGame('game.world.enter'),
                    command: { type: 'use_portal', endpointId: portal.id },
                },
            ],
        }))
}
function targetVisible(
    target: TargetCandidate,
    from: Vector2,
    visible: InteractionVisibility
): boolean {
    if (target.door && target.bounds) {
        return doorApproachPoints(target.bounds, target.door.state).some((point) =>
            visible(point, undefined, target.range)
        )
    }
    if (!target.interactionAreas) return visible(target.position, target.bounds, target.range)
    return interactionApproachPoints(from, target.interactionAreas).some(
        (point) =>
            Math.hypot(point.x - from.x, point.y - from.y) <= target.range &&
            visible(point, undefined, target.range)
    )
}
function characterTargets(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    targetKey?: string
): TargetCandidate[] {
    return characters
        .filter((character) => character.id !== player.id && !character.tags.includes('offline'))
        .map((character) => {
            const one = [character]
            return {
                key: `character:${character.id}`,
                kind: 'character' as const,
                relationship: relation(character, player),
                name: characterName(character.id, character.nickname),
                position: character.position,
                range: Math.max(
                    COMPANION_REQUEST_RANGE,
                    THEFT_RULES.reportRange,
                    THEFT_RULES.absolutionRange
                ),
                actions: [
                    ...(snapshot.social?.quest?.status === 'active'
                        ? snapshot.social.quest.objectives.flatMap((objective, objectiveIndex) =>
                              objective.kind === 'inspect' &&
                              objective.targetId === character.id &&
                              interactionDistance(player, character) <= 48 &&
                              (snapshot.social!.quest!.progress[objectiveIndex] ?? 0) === 0
                                  ? [
                                        {
                                            id: `quest-inquire:${snapshot.social!.quest!.instanceId}:${objectiveIndex}`,
                                            label: tGame('game.world.askAboutQuest', {
                                                quest: tLocalized(
                                                    snapshot.social!.quest!.titleMessage,
                                                    snapshot.social!.quest!.title
                                                ),
                                            }),
                                            command: {
                                                type: 'quest_inquire' as const,
                                                instanceId: snapshot.social!.quest!.instanceId,
                                                objectiveIndex,
                                            },
                                        },
                                    ]
                                  : []
                          )
                        : []),
                    ...justiceActions(snapshot, player, one),
                    ...characterActions(character, player),
                    ...civicServiceActions(character, player),
                    ...ashCharacterActions(player, character),
                    ...socialActions(one, player),
                    ...theftActions(snapshot, player, one),
                    ...reviveActions(one, player),
                    ...partyActions(one, player, snapshot.party),
                    ...followActions(one, player),
                    ...(targetKey === `character:${character.id}`
                        ? hostilityActions(character, player)
                        : []),
                ],
            }
        })
}
function resourceTargets(snapshot: WorldSnapshot, player: CharacterSnapshot): TargetCandidate[] {
    return (snapshot.adventure?.resourceNodes ?? []).map((node) => {
        const actions = resourceActions(
            { ...snapshot, adventure: { ...snapshot.adventure!, resourceNodes: [node] } },
            player
        )
        return {
            key: `resource:${node.id}`,
            name: actions[0]?.label ?? '',
            position: node.position,
            ...(node.bounds === undefined ? {} : { bounds: node.bounds }),
            range: 48,
            actions,
        }
    })
}
function farmTargets(snapshot: WorldSnapshot, player: CharacterSnapshot): TargetCandidate[] {
    return (snapshot.adventure?.farmPlots ?? [])
        .filter((plot) => interactionDistance(player, plot) <= FARM_INTERACTION_RANGE)
        .map((plot) => ({
            key: `farm:${plot.id}`,
            name: tGame('game.world.wheatPlot'),
            position: plot.position,
            range: FARM_INTERACTION_RANGE,
            actions: [farmAction(plot, player, snapshot.serverTime)],
        }))
}
function chestTargets(snapshot: WorldSnapshot, player: CharacterSnapshot): TargetCandidate[] {
    return snapshot.chests
        .filter(
            (chest) =>
                !(snapshot.graves ?? []).some((grave) => corpseSharesGrave(chest, grave, player))
        )
        .map((chest) => ({
            key: `chest:${chest.id}`,
            name: chest.title ?? tGame('game.world.chest'),
            position: chest.position,
            range: CHEST_INTERACTION_RANGE,
            bounds: chest.bounds ?? {
                x: chest.position.x - CHEST_FOOTPRINT_SIZE / 2,
                y: chest.position.y - CHEST_FOOTPRINT_SIZE / 2,
                width: CHEST_FOOTPRINT_SIZE,
                height: CHEST_FOOTPRINT_SIZE,
            },
            actions: chestActions({ ...snapshot, chests: [chest] }, player),
        }))
}
function itemTargets(snapshot: WorldSnapshot, player: CharacterSnapshot): TargetCandidate[] {
    return snapshot.items.map((item) => ({
        key: `item:${item.id}`,
        name: itemStackLabel(item),
        position: item.position,
        range: 24,
        actions: pickupActions({ ...snapshot, items: [item] }, player),
    }))
}
