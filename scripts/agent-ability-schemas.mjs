const targetId = { type: 'string', minLength: 1, maxLength: 100 }
export const abilityDecisionSchemas = [
    {
        type: 'object',
        required: ['type', 'abilityId', 'targetId'],
        additionalProperties: false,
        properties: {
            type: { const: 'use_ability' },
            abilityId: {
                enum: [
                    'spark',
                    'shot',
                    'skeleton_strike',
                    'fireball',
                    'greater_fireball',
                ],
            },
            targetId,
        },
    },
    {
        type: 'object',
        required: ['type', 'abilityId'],
        additionalProperties: false,
        properties: {
            type: { const: 'use_ability' },
            abilityId: { const: 'barrier' },
        },
    },
    {
        type: 'object',
        required: ['type', 'abilityId', 'intent'],
        additionalProperties: false,
        properties: {
            type: { const: 'use_ability' },
            abilityId: { const: 'pray' },
            intent: {
                oneOf: [
                    {
                        type: 'object',
                        required: ['mode', 'targetId'],
                        additionalProperties: false,
                        properties: {
                            mode: { enum: ['restore', 'revive'] },
                            targetId,
                        },
                    },
                    {
                        type: 'object',
                        required: ['mode'],
                        additionalProperties: false,
                        properties: { mode: { const: 'harm' }, targetId },
                    },
                ],
            },
        },
    },
    {
        type: 'object',
        required: ['type', 'abilityId', 'targetId'],
        additionalProperties: false,
        properties: {
            type: { const: 'learn_ability' },
            abilityId: { enum: ['pray', 'spark', 'barrier', 'shot'] },
            targetId,
        },
    },
    {
        type: 'object',
        required: ['type', 'targetId'],
        additionalProperties: false,
        properties: {
            type: { enum: ['follow', 'auto_attack'] },
            targetId: { oneOf: [targetId, { type: 'null' }] },
        },
    },
    {
        type: 'object',
        required: ['type'],
        additionalProperties: false,
        properties: { type: { const: 'cancel_control' } },
    },
]
