import type { AdventureClientMessage } from '@my-game-ratata/contracts'

import {
    parseCraftOrderCommand,
    parseMerchantService,
} from './craftOrderCommands'
import { parseEconomyCommand } from './economyCommands'
import { isGatherOperation } from './forestCommands'
import type { ParseResult } from './messages'
import { parseMindCommand } from './mindCommands'

export function isAdventureCommand(message: {
    type: string
}): message is AdventureClientMessage {
    return [
        'world_interact',
        'interact',
        'dialogue_choice',
        'trade',
        'gather',
        'craft',
        'farm_action',
        'farm_supply',
        'market_trade',
        'repair_items',
        'plant_tree',
        'craft_order_place',
        'craft_order_claim',
        'craft_order_cancel',
    ].includes(message.type)
}

export function parseExtraCommand(
    record: Record<string, unknown>
): ParseResult {
    const type = record['type']
    const service = parseMerchantService(record)
    if (service !== undefined) {
        return service
    }
    const order = parseCraftOrderCommand(record)
    if (order !== undefined) {
        return order
    }
    const economy = parseEconomyCommand(record)
    if (economy !== undefined) {
        return economy
    }
    if (type === 'dash') {
        return { message: { type } }
    }
    if (type === 'movement_mode') {
        return parseMovementMode(record)
    }
    if (type === 'world_interact' && validId(record['objectId'])) {
        return { message: { type, objectId: record['objectId'] } }
    }
    const targetId = record['targetId']
    const choiceId = record['choiceId']
    if (isTargetCommand(type) && validId(targetId)) {
        return { message: { type, targetId } }
    }
    if (type === 'dialogue_choice' && validId(choiceId)) {
        return { message: { type, choiceId } }
    }
    return parseResourceCommand(record)
}

function parseResourceCommand(record: Record<string, unknown>): ParseResult {
    const type = record['type']
    const itemId = record['itemId']
    const nodeId = record['nodeId']
    const recipeId = record['recipeId']
    if (isFarmCommand(type)) {
        return parseFarmCommand(record)
    }
    if (type === 'gather' && validId(nodeId)) {
        const operation = record['operation']
        return operation === undefined || isGatherOperation(operation)
            ? {
                  message: {
                      type,
                      nodeId,
                      ...(operation === undefined ? {} : { operation }),
                  },
              }
            : { error: 'Invalid gather operation.' }
    }
    if (type === 'trade' && isCraftItem(itemId)) {
        return { message: { type, itemId } }
    }
    if (type === 'craft' && isRecipe(recipeId)) {
        return { message: { type, recipeId } }
    }
    return parseMindCommand(record)
}

function parseFarmSupplyCommand(record: Record<string, unknown>): ParseResult {
    const { npcId, plotId, requestId } = record
    return validId(npcId) && validId(plotId) && validId(requestId)
        ? { message: { type: 'farm_supply', npcId, plotId, requestId } }
        : { error: 'Invalid farm supply command.' }
}

function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}

function isCraftItem(
    value: unknown
): value is
    'food' | 'simple_sword' | 'boots' | 'axe' | 'pickaxe' | 'stone_axe' {
    return (
        value === 'food' ||
        value === 'simple_sword' ||
        value === 'boots' ||
        value === 'axe' ||
        value === 'pickaxe' ||
        value === 'stone_axe'
    )
}

function isRecipe(
    value: unknown
): value is
    | 'food'
    | 'simple_sword'
    | 'boots'
    | 'axe'
    | 'pickaxe'
    | 'stone_axe'
    | 'bake_bread' {
    return isCraftItem(value) || value === 'bake_bread'
}

function parseFarmCommand(record: Record<string, unknown>): ParseResult {
    if (record['type'] === 'farm_supply') {
        return parseFarmSupplyCommand(record)
    }
    const plotId = record['plotId']
    const action = record['action']
    if (
        !validId(plotId) ||
        plotId.trim().length === 0 ||
        (action !== 'sow' && action !== 'harvest')
    ) {
        return { error: 'Invalid farm action.' }
    }
    return { message: { type: 'farm_action', plotId, action } }
}

function isFarmCommand(type: unknown): boolean {
    return type === 'farm_action' || type === 'farm_supply'
}

function parseMovementMode(record: Record<string, unknown>): ParseResult {
    const mode = record['mode']
    if (mode !== 'walking' && mode !== 'sneaking') {
        return { error: 'Invalid movement mode.' }
    }
    return { message: { type: 'movement_mode', mode } }
}

function isTargetCommand(
    type: unknown
): type is
    | 'interact'
    | 'revive'
    | 'steal'
    | 'call_guards'
    | 'report_theft'
    | 'absolve' {
    return (
        type === 'interact' ||
        type === 'revive' ||
        type === 'steal' ||
        type === 'call_guards' ||
        type === 'report_theft' ||
        type === 'absolve'
    )
}
