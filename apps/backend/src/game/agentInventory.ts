import type {
    ChestClientMessage,
    PickupItemClientMessage,
} from '@my-game-ratata/contracts'

import type { AgentDecisionResult, CompanionWorld } from './agentDecisions'
import { applyAgentPickup } from './agentPickup'
import type { GameCharacter } from './character'
import {
    isChestCommand,
    isChestCommandType,
    parseChestCommand,
} from './chestCommands'
import { parsePickupCommand } from './worldPickup'

type InventoryDecision = ChestClientMessage | PickupItemClientMessage

export function isInventoryDecision(message: {
    type: string
}): message is InventoryDecision {
    return message.type === 'pickup_item' || isChestCommand(message)
}

export function isInventoryDecisionType(type: unknown): boolean {
    return type === 'pickup_item' || isChestCommandType(type)
}

export function parseInventoryDecision(
    record: Record<string, unknown>
): InventoryDecision | undefined {
    return record['type'] === 'pickup_item'
        ? parsePickupCommand(record)
        : parseChestCommand(record)
}

export function applyAgentInventory(
    actor: GameCharacter,
    message: InventoryDecision,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    if (message.type === 'pickup_item') {
        return applyAgentPickup(actor, message.worldItemId, world, now)
    }
    if (world.chestActions === undefined) {
        return {
            accepted: false,
            error: 'Chest service unavailable',
            events: [],
        }
    }
    return {
        accepted: true,
        error: null,
        events: world.chestActions.handle(actor, message, now),
        chest: world.chestActions.snapshot(actor, now),
    }
}
