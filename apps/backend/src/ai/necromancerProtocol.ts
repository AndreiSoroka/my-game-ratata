import { necromancerOpeningAbilities } from '../game/necromancerScenario'
import { isNecromancerBark, necromancerBarks } from '../game/necromancerSpeech'
import type {
    NecromancerModelDecision,
    NecromancerScenarioEdit,
} from '../game/necromancerTactics'
import { isObject } from './npcCliProtocol'

export const necromancerDecisionSchema = JSON.stringify({
    type: 'object',
    additionalProperties: false,
    required: ['choice', 'note', 'bark', 'speech', 'scenarioEdit'],
    properties: {
        choice: { type: 'integer', minimum: 0, maximum: 31 },
        note: { type: 'string', maxLength: 140 },
        bark: { type: 'string', enum: ['none', ...necromancerBarks] },
        speech: { type: ['string', 'null'], maxLength: 140 },
        scenarioEdit: {
            anyOf: [
                { type: 'null' },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind'],
                    properties: {
                        kind: { type: 'string', enum: ['clear_opening'] },
                    },
                },
                {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind', 'distanceCells', 'abilityId'],
                    properties: {
                        kind: { type: 'string', enum: ['set_opening'] },
                        distanceCells: {
                            type: 'integer',
                            minimum: 1,
                            maximum: 8,
                        },
                        abilityId: {
                            type: ['string', 'null'],
                            enum: [...necromancerOpeningAbilities, null],
                        },
                    },
                },
            ],
        },
    },
})

export function parseNecromancerDecision(
    input: unknown
): NecromancerModelDecision {
    if (
        !isObject(input) ||
        Object.keys(input).some(
            (key) =>
                !['choice', 'note', 'bark', 'speech', 'scenarioEdit'].includes(
                    key
                )
        ) ||
        !validChoice(input['choice']) ||
        typeof input['note'] !== 'string' ||
        input['note'].length > 140 ||
        !validBark(input['bark']) ||
        !validSpeech(input['speech'])
    ) {
        throw new Error('Invalid necromancer decision')
    }
    const scenarioEdit = parseScenarioEdit(input['scenarioEdit'])
    return {
        choice: input['choice'],
        note: input['note'],
        ...(isNecromancerBark(input['bark']) ? { bark: input['bark'] } : {}),
        ...(input['speech'] === undefined ? {} : { speech: input['speech'] }),
        ...(scenarioEdit === undefined ? {} : { scenarioEdit }),
    }
}

function parseScenarioEdit(
    input: unknown
): NecromancerScenarioEdit | undefined {
    if (input == null) {
        return undefined
    }
    if (isObject(input)) {
        if (
            input['kind'] === 'clear_opening' &&
            Object.keys(input).length === 1
        ) {
            return { kind: 'clear_opening' }
        }
        return parseOpening(input)
    }
    throw new Error('Invalid necromancer scenario edit')
}

function parseOpening(input: Record<string, unknown>): NecromancerScenarioEdit {
    const { kind, distanceCells, abilityId } = input
    const ability = necromancerOpeningAbilities.find((id) => id === abilityId)
    if (
        Object.keys(input).length !== 3 ||
        kind !== 'set_opening' ||
        typeof distanceCells !== 'number' ||
        !Number.isInteger(distanceCells) ||
        distanceCells < 1 ||
        distanceCells > 8 ||
        (abilityId !== null && ability === undefined)
    ) {
        throw new Error('Invalid necromancer scenario edit')
    }
    return { kind, distanceCells, abilityId: ability ?? null }
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
