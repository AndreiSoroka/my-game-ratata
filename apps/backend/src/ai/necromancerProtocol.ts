import { isNecromancerBark, necromancerBarks } from '../game/necromancerSpeech'
import type { NecromancerModelDecision } from '../game/necromancerTactics'
import { isObject } from './npcCliProtocol'

export const necromancerDecisionSchema = JSON.stringify({
    type: 'object',
    additionalProperties: false,
    required: ['choice', 'note', 'bark'],
    properties: {
        choice: { type: 'integer', minimum: 0, maximum: 31 },
        note: { type: 'string', maxLength: 140 },
        bark: { type: 'string', enum: ['none', ...necromancerBarks] },
    },
})

export function parseNecromancerDecision(
    input: unknown
): NecromancerModelDecision {
    if (
        !isObject(input) ||
        Object.keys(input).some(
            (key) => !['choice', 'note', 'bark'].includes(key)
        ) ||
        typeof input['choice'] !== 'number' ||
        !Number.isInteger(input['choice']) ||
        input['choice'] < 0 ||
        input['choice'] > 31 ||
        typeof input['note'] !== 'string' ||
        input['note'].length > 140 ||
        !validBark(input['bark'])
    ) {
        throw new Error('Invalid necromancer decision')
    }
    return {
        choice: input['choice'],
        note: input['note'],
        ...(isNecromancerBark(input['bark']) ? { bark: input['bark'] } : {}),
    }
}

function validBark(value: unknown): boolean {
    return value === undefined || value === 'none' || isNecromancerBark(value)
}
