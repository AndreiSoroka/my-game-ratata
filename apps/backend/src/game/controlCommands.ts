import type {
    CharacterAutoAction,
    CharacterControlCommand,
} from '@my-game-ratata/contracts'

import { parseAbilityCommand } from './abilityCommands'
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
    if (record['kind'] === 'attack') {
        return parseAttack(record['targetId'])
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
    }
}
function parseAttack(targetId: unknown): CharacterAutoAction | undefined {
    return typeof targetId === 'string' &&
        targetId.trim().length > 0 &&
        targetId.length <= 100
        ? { kind: 'attack', targetId }
        : undefined
}
