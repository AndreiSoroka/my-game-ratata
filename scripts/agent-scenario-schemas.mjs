const id = { type: 'string', minLength: 1, maxLength: 100 }
const name = { type: 'string', minLength: 1, maxLength: 80 }
const search = {
    enum: [
        'tree',
        'stone',
        'herbs',
        'fiber',
        'scrap',
        'grain',
        'brushwood',
        'enemy',
        'chest',
        'item',
    ],
}
const itemId = { type: 'string', minLength: 1, maxLength: 100 }
const locationId = {
    type: 'string',
    enum: WORLD_LOCATION_DEFINITIONS.map((location) => location.id),
}
function object(properties, required = Object.keys(properties)) {
    return { type: 'object', required, additionalProperties: false, properties }
}
function command(type, properties = {}, required = Object.keys(properties)) {
    return object({ type: { const: type }, ...properties }, [
        'type',
        ...required,
    ])
}
function step(kind, properties = {}, required = Object.keys(properties)) {
    return object({ id, kind: { const: kind }, ...properties }, [
        'id',
        'kind',
        ...required,
    ])
}
const destination = {
    oneOf: [
        object({ kind: { const: 'marker' }, markerId: id }),
        object({
            kind: { const: 'point' },
            locationId,
            position: object({
                x: { type: 'number', minimum: 0, maximum: 100000 },
                y: { type: 'number', minimum: 0, maximum: 100000 },
            }),
        }),
        object(
            {
                kind: { const: 'visible' },
                target: search,
                itemId,
            },
            ['kind', 'target']
        ),
        object(
            {
                kind: { const: 'visible' },
                target: search,
                targetId: id,
                itemId,
                locationId,
            },
            ['kind', 'target', 'targetId']
        ),
    ],
}
const steps = {
    type: 'array',
    minItems: 1,
    maxItems: 64,
    items: {
        oneOf: [
            step('go', { destination }),
            step('search', { target: search, itemId }, ['target']),
            step('gather', {
                resource: {
                    enum: [
                        'wood',
                        'brushwood',
                        'stone',
                        'herbs',
                        'fiber',
                        'scrap',
                        'grain',
                    ],
                },
                amount: {
                    oneOf: [
                        { const: 'depleted' },
                        { type: 'integer', minimum: 1, maximum: 10000 },
                    ],
                },
            }),
            step('attack'),
            step('pickup', { itemId }, []),
            step(
                'deposit',
                {
                    mode: { enum: ['all', 'acquired'] },
                    itemIds: { type: 'array', maxItems: 100, items: itemId },
                },
                ['mode', 'itemIds']
            ),
            step(
                'deposit',
                {
                    chestId: id,
                    locationId,
                    mode: { enum: ['all', 'acquired'] },
                    itemIds: { type: 'array', maxItems: 100, items: itemId },
                },
                ['chestId', 'mode', 'itemIds']
            ),
            step('wait', {
                durationMs: { type: 'integer', minimum: 0, maximum: 3600000 },
            }),
            step('recover', {
                resource: { enum: ['energy', 'mana', 'hp'] },
                atLeast: { type: 'integer', minimum: 1, maximum: 10000 },
            }),
        ],
    },
}
export const scenarioDecisionSchemas = [
    command('marker_create', { name }, []),
    command('marker_rename', { markerId: id, name }),
    command('marker_delete', { markerId: id }),
    command('scenario_save', {
        scenario: object({
            id,
            name,
            steps,
            repeat: {
                oneOf: [
                    { type: 'null' },
                    { type: 'integer', minimum: 1, maximum: 10000 },
                ],
            },
            threat: { enum: ['continue', 'attack', 'flee'] },
        }),
    }),
    command('scenario_delete', { scenarioId: id }),
    command('scenario_start', { scenarioId: id, targetId: id }, ['scenarioId']),
    ...['scenario_pause', 'scenario_resume', 'scenario_stop'].map((type) =>
        command(type, { targetId: id }, [])
    ),
    command('release_input'),
]
import { WORLD_LOCATION_DEFINITIONS } from '../contracts/src/world.ts'
