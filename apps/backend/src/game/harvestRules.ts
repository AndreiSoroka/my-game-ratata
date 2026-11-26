import {
    type AdventureResourceNode,
    ARTISAN_LUMBER_RULES,
    ARTISAN_STARS,
    type GatherOperation,
    isItemBroken,
    ITEM_DEFINITIONS,
    type Vector2,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { hasStar } from './constellations'
import { effectiveWorkEnergy } from './effectiveParameters'
import {
    addInventoryItems,
    createItemInstance,
    type InventoryItemInstance,
} from './inventory'
import { reservedInventoryQuantity } from './rewardReservations'
export const TREE_GROW_MS = 10 * 60_000
export const STONE_REGROW_MS = 20 * 60_000
// Different mastery ranks contribute exact whole units to the same current log.
const completeLogEffort = 6
const logEffort = new WeakMap<AdventureResourceNode, number>()
interface WorkTool {
    tool?: InventoryItemInstance | undefined
    energy: number
    duration: number
    wear: number
}
export function operationMatches(
    node: AdventureResourceNode,
    operation: GatherOperation
): boolean {
    return operation === 'harvest'
        ? node.phase === 'ready' && node.remaining > 0
        : node.source === 'tree' &&
              (operation === 'clear_stump'
                  ? node.phase === 'stump'
                  : node.phase === 'growing')
}
export function harvestOutputs(
    node: AdventureResourceNode,
    operation: GatherOperation
): InventoryItemInstance[] {
    if (operation === 'cut_sapling') {
        return []
    }
    const outputs = [
        createItemInstance(operation === 'clear_stump' ? 'wood' : node.kind),
    ]
    if (isStandingTreeHarvest(node, operation) && node.remaining === 1) {
        if (node.treeSize !== 'small') {
            outputs.push(createItemInstance('sapling', 2))
        }
        outputs.push(createItemInstance('brushwood'))
    }
    return outputs
}

export function isStandingTreeHarvest(
    node: AdventureResourceNode,
    operation: GatherOperation
): boolean {
    return node.source === 'tree' && operation === 'harvest'
}

export function commitGatherYield(
    actor: GameCharacter,
    node: AdventureResourceNode,
    operation: GatherOperation
): InventoryItemInstance[] | undefined {
    if (
        isStandingTreeHarvest(node, operation) &&
        !advanceLogEffort(actor, node)
    ) {
        return []
    }
    const outputs = harvestOutputs(node, operation)
    if (!addInventoryItems(actor.inventory, outputs)) {
        return undefined
    }
    logEffort.delete(node)
    return outputs
}

function advanceLogEffort(
    actor: GameCharacter,
    node: AdventureResourceNode
): boolean {
    const strikes = hasStar(actor, ARTISAN_STARS.oneStrike)
        ? ARTISAN_LUMBER_RULES.masterStrikes
        : hasStar(actor, ARTISAN_STARS.hand)
          ? ARTISAN_LUMBER_RULES.handStrikes
          : ARTISAN_LUMBER_RULES.baseStrikes
    const next = (logEffort.get(node) ?? 0) + completeLogEffort / strikes
    if (next >= completeLogEffort) {
        return true
    }
    logEffort.set(node, next)
    return false
}

export function gatheringTool(
    actor: GameCharacter,
    node: AdventureResourceNode,
    operation: GatherOperation
): WorkTool | undefined {
    if (node.source === 'branches') {
        return { energy: 0, duration: 800, wear: 0 }
    }
    const source = node.source ?? 'stone'
    const tool = selectGatheringTool(actor, source, operation)
    const gathering =
        tool === undefined ? undefined : ITEM_DEFINITIONS[tool.itemId].gathering
    const capability = gathering?.[source]
    if (capability === undefined) {
        return source === 'bush'
            ? { energy: effectiveWorkEnergy(actor, 1), duration: 800, wear: 0 }
            : undefined
    }
    const base =
        source === 'tree'
            ? treeWorkEnergy(
                  actor,
                  operation,
                  capability.energy,
                  gathering?.tree?.removalEnergy
              )
            : capability.energy
    return {
        tool,
        energy: effectiveWorkEnergy(actor, base),
        duration: capability.durationMs,
        wear: capability.wear,
    }
}

function treeWorkEnergy(
    actor: GameCharacter,
    operation: GatherOperation,
    energy: number,
    removalEnergy = energy
): number {
    if (operation !== 'harvest') {
        return removalEnergy
    }
    return hasStar(actor, ARTISAN_STARS.economy)
        ? energy * ARTISAN_LUMBER_RULES.energyMultiplier
        : energy
}

function selectGatheringTool(
    actor: GameCharacter,
    source: 'tree' | 'stone' | 'bush',
    operation: GatherOperation
): InventoryItemInstance | undefined {
    const weapon = actor.equipment.weapon
    const held =
        weapon !== undefined && canUseTool(weapon, source, operation)
            ? weapon
            : undefined
    if (
        !hasStar(actor, ARTISAN_STARS.root) ||
        (held !== undefined && (source !== 'tree' || isAxe(held)))
    ) {
        return held
    }
    const bag = actor.inventory.filter(
        (item) =>
            canUseTool(item, source, operation) &&
            reservedInventoryQuantity(actor.inventory, item.instanceId) === 0
    )
    return (source === 'tree' ? bag.find(isAxe) : undefined) ?? held ?? bag[0]
}

function canUseTool(
    item: InventoryItemInstance,
    source: 'tree' | 'stone' | 'bush',
    operation: GatherOperation
): boolean {
    return (
        !isItemBroken(item) &&
        (operation !== 'clear_stump' || isAxe(item)) &&
        ITEM_DEFINITIONS[item.itemId].gathering?.[source] !== undefined
    )
}

function isAxe(item: InventoryItemInstance): boolean {
    return item.itemId === 'axe' || item.itemId === 'stone_axe'
}
export function completeGatherOperation(
    node: AdventureResourceNode,
    operation: GatherOperation,
    now: number
): void {
    if (operation !== 'harvest') {
        removeNode(node)
        return
    }
    node.remaining -= 1
    if (node.remaining === 0) {
        deplete(node, now)
    }
}

function deplete(node: AdventureResourceNode, now: number): void {
    if (node.source === 'tree' && node.treeSize !== 'small') {
        node.phase = 'stump'
        node.readyAt = 0
        node.collisionBounds = stumpBounds(node.position)
    } else if (node.source === 'stone') {
        node.phase = 'depleted'
        node.readyAt = now + STONE_REGROW_MS
        delete node.collisionBounds
    } else {
        removeNode(node)
    }
}
function removeNode(node: AdventureResourceNode): void {
    node.phase = 'removed'
    node.remaining = 0
    node.readyAt = 0
    delete node.collisionBounds
}
export function stumpBounds(position: Vector2): WorldObjectBounds {
    return { x: position.x - 8, y: position.y - 8, width: 16, height: 16 }
}
