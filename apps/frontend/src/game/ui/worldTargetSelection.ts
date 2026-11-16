import {
    ABILITY_DEFINITIONS,
    type CharacterRelationship,
    type CharacterSnapshot,
    containerBounds,
    graveBounds,
    ITEM_DEFINITIONS,
    type Vector2,
    type WorldGraveSnapshot,
    type WorldObjectBounds,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { relation } from './combatTargeting'
import { graveName } from './graveInteractions'
import { targetInteractionDistance } from './interactionTargets'
import { itemStackLabel } from './itemLabels'

export type WorldSelectionTargetKind =
    'character' | 'world' | 'resource' | 'farm' | 'chest' | 'item' | 'grave'

export interface WorldSelectionTarget {
    key: string
    id: string
    kind: WorldSelectionTargetKind
    name: string
    position: Vector2
    bounds?: WorldObjectBounds
    interactionAreas?: WorldObjectBounds[]
    relationship?: CharacterRelationship
}

export type WorldTargetVisibility = (target: WorldSelectionTarget) => boolean

export interface WorldSelectionOptions {
    tileSize: number
    isVisible: WorldTargetVisibility
    characters?: readonly CharacterSnapshot[]
}

/** Selection allows room to approach with every learned ability, independently of action reach. */
export function worldSelectionRange(player: CharacterSnapshot, tileSize: number): number {
    return Math.max(
        tileSize * 12,
        ...(player.abilities?.known ?? []).map(
            (ability) => ABILITY_DEFINITIONS[ability].range + tileSize * 3
        )
    )
}

/** Functional targets from the observer's snapshot; no range-dependent action lists are needed. */
export function worldTargetCandidates(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: readonly CharacterSnapshot[] = snapshot.characters
): WorldSelectionTarget[] {
    const onLocation = (locationId: string) =>
        !snapshot.location || locationId === snapshot.location.id
    const graves = (snapshot.graves ?? []).filter(
        (grave) => grave.phase !== 'purified' && onLocation(grave.locationId)
    )
    return [
        ...characterCandidates(characters, player),
        ...graves.map((grave): WorldSelectionTarget => ({
            key: `grave:${grave.id}`,
            id: grave.id,
            kind: 'grave',
            name: graveName(grave),
            position: grave.position,
            bounds: graveBounds(grave.position),
        })),
        ...(snapshot.adventure?.worldObjects ?? [])
            // Authored barrels have a container identity, not a second world-object target.
            .filter((object) => object.kind !== 'barrel')
            .map((object): WorldSelectionTarget => ({
                key: `world:${object.id}`,
                id: object.id,
                kind: 'world',
                name: object.name,
                position: object.position,
                bounds: object.bounds,
                interactionAreas: object.interactionAreas,
            })),
        ...(snapshot.adventure?.resourceNodes ?? [])
            .filter(
                (node) =>
                    onLocation(node.locationId) &&
                    node.phase !== 'removed' &&
                    node.phase !== 'depleted' &&
                    (node.remaining > 0 || node.phase === 'growing' || node.phase === 'stump')
            )
            .map((node): WorldSelectionTarget => ({
                key: `resource:${node.id}`,
                id: node.id,
                kind: 'resource',
                name:
                    node.phase === 'stump'
                        ? 'Пень'
                        : node.phase === 'growing'
                          ? 'Саженец'
                          : ITEM_DEFINITIONS[node.kind].name,
                position: node.position,
                bounds: node.bounds,
            })),
        ...(snapshot.adventure?.farmPlots ?? [])
            .filter((plot) => onLocation(plot.locationId))
            .map((plot): WorldSelectionTarget => ({
                key: `farm:${plot.id}`,
                id: plot.id,
                kind: 'farm',
                name: plot.name,
                position: plot.position,
            })),
        ...containerCandidates(snapshot, graves),
        ...snapshot.items.map((item): WorldSelectionTarget => ({
            key: `item:${item.id}`,
            id: item.id,
            kind: 'item',
            name: itemStackLabel(item),
            position: item.position,
        })),
    ]
}

function characterCandidates(
    characters: readonly CharacterSnapshot[],
    player: CharacterSnapshot
): WorldSelectionTarget[] {
    return characters
        .filter(
            (character) =>
                character.id !== player.id &&
                !character.tags.includes('offline') &&
                (character.alive ||
                    (relation(character, player) !== 'hostile' &&
                        !character.life?.retired &&
                        (character.life?.reviveMsLeft ?? 0) > 0))
        )
        .map((character) => ({
            key: `character:${character.id}`,
            id: character.id,
            kind: 'character',
            name: character.nickname,
            position: character.position,
            relationship: relation(character, player),
        }))
}

function containerCandidates(
    snapshot: WorldSnapshot,
    graves: readonly WorldGraveSnapshot[]
): WorldSelectionTarget[] {
    return snapshot.chests
        .filter(
            (chest) =>
                chest.kind !== 'corpse' ||
                !graves.some(
                    (grave) =>
                        grave.position.x === chest.position.x &&
                        grave.position.y === chest.position.y
                )
        )
        .map((chest) => ({
            key: `chest:${chest.id}`,
            id: chest.id,
            kind: 'chest',
            name:
                chest.title ??
                (chest.kind === 'corpse' ? 'Тело' : chest.kind === 'barrel' ? 'Бочка' : 'Сундук'),
            position: chest.position,
            bounds: chest.bounds ?? containerBounds(chest.position),
        }))
}

export function isWorldTargetEligible(
    target: WorldSelectionTarget,
    player: CharacterSnapshot,
    range: number,
    isVisible: WorldTargetVisibility
): boolean {
    return (
        player.alive &&
        !player.tags.includes('offline') &&
        targetInteractionDistance(player.position, target) <= range &&
        isVisible(target)
    )
}

export function selectableWorldTargets(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    options: WorldSelectionOptions
): WorldSelectionTarget[] {
    const range = worldSelectionRange(player, options.tileSize)
    return worldTargetCandidates(snapshot, player, options.characters)
        .filter((target) => isWorldTargetEligible(target, player, range, options.isVisible))
        .sort(
            (first, second) =>
                targetInteractionDistance(player.position, first) -
                    targetInteractionDistance(player.position, second) ||
                first.key.localeCompare(second.key)
        )
}

/** The caller supplies distance-ordered eligible targets; self is outside this cycle. */
export function nextWorldTarget(
    targets: readonly WorldSelectionTarget[],
    currentKey: string | undefined,
    reverse = false
): string | undefined {
    if (!targets.length) return undefined
    const current = targets.findIndex((target) => target.key === currentKey)
    const next =
        current < 0
            ? reverse
                ? targets.length - 1
                : 0
            : (current + (reverse ? -1 : 1) + targets.length) % targets.length
    return targets[next]?.key
}
