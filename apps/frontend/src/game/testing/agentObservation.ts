import type {
    AdventureSnapshot,
    CharacterSnapshot,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    CHEST_FOOTPRINT_SIZE,
    CHEST_INTERACTION_RANGE,
    doorApproachPoints,
    interactionApproachPoints,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { BuildingEntrance } from '../runtime/buildingEntrances'
import { relation } from '../ui/combatTargeting'
import { targetInteractionDistance } from '../ui/interactionTargets'
import { itemStackLabel } from '../ui/itemLabels'
import { type InteractionAction, nearbyInteractionTarget } from '../ui/nearbyInteractionActions'
import { observeAdventure } from './observeAdventure'
import { environmentTargets } from './observeEnvironment'
import type { RatataTestState } from './testInterface'

export interface AgentTarget {
    key: string
    id: string
    kind:
        | 'character'
        | 'world'
        | 'resource'
        | 'farm'
        | 'chest'
        | 'item'
        | 'building'
        | 'grave'
        | 'portal'
    name: string
    position: Vector2
    bounds?: WorldObjectBounds
    interactionAreas?: WorldObjectBounds[]
    distance: number
    interactionRange: number
    /** UI candidates only. The server rechecks life, reach, visibility and costs. */
    actions: InteractionAction[]
    details: Record<string, unknown>
}

export interface AgentExit {
    direction: 'north' | 'east' | 'south' | 'west'
    locationId: string
    name: string
    position: Vector2
    axis: Vector2
}

export interface ObservationOptions {
    getBuildings?: () => BuildingEntrance[]
    isCharacterVisible?: (id: string) => boolean
    isPositionVisible?: (position: Vector2) => boolean
    isInteractionVisible?: (
        position: Vector2,
        bounds?: WorldObjectBounds,
        range?: number
    ) => boolean
}

export interface AgentObservation {
    connected: boolean
    defeated: boolean
    error: string
    notice: string
    tick?: number
    serverTime?: number
    player?: CharacterSnapshot
    location?: WorldSnapshot['location']
    adventure?: Omit<AdventureSnapshot, 'resourceNodes' | 'worldObjects' | 'farmPlots'>
    chest?: WorldSnapshot['chest']
    party?: WorldSnapshot['party']
    targets: AgentTarget[]
    nearbyActions: InteractionAction[]
    dialogueChoices: InteractionAction[]
    exits: AgentExit[]
}

/** Read only the player's received state, never another actor's private observation. */
export function observeGame(
    state: RatataTestState,
    visibility: ObservationOptions = {}
): AgentObservation {
    const observation: AgentObservation = {
        connected: state.connected,
        defeated: state.defeated,
        error: state.error,
        notice: state.notice,
        ...observeSnapshot(state, visibility),
    }
    return JSON.parse(JSON.stringify(observation)) as AgentObservation
}

type SnapshotObservation = Omit<AgentObservation, 'connected' | 'defeated' | 'error' | 'notice'>
function observeSnapshot(
    state: RatataTestState,
    visibility: ObservationOptions
): SnapshotObservation {
    const { snapshot, player } = state
    if (!snapshot) return { targets: [], nearbyActions: [], dialogueChoices: [], exits: [] }
    const location = state.location ?? snapshot.location
    const targets = player ? observeTargets(snapshot, player, visibility) : []
    if (!state.connected) for (const target of targets) target.actions = []
    return {
        tick: snapshot.tick,
        serverTime: snapshot.serverTime,
        player,
        location,
        adventure: observeAdventure(snapshot.adventure),
        chest: snapshot.chest,
        party: snapshot.party,
        targets,
        nearbyActions: targets.flatMap((target) => target.actions),
        dialogueChoices: observeDialogue(state),
        exits: location ? observeExits(location) : [],
    }
}

function observeDialogue(state: RatataTestState): InteractionAction[] {
    if (!state.connected || !state.player?.alive) return []
    return (state.snapshot?.adventure?.dialogue?.choices ?? []).map((choice) => ({
        id: `dialogue:${choice.id}`,
        label: choice.label,
        command: { type: 'dialogue_choice', choiceId: choice.id },
    }))
}

type TargetDescription = Omit<AgentTarget, 'key' | 'distance' | 'actions'>
function observeTargets(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    visibility: ObservationOptions
): AgentTarget[] {
    const characters = snapshot.characters.filter(
        (actor) =>
            !actor.tags.includes('offline') && visibility.isCharacterVisible?.(actor.id) !== false
    )
    const descriptions = [
        ...characterTargets(characters, player),
        ...environmentTargets(snapshot),
        ...inventoryTargets(snapshot),
        ...buildingTargets(visibility),
    ]
    return descriptions
        .filter((target) => targetObserved(target, player.position, visibility))
        .map((target) => ({
            ...target,
            key: `${target.kind}:${target.id}`,
            distance: targetInteractionDistance(player.position, target),
            actions:
                nearbyInteractionTarget(
                    snapshot,
                    player,
                    characters,
                    visibility.isInteractionVisible,
                    `${target.kind}:${target.id}`,
                    true
                )?.actions ?? [],
        }))
        .sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key))
}

