import type {
    CharacterSnapshot,
    ClientMessage,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    CHEST_FOOTPRINT_SIZE,
    CHEST_INTERACTION_RANGE,
    FARM_INTERACTION_RANGE,
    THEFT_RULES,
} from '@my-game-ratata/contracts'

import type { TargetHighlight } from '../runtime/interactionTargetViews'
import { chestActions } from './chestActions'
import { facingInteractionTarget, interactionDistance } from './interactionTargets'
import { itemStackLabel } from './itemLabels'
import { justiceActions } from './justiceActions'
import type { NearbyAction } from './nearbyActions'
import { characterActions, partyActions, reviveActions } from './nearbyCharacterActions'
import { farmAction, pickupActions, resourceActions } from './nearbyMaterialActions'
import { theftActions } from './theftActions'
import { worldInteractionActions } from './worldInteractionActions'

export interface InteractionAction extends NearbyAction {
    command: ClientMessage
}
export interface InteractionTarget extends TargetHighlight {
    name: string
    actions: InteractionAction[]
}
interface TargetCandidate extends InteractionTarget {
    range: number
}
type InteractionVisibility = (
    position: Vector2,
    bounds?: WorldObjectBounds,
    range?: number
) => boolean

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
    targetKey?: string
): InteractionTarget | undefined {
    if (!player.alive || player.tags.includes('offline')) return undefined
    const candidates = [
        ...characterTargets(snapshot, player, characters),
        ...objectTargets(snapshot, player),
        ...resourceTargets(snapshot, player),
        ...farmTargets(snapshot, player),
        ...chestTargets(snapshot, player),
        ...itemTargets(snapshot, player),
    ]
    return facingInteractionTarget(
        candidates.filter(
            (candidate) =>
                candidate.actions.length > 0 &&
                isPositionVisible(candidate.position, candidate.bounds, candidate.range)
        ),
        player,
        targetKey
    )
}
function characterTargets(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[]
): TargetCandidate[] {
    return characters
        .filter((character) => character.id !== player.id && !character.tags.includes('offline'))
        .map((character) => {
            const one = [character]
            return {
                key: `character:${character.id}`,
                kind: 'character' as const,
                name: character.nickname,
                position: character.position,
                range: Math.max(48, THEFT_RULES.reportRange, THEFT_RULES.absolutionRange),
                actions: [
                    ...justiceActions(snapshot, player, one),
                    ...characterActions(one, player),
                    ...theftActions(snapshot, player, one),
                    ...reviveActions(one, player),
                    ...partyActions(one, player),
                ],
            }
        })
}
function objectTargets(snapshot: WorldSnapshot, player: CharacterSnapshot): TargetCandidate[] {
    return (snapshot.adventure?.worldObjects ?? []).map((object) => ({
        key: `world:${object.id}`,
        name: object.name,
        position: object.position,
        bounds: object.bounds,
        range: 48,
        actions: worldInteractionActions(
            { ...snapshot, adventure: { ...snapshot.adventure!, worldObjects: [object] } },
            player
        ),
    }))
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
            name: 'Пшеничная грядка',
            position: plot.position,
            range: FARM_INTERACTION_RANGE,
            actions: [farmAction(plot, player, snapshot.serverTime)],
        }))
}
function chestTargets(snapshot: WorldSnapshot, player: CharacterSnapshot): TargetCandidate[] {
    return snapshot.chests.map((chest) => ({
        key: `chest:${chest.id}`,
        name: 'Сундук',
        position: chest.position,
        range: CHEST_INTERACTION_RANGE,
        bounds: {
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
