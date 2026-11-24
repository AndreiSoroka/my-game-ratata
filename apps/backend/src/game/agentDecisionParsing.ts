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
import { parseExchangeCommand } from './exchangeCommands'
import { isAdventureCommand, parseExtraCommand } from './extraCommands'
import { parseClientMessage } from './messages'
import { parseNpcQuestDecision } from './npcQuestCommands'
import { parsePortalUse } from './portalCommand'
import { isAutomationCommand, parseAutomationCommand } from './scenarioCommands'
import { isTheftCommandType } from './theftCommands'

export function parseAgentDecision(input: unknown): AgentDecision | undefined {
    if (input === null || typeof input !== 'object') {
        return undefined
    }
    const record = input as Record<string, unknown>
    const shared =
        parseSocialAgentDecision(record) ?? parseSharedDecision(record)
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
            return parseSpeech(record['text'], record['targetId'])
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

function parseSpeech(
    text: unknown,
    targetId: unknown
): AgentDecision | undefined {
    if (
        targetId !== undefined &&
        (typeof targetId !== 'string' ||
            targetId.length === 0 ||
            targetId.length > 100)
    ) {
        return undefined
    }
    return typeof text === 'string' &&
        text.trim().length > 0 &&
        text.length <= 160
        ? {
              text: text.trim(),
              type: 'speak',
              ...(targetId === undefined ? {} : { targetId }),
          }
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
    if (record['type'] === 'guide') {
        return parseGuide(record['targetKey'])
    }
    if (isAutomationCommand(record['type'])) {
        return parseAutomationCommand(record)
    }
    if (
        record['type'] === 'inventory_action' ||
        record['type'] === 'equipment_action'
    ) {
        return parseInventoryEquipment(record)
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
    return parsePortalUse(record) ?? parseAgentCapability(record)
}

function parseSocialAgentDecision(
    record: Record<string, unknown>
): AgentDecision | undefined {
    if (String(record['type']).startsWith('exchange_')) {
        return parseExchangeCommand(record)
    }
    if (
        record['type'] === 'quest_board_publish' ||
        record['type'] === 'quest_propose' ||
        record['type'] === 'worker_quest_propose' ||
        record['type'] === 'quest_invitation_answer' ||
        record['type'] === 'quest_offer_revise' ||
        record['type'] === 'quest_turn_in_request' ||
        record['type'] === 'quest_inquire'
    ) {
        return parseNpcQuestDecision(record)
    }
    return undefined
}

function parseGuide(targetKey: unknown): AgentDecision | undefined {
    return typeof targetKey === 'string' &&
        targetKey.length > 0 &&
        targetKey.length <= 100
        ? { type: 'guide', targetKey }
        : undefined
}

function parseInventoryEquipment(
    record: Record<string, unknown>
): AgentDecision | undefined {
    const parsed = parseClientMessage(JSON.stringify(record)).message
    return parsed?.type === 'inventory_action' ||
        parsed?.type === 'equipment_action'
        ? parsed
        : undefined
}
