import {
    type AdventureResourceNode,
    type GatherOperation,
    isItemBroken,
    ITEM_DEFINITIONS,
    type Vector2,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveWorkEnergy } from './effectiveParameters'
import { createItemInstance, type InventoryItemInstance } from './inventory'
export const TREE_GROW_MS = 10 * 60_000
export const STONE_REGROW_MS = 20 * 60_000
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
    if (
        operation === 'harvest' &&
        node.source === 'tree' &&
        node.remaining === 1
    ) {
        if (node.treeSize !== 'small') {
            outputs.push(createItemInstance('sapling', 2))
        }
        outputs.push(createItemInstance('brushwood'))
    }
    return outputs
}
export function gatheringTool(
    actor: GameCharacter,
    node: AdventureResourceNode,
    operation: GatherOperation
): WorkTool | undefined {
    if (node.source === 'branches') {
        return { energy: 0, duration: 800, wear: 0 }
    }
    const tool = actor.equipment.weapon
    if (node.source === 'bush') {
        const work = bushWork(tool)
        return { ...work, energy: effectiveWorkEnergy(actor, work.energy) }
    }
    if (
        tool === undefined ||
        isItemBroken(tool) ||
        (operation === 'clear_stump' &&
            tool.itemId !== 'axe' &&
            tool.itemId !== 'stone_axe')
    ) {
        return undefined
    }
    const source = node.source === 'tree' ? 'tree' : 'stone'
    const capability = ITEM_DEFINITIONS[tool.itemId].gathering?.[source]
    return capability === undefined
        ? undefined
        : {
              tool,
              energy: effectiveWorkEnergy(actor, capability.energy),
              duration: capability.durationMs,
              wear: capability.wear,
          }
}
export function deplete(node: AdventureResourceNode, now: number): void {
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
export function removeNode(node: AdventureResourceNode): void {
    node.phase = 'removed'
    node.remaining = 0
    node.readyAt = 0
    delete node.collisionBounds
}
export function stumpBounds(position: Vector2): WorldObjectBounds {
    return { x: position.x - 8, y: position.y - 8, width: 16, height: 16 }
}

function bushWork(tool: InventoryItemInstance | undefined): WorkTool {
    const capability =
        tool === undefined || isItemBroken(tool)
            ? undefined
            : ITEM_DEFINITIONS[tool.itemId].gathering?.bush
    return capability === undefined
        ? { energy: 1, duration: 800, wear: 0 }
        : {
              tool,
              energy: capability.energy,
              duration: capability.durationMs,
              wear: capability.wear,
          }
}
