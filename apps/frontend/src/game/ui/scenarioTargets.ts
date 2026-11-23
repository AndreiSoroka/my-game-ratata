import {
    type CharacterSnapshot,
    getWorldLocationDefinition,
    type ScenarioSearchKind,
    type Vector2,
    type WorldObjectBounds,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { characterName, itemName, locationName, tGame } from '@/shared/lib/i18n'

import { relation } from './combatTargeting'

export interface ScenarioVisibleTarget {
    kind: ScenarioSearchKind
    id: string
    label: string
    locationId?: string
}
export function scenarioTargetKey(target: { id: string; locationId?: string }): string {
    return JSON.stringify([target.locationId ?? null, target.id])
}
export function scenarioTargetLabel(target: ScenarioVisibleTarget): string {
    const location = target.locationId && getWorldLocationDefinition(target.locationId)
    return location ? `${target.label} · ${locationName(location.id, location.name)}` : target.label
}
export function scenarioVisibleTargets(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: readonly CharacterSnapshot[],
    visible: (position: Vector2, bounds?: WorldObjectBounds) => boolean
): ScenarioVisibleTarget[] {
    const result: ScenarioVisibleTarget[] = []
    const locationId = snapshot.location?.id
    result.push(...resourceTargets(snapshot, visible))
    result.push(...enemyTargets(characters, player, visible, locationId))
    for (const chest of snapshot.chests) {
        if (visible(chest.position))
            result.push({
                kind: 'chest',
                id: chest.id,
                label: chest.title ?? tGame('game.world.chest'),
                locationId,
            })
    }
    for (const item of snapshot.items) {
        if (visible(item.position))
            result.push({
                kind: 'item',
                id: item.id,
                label: itemName(item.itemId),
                locationId,
            })
    }
    for (const plot of snapshot.adventure?.farmPlots ?? []) {
        if (visible(plot.position))
            result.push({
                kind: 'grain',
                id: plot.id,
                label: tGame('game.automation.farmPlot'),
                locationId,
            })
    }
    return result
}
function resourceTargets(
    snapshot: WorldSnapshot,
    visible: (position: Vector2, bounds?: WorldObjectBounds) => boolean
): ScenarioVisibleTarget[] {
    const result: ScenarioVisibleTarget[] = []
    for (const node of snapshot.adventure?.resourceNodes ?? []) {
        if (node.kind === 'sapling' || node.remaining <= 0 || !visible(node.position, node.bounds))
            continue
        result.push({
            kind: node.kind === 'wood' ? 'tree' : node.kind,
            id: node.id,
            label: `${itemName(node.kind)} · ${Math.round(node.position.x)}, ${Math.round(node.position.y)}`,
            locationId: snapshot.location?.id,
        })
    }
    return result
}
function enemyTargets(
    characters: readonly CharacterSnapshot[],
    player: CharacterSnapshot,
    visible: (position: Vector2) => boolean,
    locationId: string | undefined
): ScenarioVisibleTarget[] {
    const result: ScenarioVisibleTarget[] = []
    for (const actor of characters) {
        if (actor.alive && relation(actor, player) === 'hostile' && visible(actor.position))
            result.push({
                kind: 'enemy',
                id: actor.id,
                label: characterName(actor.id, actor.nickname),
                locationId,
            })
    }
    return result
}