function targetObserved(
    target: TargetDescription,
    playerPosition: Vector2,
    visibility: ObservationOptions
): boolean {
    if (target.kind === 'building') return true
    if (target.details.kind === 'door' && target.bounds) {
        const state = target.details.state === 'locked' ? 'locked' : 'open'
        return doorApproachPoints(target.bounds, state).some(
            (point) =>
                (visibility.isInteractionVisible?.(point, undefined, Infinity) ??
                    visibility.isPositionVisible?.(point)) !== false
        )
    }
    if (target.interactionAreas) {
        return interactionApproachPoints(playerPosition, target.interactionAreas).some(
            (point) => visibility.isPositionVisible?.(point) !== false
        )
    }
    return visibility.isPositionVisible?.(target.position) !== false
}

function buildingTargets(visibility: ObservationOptions): TargetDescription[] {
    return (visibility.getBuildings?.() ?? []).map((building) => ({
        id: building.id,
        kind: 'building',
        name: building.name,
        position: building.entry,
        // A building is entered at its doorway, not approached within talking range.
        interactionRange: 0,
        details: { bounds: building.bounds },
    }))
}

function characterTargets(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): TargetDescription[] {
    return characters
        .filter((actor) => actor.id !== player.id)
        .map((actor) => ({
            id: actor.id,
            kind: 'character',
            name: actor.nickname,
            position: actor.position,
            interactionRange: 48,
            details: {
                alive: actor.alive,
                health: actor.health,
                relationship: relation(actor, player),
                creatureType: actor.creatureType,
                archetype: actor.archetype,
                tags: actor.tags,
                life: actor.life,
                canSpeak: actor.soul?.canSpeak,
            },
        }))
}

function inventoryTargets(snapshot: WorldSnapshot): TargetDescription[] {
    return [
        ...snapshot.chests.map((chest): TargetDescription => ({
            id: chest.id,
            kind: 'chest',
            name: chest.title ?? 'Сундук',
            position: chest.position,
            bounds: chest.bounds ?? {
                x: chest.position.x - CHEST_FOOTPRINT_SIZE / 2,
                y: chest.position.y - CHEST_FOOTPRINT_SIZE / 2,
                width: CHEST_FOOTPRINT_SIZE,
                height: CHEST_FOOTPRINT_SIZE,
            },
            interactionRange: CHEST_INTERACTION_RANGE,
            details: {
                kind: chest.kind ?? 'chest',
                propId: chest.propId,
                state: chest.state,
                itemCount: chest.itemCount,
            },
        })),
        ...snapshot.items.map((item): TargetDescription => ({
            id: item.id,
            kind: 'item',
            name: itemStackLabel(item),
            position: item.position,
            interactionRange: 24,
            details: { itemId: item.itemId, quantity: item.quantity ?? 1 },
        })),
    ]
}

function observeExits(location: NonNullable<WorldSnapshot['location']>): AgentExit[] {
    const { column, row, map } = location
    const directions = [
        { direction: 'north', x: 0, y: -1 },
        { direction: 'east', x: 1, y: 0 },
        { direction: 'south', x: 0, y: 1 },
        { direction: 'west', x: -1, y: 0 },
    ] as const
    return directions.flatMap(({ direction, x, y }) => {
        const neighbor = WORLD_LOCATION_DEFINITIONS.find(
            (candidate) => candidate.column === column + x && candidate.row === row + y
        )
        if (!neighbor) return []
        return [
            {
                direction,
                locationId: neighbor.id,
                name: neighbor.name,
                axis: { x, y },
                position: {
                    x:
                        x < 0
                            ? map.tileWidth / 2
                            : x > 0
                              ? map.worldWidth - map.tileWidth / 2
                              : map.worldWidth / 2 + map.tileWidth / 2,
                    y:
                        y < 0
                            ? map.tileHeight / 2
                            : y > 0
                              ? map.worldHeight - map.tileHeight / 2
                              : map.worldHeight / 2 + map.tileHeight / 2,
                },
            },
        ]
    })
}
