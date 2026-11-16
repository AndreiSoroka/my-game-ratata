import assert from 'node:assert/strict'
import test from 'node:test'

import { createHarvestMetadata } from './generate-resources.mjs'

function fixture() {
    const width = 32,
        height = 32,
        size = width * height
    const ctx = {
        width,
        height,
        at: (x, y) => y * width + x,
        solid: Array(size).fill(0),
        roads: Array(size).fill(0),
        reserved: Array(size).fill(0),
        random: () => {
            throw new Error('Must preserve the world RNG sequence')
        },
    }
    const prop = (name, x, y, width, height, profile) => ({
        name,
        x,
        y,
        width,
        height,
        properties: [
            { name: 'propId', value: `prop:${x}:${y}` },
            ...(profile ? [{ name: 'treeProfile', value: profile }] : []),
        ],
    })
    const props = [
        prop('tree', 96, 96, 48, 64, 'forest'),
        prop('plant', 240, 240, 32, 32),
        prop('stone', 320, 160, 16, 16),
        prop('tree', 160, 96, 16, 32, 'pine'),
    ]
    for (let y = 0; y < height; y++) ctx.roads[ctx.at(16, y)] = 1
    for (let x = 0; x < width; x++) ctx.reserved[ctx.at(x, 16)] = 1
    return { ctx, props }
}

test('semantic bushes and small pines preserve original tree/stone metadata identities', () => {
    const { ctx, props } = fixture()
    const layers = createHarvestMetadata(ctx, 'test-location', props, [])
    const sources = layers.find(
        (layer) => layer.name === 'Harvest sources'
    ).objects
    assert.deepEqual(
        sources.slice(0, 3).map((source) => source.id),
        [20000, 20001, 20002]
    )
    assert.deepEqual(
        sources.slice(0, 3).map((source) => source.type),
        ['tree', 'stone', 'tree']
    )
    const get = (source, name) =>
        source.properties.find((property) => property.name === name)?.value
    assert.equal(get(sources[0], 'capacity'), 8)
    assert.equal(get(sources[2], 'capacity'), 2)
    assert.equal(get(sources[2], 'treeSize'), 'small')
    assert.equal(sources[3].type, 'bush')
    assert.equal(get(sources[3], 'capacity'), 2)
})

test('branch pass is deterministic, bounded, nonblocking and avoids complete props and passages', () => {
    const { ctx, props } = fixture()
    const first = createHarvestMetadata(ctx, 'test-location', props, [])
    assert.deepEqual(
        createHarvestMetadata(ctx, 'test-location', props, []),
        first
    )
    const branches = first
        .find((layer) => layer.name === 'Harvest sources')
        .objects.filter((source) => source.type === 'branches')
    assert.equal(branches.length, 12)
    const ids = branches.map(
        (source) =>
            source.properties.find((property) => property.name === 'sourceId')
                .value
    )
    assert.equal(new Set(ids).size, branches.length)
    for (const source of branches) {
        const cell = ctx.at(source.x / 16, source.y / 16)
        assert.equal(ctx.solid[cell], 0)
        assert.equal(ctx.roads[cell], 0)
        assert.equal(ctx.reserved[cell], 0)
        assert.equal(
            props.some(
                (prop) =>
                    source.x < prop.x + prop.width &&
                    source.x + 16 > prop.x &&
                    source.y < prop.y + prop.height &&
                    source.y + 16 > prop.y
            ),
            false
        )
    }
})
