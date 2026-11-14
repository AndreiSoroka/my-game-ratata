const targetId = { type: 'string', minLength: 1, maxLength: 100 }
const graveTarget = {
    type: 'object',
    required: ['kind', 'id'],
    additionalProperties: false,
    properties: { kind: { const: 'grave' }, id: targetId },
}
const graveAbilities = [
    'shot',
    'spark',
    'skeleton_strike',
    'fireball',
    'greater_fireball',
]
const prayerIntent = {
    oneOf: [
        {
            type: 'object',
            required: ['mode', 'target'],
            additionalProperties: false,
            properties: {
                mode: { const: 'purify_grave' },
                target: graveTarget,
            },
        },
        {
            type: 'object',
            required: ['mode'],
            additionalProperties: false,
            properties: { mode: { const: 'devotion' } },
        },
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
}
export const abilityDecisionSchemas = [
    {
        type: 'object',
        required: ['type', 'target'],
        additionalProperties: false,
        properties: { type: { const: 'attack' }, target: graveTarget },
    },
    {
        type: 'object',
        required: ['type'],
        additionalProperties: false,
        properties: { type: { const: 'cancel_prayer' } },
    },
    {
        type: 'object',
        required: ['type', 'abilityId', 'target'],
        additionalProperties: false,
        properties: {
            type: { const: 'use_ability' },
            abilityId: { enum: graveAbilities },
            target: graveTarget,
        },
    },
    {
        type: 'object',
        required: ['type', 'abilityId'],
        additionalProperties: false,
        properties: {
            type: { const: 'use_ability' },
            abilityId: { const: 'shot' },
            targetId,
        },
    },
    {
        type: 'object',
        required: ['type', 'abilityId', 'targetId'],
        additionalProperties: false,
        properties: {
            type: { const: 'use_ability' },
            abilityId: {
                enum: [
                    'spark',
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
            intent: prayerIntent,
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
    {
        type: 'object',
        required: ['type', 'action'],
        additionalProperties: false,
        properties: {
            type: { const: 'auto_action' },
            action: {
                oneOf: [
                    {
                        type: 'object',
                        required: ['kind', 'target'],
                        additionalProperties: false,
                        properties: {
                            kind: { const: 'attack' },
                            target: graveTarget,
                        },
                    },
                    {
                        type: 'object',
                        required: ['kind', 'abilityId', 'target'],
                        additionalProperties: false,
                        properties: {
                            kind: { const: 'ability' },
                            abilityId: { enum: graveAbilities },
                            target: graveTarget,
                        },
                    },
                    {
                        type: 'object',
                        required: ['kind', 'abilityId'],
                        additionalProperties: false,
                        properties: {
                            kind: { const: 'ability' },
                            abilityId: { const: 'shot' },
                            targetId,
                        },
                    },
                    { type: 'null' },
                    {
                        type: 'object',
                        required: ['kind', 'targetId'],
                        additionalProperties: false,
                        properties: { kind: { const: 'attack' }, targetId },
                    },
                    {
                        type: 'object',
                        required: ['kind', 'abilityId', 'targetId'],
                        additionalProperties: false,
                        properties: {
                            kind: { const: 'ability' },
                            abilityId: {
                                enum: [
                                    'spark',
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
                        required: ['kind', 'abilityId'],
                        additionalProperties: false,
                        properties: {
                            kind: { const: 'ability' },
                            abilityId: { const: 'barrier' },
                        },
                    },
                    {
                        type: 'object',
                        required: ['kind', 'intent'],
                        additionalProperties: false,
                        properties: {
                            kind: { const: 'prayer' },
                            intent: prayerIntent,
                        },
                    },
                ],
            },
        },
    },
]
