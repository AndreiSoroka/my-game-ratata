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
    maxItems: 64,
    items: {
        oneOf: [
            step('go', { destination, dash: { type: 'boolean' } }, [
                'destination',
            ]),
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
            step(
                'attack',
                { target: { enum: ['visible_enemy', 'reaction_target'] } },
                []
            ),
            step('follow', {
                target: { enum: ['nearest_friendly', 'reaction_target'] },
            }),
            step('cast', {
                abilityId: { enum: scenarioAbilityIds },
                target: { enum: ['self', 'visible_enemy', 'reaction_target'] },
            }),
            step('farm', {
                action: { enum: ['sow', 'harvest'] },
                plotId: id,
                locationId,
            }),
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
const tileDistance = { type: 'integer', minimum: 1, maximum: 64 }
const scenarioTrigger = {
    oneOf: [
        object({
            kind: { const: 'enemy_visible' },
            distanceTiles: tileDistance,
        }),
        object(
            {
                kind: { const: 'friendly_nearby' },
                distanceTiles: tileDistance,
                onlyWhenNotFollowing: { type: 'boolean' },
            },
            ['kind', 'distanceTiles']
        ),
        object({ kind: { const: 'inventory_full' } }),
        object({ kind: { const: 'plot_ripe' }, plotId: id, locationId }),
        object({
            kind: { const: 'step_result' },
            stepId: id,
            status: { enum: ['succeeded', 'failed'] },
        }),
    ],
}
export const scenarioDecisionSchemas = [
    command('marker_create', { name }, []),
    command('marker_rename', { markerId: id, name }),
    command('marker_delete', { markerId: id }),
    command('scenario_save', {
        scenario: object({
            id,
            name,
            main: steps,
            repeat: {
                oneOf: [
                    { type: 'null' },
                    { type: 'integer', minimum: 1, maximum: 10000 },
                ],
            },
            sequences: {
                type: 'array',
                maxItems: 64,
                items: object({ id, name, steps: { ...steps, minItems: 1 } }),
            },
            reactions: {
                type: 'array',
                maxItems: 64,
                items: object(
                    {
                        id,
                        trigger: scenarioTrigger,
                        sequenceId: id,
                        delayMs: {
                            type: 'integer',
                            minimum: 0,
                            maximum: 3600000,
                        },
                        notification: {
                            type: 'string',
                            minLength: 1,
                            maxLength: 160,
                        },
                    },
                    ['id', 'trigger', 'sequenceId']
                ),
            },
        }),
    }),
    command('scenario_delete', { scenarioId: id }),
    command('scenario_start', { scenarioId: id, targetId: id }, ['scenarioId']),
    ...['scenario_pause', 'scenario_resume', 'scenario_stop'].map((type) =>
        command(type, { targetId: id }, [])
    ),
    command('release_input'),
]
import { scenarioAbilityIds } from '../contracts/src/scenarios.ts'
import { WORLD_LOCATION_DEFINITIONS } from '../contracts/src/world.ts'
