const id = { type: 'string', minLength: 1, maxLength: 100 }
const items = [
    'wood',
    'brushwood',
    'stone',
    'herbs',
    'fiber',
    'scrap',
    'grain',
    'food',
    'sapling',
    'simple_sword',
    'boots',
    'axe',
    'pickaxe',
    'stone_axe',
]
function command(type, properties) {
    return {
        type: 'object',
        required: ['type', ...Object.keys(properties)],
        additionalProperties: false,
        properties: { type: { const: type }, ...properties },
    }
}
const interact = command('interact', { targetId: id })
interact.properties.service = { enum: ['shop', 'orders', 'repair'] }
const gather = command('gather', { nodeId: id })
gather.properties.operation = {
    enum: ['harvest', 'clear_stump', 'cut_sapling'],
}
export const economyDecisionSchemas = [
    gather,
    interact,
    command('dialogue_choice', { choiceId: id }),
    command('craft', {
        recipeId: {
            enum: [
                'bake_bread',
                'food',
                'simple_sword',
                'boots',
                'axe',
                'pickaxe',
                'stone_axe',
            ],
        },
    }),
    command('farm_action', {
        plotId: id,
        action: { enum: ['sow', 'harvest'] },
    }),
    command('plant_tree', {
        position: {
            type: 'object',
            required: ['x', 'y'],
            additionalProperties: false,
            properties: { x: { type: 'number' }, y: { type: 'number' } },
        },
    }),
    command('market_trade', {
        npcId: id,
        side: { enum: ['buy', 'sell'] },
        itemId: { enum: items },
        quantity: { type: 'integer', minimum: 1, maximum: 100 },
        expectedTotal: { type: 'integer', minimum: 0 },
        requestId: id,
    }),
    command('craft_order_place', {
        npcId: id,
        itemId: { enum: items },
        expectedTotal: { type: 'integer', minimum: 0 },
        requestId: id,
    }),
    command('craft_order_claim', {
        npcId: id,
        orderId: id,
        expectedRemaining: { type: 'integer', minimum: 0 },
        requestId: id,
    }),
    command('craft_order_cancel', { npcId: id, orderId: id, requestId: id }),
    command('repair_items', {
        npcId: id,
        instanceIds: {
            type: 'array',
            items: id,
            minItems: 1,
            maxItems: 52,
            uniqueItems: true,
        },
        expectedTotal: { type: 'integer', minimum: 0 },
        requestId: id,
    }),
    command('inventory_action', {
        action: { enum: ['equip', 'eat', 'drop', 'stash'] },
        itemInstanceId: id,
    }),
    command('equipment_action', {
        action: { const: 'unequip' },
        slot: { enum: ['weapon', 'boots'] },
    }),
]
