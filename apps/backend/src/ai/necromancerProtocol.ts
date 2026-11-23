import { isNecromancerBark, necromancerBarks } from '../game/necromancerSpeech'
import type { NecromancerModelDecision } from '../game/necromancerTactics'
import { isObject } from './npcCliProtocol'

export const necromancerDecisionSchema = JSON.stringify({
    type: 'object',
    additionalProperties: false,
    required: ['choice', 'note', 'bark', 'speech'],
    properties: {
        choice: { type: 'integer', minimum: 0, maximum: 31 },
        note: { type: 'string', maxLength: 140 },
        bark: { type: 'string', enum: ['none', ...necromancerBarks] },
        speech: { type: ['string', 'null'], maxLength: 140 },
    },
})

export function parseNecromancerDecision(
    input: unknown
): NecromancerModelDecision {
    if (
        !isObject(input) ||
        Object.keys(input).some(
            (key) => !['choice', 'note', 'bark', 'speech'].includes(key)
        ) ||
        !validChoice(input['choice']) ||
        typeof input['note'] !== 'string' ||
        input['note'].length > 140 ||
        !validBark(input['bark']) ||
        !validSpeech(input['speech'])
    ) {
        throw new Error('Invalid necromancer decision')
    }
    return {
        choice: input['choice'],
        note: input['note'],
        ...(isNecromancerBark(input['bark']) ? { bark: input['bark'] } : {}),
        ...(input['speech'] === undefined ? {} : { speech: input['speech'] }),
    }
}

function validChoice(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 31
    )
}

function validSpeech(value: unknown): value is string | null | undefined {
    return value == null || (typeof value === 'string' && value.length <= 140)
}

function validBark(value: unknown): boolean {
    return value === undefined || value === 'none' || isNecromancerBark(value)
}
