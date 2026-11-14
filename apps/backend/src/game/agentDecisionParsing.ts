import type {
    AgentDecision,
    MovementClientMessage,
    TheftClientMessage,
} from '@my-game-ratata/contracts'

import { parseAgentCapability } from './agentCapabilities'
import {
    isInventoryDecisionType,
    parseInventoryDecision,
} from './agentInventory'
import { parseCombatReference } from './combatTargetParsing'
import { isAdventureCommand, parseExtraCommand } from './extraCommands'
import { parseClientMessage } from './messages'
import { isAutomationCommand, parseAutomationCommand } from './scenarioCommands'
import { isTheftCommandType } from './theftCommands'

export function parseAgentDecision(input: unknown): AgentDecision | undefined {
    if (input === null || typeof input !== 'object') {
        return undefined
    }
    const record = input as Record<string, unknown>
    const shared = parseSharedDecision(record)
    if (shared !== undefined) {
        return shared
    }
    switch (record['type']) {
        case 'wait':
            return { type: 'wait' }
        case 'dash':
            return { type: 'dash' }
        case 'movement_mode':
            return parseMovementMode(record['mode'])
        case 'attack':
            return parseAttack(record)
        case 'speak':
            return parseSpeech(record['text'])
        case 'move':
            return parseVector('move', record['axis'])
        case 'move_to':
            return parseMoveTo(record)
        default:
            return undefined
    }
}

function parseMoveTo(
    record: Record<string, unknown>
): AgentDecision | undefined {
    if (
        record['append'] !== undefined &&
        typeof record['append'] !== 'boolean'
    ) {
        return undefined
    }
    const move = parseVector('move_to', record['target'])
    return move === undefined
        ? undefined
        : {
              ...move,
              ...(record['append'] === undefined
                  ? {}
                  : { append: record['append'] }),
          }
}

function parseAttack(
    record: Record<string, unknown>
): AgentDecision | undefined {
    const reference = parseCombatReference(record)
    return reference !== undefined &&
        (reference.targetId !== undefined || reference.target !== undefined)
        ? { ...reference, type: 'attack' }
        : undefined
}

function parseSpeech(text: unknown): AgentDecision | undefined {
    return typeof text === 'string' &&
        text.trim().length > 0 &&
        text.length <= 160
        ? { text: text.trim(), type: 'speak' }
        : undefined
}

function parseVector(
    type: 'move' | 'move_to',
    point: unknown
): AgentDecision | undefined {
    if (point === null || typeof point !== 'object') {
        return undefined
    }
    const vector = point as Record<string, unknown>
    const x = vector['x']
    const y = vector['y']
    if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return undefined
    }
    if (type === 'move' && (Math.abs(x) > 1 || Math.abs(y) > 1)) {
        return undefined
    }
    return type === 'move'
        ? { axis: { x, y }, type }
        : { target: { x, y }, type }
}

function parseMovementMode(mode: unknown): MovementClientMessage | undefined {
    return mode === 'sneaking' || mode === 'walking'
        ? { type: 'movement_mode', mode }
        : undefined
}

function parseTheft(
    type: TheftClientMessage['type'],
    targetId: unknown
): TheftClientMessage | undefined {
    return typeof targetId === 'string' &&
        targetId.length > 0 &&
        targetId.length <= 100
        ? { type, targetId }
        : undefined
}

function parseSharedDecision(
    record: Record<string, unknown>
): AgentDecision | undefined {
    if (isAutomationCommand(record['type'])) {
        return parseAutomationCommand(record)
    }
    if (
        record['type'] === 'inventory_action' ||
        record['type'] === 'equipment_action'
    ) {
        const parsed = parseClientMessage(JSON.stringify(record)).message
        if (
            parsed?.type === 'inventory_action' ||
            parsed?.type === 'equipment_action'
        ) {
            return parsed
        }
        return undefined
    }
    const extra = parseExtraCommand(record)
    if (extra.message !== undefined && isAdventureCommand(extra.message)) {
        return extra.message
    }
    if (isTheftCommandType(record['type'])) {
        return parseTheft(record['type'], record['targetId'])
    }
    if (isInventoryDecisionType(record['type'])) {
        return parseInventoryDecision(record)
    }
    return parseAgentCapability(record)
}
