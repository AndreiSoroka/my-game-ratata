import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

function messages(input) {
    const result = spawnSync(process.execPath, ['scripts/agent-mcp.mjs'], {
        encoding: 'utf8',
        env: {
            ...process.env,
            GAME_AGENT_TOKEN: '',
            GAME_AGENT_URL: 'http://127.0.0.1:3000',
        },
        input:
            input.map((message) => JSON.stringify(message)).join('\n') + '\n',
        timeout: 5000,
    })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
}

test('MCP negotiates, lists tools and ignores notifications without stdout noise', () => {
    const output = messages([
        {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'test', version: '1' },
            },
        },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        { jsonrpc: '2.0', id: 3, method: 'unknown' },
    ])
    assert.equal(output.length, 3)
    assert.equal(output[0].result.protocolVersion, '2025-06-18')
    assert.deepEqual(
        output[1].result.tools.map((tool) => tool.name),
        ['ratata_observe', 'ratata_act']
    )
    assert.equal(output[2].error.code, -32601)
})

test('MCP returns a tool error if the local bridge is not configured', () => {
    const [result] = messages([
        {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'ratata_observe', arguments: {} },
        },
    ])
    assert.equal(result.result.isError, true)
    assert.match(result.result.content[0].text, /GAME_AGENT_TOKEN/)
})

test('MCP exposes validated shared container commands and private actor results', () => {
    const [message] = messages([
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ])
    const act = message.result.tools.find((tool) => tool.name === 'ratata_act')
    const decisions = act.inputSchema.properties.decision.oneOf
    for (const type of [
        'open_chest',
        'close_chest',
        'take_all_chest_items',
        'take_chest_gold',
        'take_chest_item',
        'put_chest_item',
    ]) {
        const schema = decisions.find(
            (entry) =>
                entry.properties.type.const === type ||
                entry.properties.type.enum?.includes(type)
        )
        assert.ok(schema, `Missing ${type}`)
        assert.ok(schema.required.includes('chestId'))
        assert.equal(schema.additionalProperties, false)
        if (type === 'take_chest_item' || type === 'put_chest_item')
            assert.ok(schema.required.includes('itemInstanceId'))
    }
    assert.match(act.description, /private shared container/)
    const gait = decisions.find(
        (entry) => entry.properties.type.const === 'movement_mode'
    )
    assert.deepEqual(gait.properties.mode.enum, ['walking', 'sneaking'])
    assert.doesNotMatch(act.description, /running/)
})

test('MCP exposes an optional exact ground-item pickup target', () => {
    const [message] = messages([
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ])
    const act = message.result.tools.find((tool) => tool.name === 'ratata_act')
    const pickup = act.inputSchema.properties.decision.oneOf.find(
        (entry) => entry.properties.type.const === 'pickup_item'
    )
    assert.ok(pickup)
    assert.deepEqual(pickup.required, ['type'])
    assert.deepEqual(pickup.properties.worldItemId, {
        type: 'string',
        minLength: 1,
        maxLength: 100,
    })
    assert.equal(pickup.additionalProperties, false)
    assert.match(act.description, /explicit target never falls back/)
})

test('MCP exposes pinned abilities and cancelable ordinary character control', () => {
    const [message] = messages([
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ])
    const act = message.result.tools.find((tool) => tool.name === 'ratata_act')
    const choices = act.inputSchema.properties.decision.oneOf
    const prayer = choices.find(
        (entry) => entry.properties.abilityId?.const === 'pray'
    )
    assert.ok(prayer.required.includes('intent'))
    assert.equal(prayer.additionalProperties, false)
    assert.ok(
        prayer.properties.intent.oneOf.some(
            (entry) => entry.properties.mode.const === 'harm'
        )
    )
    const control = choices.find((entry) =>
        entry.properties.type.enum?.includes('auto_attack')
    )
    assert.ok(control.required.includes('targetId'))
    assert.ok(
        control.properties.targetId.oneOf.some((entry) => entry.type === 'null')
    )
    assert.ok(
        choices.some(
            (entry) => entry.properties.type.const === 'cancel_control'
        )
    )
    const automatic = choices.find(
        (entry) => entry.properties.type.const === 'auto_action'
    )
    assert.deepEqual(automatic.required, ['type', 'action'])
    assert.equal(automatic.additionalProperties, false)
    assert.ok(
        automatic.properties.action.oneOf.some((entry) => entry.type === 'null')
    )
    assert.ok(
        automatic.properties.action.oneOf.some(
            (entry) => entry.properties?.kind.const === 'prayer'
        )
    )
    assert.ok(
        prayer.properties.intent.oneOf.some(
            (entry) => entry.properties.mode.const === 'devotion'
        )
    )
    assert.match(act.description, /waves may harm allies/)
    assert.doesNotMatch(act.description, /Cannot[^.]*resurrect/)
})

test('MCP exposes typed grave attacks, purification and explicit channel cancellation', () => {
    const [message] = messages([
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ])
    const act = message.result.tools.find((tool) => tool.name === 'ratata_act')
    const choices = act.inputSchema.properties.decision.oneOf
    const attack = choices.find(
        (entry) =>
            entry.properties.type.const === 'attack' && entry.properties.target
    )
    assert.deepEqual(attack.required, ['type', 'target'])
    assert.equal(attack.properties.target.properties.kind.const, 'grave')
    assert.equal(attack.properties.target.additionalProperties, false)
    const prayer = choices.find(
        (entry) => entry.properties.abilityId?.const === 'pray'
    )
    const purification = prayer.properties.intent.oneOf.find(
        (entry) => entry.properties.mode.const === 'purify_grave'
    )
    assert.deepEqual(purification.required, ['mode', 'target'])
    assert.equal(purification.additionalProperties, false)
    assert.equal(purification.properties.target.properties.kind.const, 'grave')
    assert.ok(
        choices.some((entry) => entry.properties.type.const === 'cancel_prayer')
    )
    const automatic = choices.find(
        (entry) => entry.properties.type.const === 'auto_action'
    )
    assert.ok(
        automatic.properties.action.oneOf.some(
            (entry) =>
                entry.properties?.kind.const === 'attack' &&
                entry.properties.target?.properties.kind.const === 'grave'
        )
    )
    assert.match(act.description, /10 seconds/)
    assert.match(act.description, /20 mana only on success/)
})
