import type {
    CharacterAutoAction,
    CharacterControlCommand,
} from '@my-game-ratata/contracts'

import { parseAbilityCommand } from './abilityCommands'
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
function parseAutomaticAbility(
    record: Record<string, unknown>
): CharacterAutoAction | undefined {
    const message = parseAbilityCommand({
        type: 'use_ability',
        abilityId: record['kind'] === 'prayer' ? 'pray' : record['abilityId'],
        targetId: record['targetId'],
        target: record['target'],
        intent: record['intent'],
    })
    if (message?.type !== 'use_ability') {
        return undefined
    }
    if (record['kind'] === 'prayer' && message.abilityId === 'pray') {
        return { kind: 'prayer', intent: message.intent }
    }
    if (record['kind'] !== 'ability' || message.abilityId === 'pray') {
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
