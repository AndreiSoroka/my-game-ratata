import type { CompanionRequest } from '@my-game-ratata/contracts'

import { parseAbilityCommand } from './abilityCommands'
import { parseCombatReference } from './combatTargetParsing'
import type { ParseResult } from './messages'
import { parseSocialCommand } from './socialCommands'

const requests: CompanionRequest[] = [
    'follow',
    'guard',
    'help',
    'dismiss',
    'talk',
]

export function parseMindCommand(record: Record<string, unknown>): ParseResult {
    const type = record['type']
    if (
        type === 'use_ability' ||
        type === 'learn_ability' ||
        type === 'cancel_prayer'
    ) {
        const message = parseAbilityCommand(record)
        return message === undefined
            ? { error: 'Invalid ability command.' }
            : { message }
    }
    const targetId = record['targetId']
    const skillId = record['skillId']
    if (type === 'pray') {
        return { message: { type } }
    }
    if (type === 'learn_skill' && skillId === 'fireball' && validId(targetId)) {
        return { message: { type, skillId, targetId } }
    }
    if (type === 'cast_spell') {
        return parseSpell(record)
    }
    return parseKnowledgeCommand(record)
}

function parseSpell(record: Record<string, unknown>): ParseResult {
    const skillId = record['skillId']
    const reference = parseCombatReference(record)
    return (skillId === 'fireball' || skillId === 'greater_fireball') &&
        reference !== undefined &&
        (reference.targetId !== undefined || reference.target !== undefined)
        ? { message: { type: 'cast_spell', skillId, ...reference } }
        : { error: 'Invalid spell target' }
}

function parseKnowledgeCommand(record: Record<string, unknown>): ParseResult {
    const type = record['type']
    const targetId = record['targetId']
    const deityId = record['deityId']
    if (
        (type === 'study_magic' || type === 'teach_magic') &&
        validId(targetId)
    ) {
        return { message: { type, targetId } }
    }
    if (
        type === 'choose_deity' &&
        validId(targetId) &&
        (deityId === 'hearth' ||
            deityId === 'road' ||
            deityId === 'lantern' ||
            deityId === 'grave')
    ) {
        return { message: { type, targetId, deityId } }
    }
    return parseCompanionRequest(record)
}

function parseCompanionRequest(record: Record<string, unknown>): ParseResult {
    const type = record['type']
    const targetId = record['targetId']
    if (type === 'companion_request' && validId(targetId)) {
        const request = requests.find((value) => value === record['request'])
        const text = record['text']
        if (
            request !== undefined &&
            (text === undefined || typeof text === 'string')
        ) {
            return {
                message: {
                    type,
                    targetId,
                    request,
                    ...(typeof text === 'string'
                        ? { text: text.trim().slice(0, 400) }
                        : {}),
                },
            }
        }
    }
    return parseSocialCommand(record)
}

function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}
