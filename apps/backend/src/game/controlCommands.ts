import {
    type CharacterAutoAction,
    type CharacterControlCommand,
} from '@my-game-ratata/contracts'

import { parseAbilityCommand } from './abilityCommands'
import { isAshRiteMessage } from './ashRiteCommands'
import { parseCombatReference } from './combatTargetParsing'
import { parseGatherAction, parsePlantAction } from './forestCommands'
export function parseControlCommand(
    record: Record<string, unknown>
): CharacterControlCommand | undefined {
    if (record['type'] === 'auto_action') {
        if (record['action'] === null) {
            return { type: 'auto_action', action: null }
        }
        const action = parseAutoAction(record['action'])
        return action === undefined
            ? undefined
            : { type: 'auto_action', action }
    }
    if (record['type'] === 'cancel_control') {
        return { type: 'cancel_control' }
    }
    if (record['type'] !== 'follow' && record['type'] !== 'auto_attack') {
        return undefined
    }
    const targetId = record['targetId']
    return targetId === null ||
        (typeof targetId === 'string' &&
            targetId.length > 0 &&
            targetId.length <= 100)
        ? { type: record['type'], targetId }
        : undefined
}
export function parseAutoAction(
    value: unknown
): CharacterAutoAction | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined
    }
    const record = value as Record<string, unknown>
    if ('once' in record) {
        return parseSingleAttack(record)
    }
    if (record['kind'] === 'gather') {
        return parseGatherAction(record)
    }
    if (record['kind'] === 'plant_tree') {
        return parsePlantAction(record['position'])
    }
    if (record['kind'] === 'attack') {
        const reference = parseCombatReference(record)
        return reference !== undefined &&
            (reference.targetId !== undefined || reference.target !== undefined)
            ? { kind: 'attack', ...reference }
            : undefined
    }
    return parseAutomaticAbility(record)
}
function parseSingleAttack(
    record: Record<string, unknown>
): CharacterAutoAction | undefined {
    if (record['kind'] !== 'attack' || record['once'] !== true) {
        return undefined
    }
    const reference = parseCombatReference(record)
    return reference?.targetId === undefined
        ? undefined
        : { kind: 'attack', targetId: reference.targetId, once: true }
}
function parseAutomaticAbility(
    record: Record<string, unknown>
): CharacterAutoAction | undefined {
    const message = parseAbilityCommand({
        type: 'use_ability',
        abilityId: automaticAbilityId(record),
        targetId: record['targetId'],
        target: record['target'],
        intent: record['intent'],
    })
    if (message?.type !== 'use_ability') {
        return undefined
    }
    if (record['kind'] === 'prayer' && 'intent' in message) {
        return {
            kind: 'prayer',
            ...(record['abilityId'] === undefined
                ? {}
                : { abilityId: message.abilityId }),
            intent: message.intent,
        }
    }
    if (
        record['kind'] !== 'ability' ||
        'intent' in message ||
        isAshRiteMessage(message)
    ) {
        return undefined
    }
    return {
        kind: 'ability',
        abilityId: message.abilityId,
        ...(message.targetId === undefined
            ? {}
            : { targetId: message.targetId }),
        ...(message.target === undefined ? {} : { target: message.target }),
    }
}

function automaticAbilityId(record: Record<string, unknown>): unknown {
    return record['kind'] === 'prayer' && record['abilityId'] === undefined
        ? 'pray'
        : record['abilityId']
}
