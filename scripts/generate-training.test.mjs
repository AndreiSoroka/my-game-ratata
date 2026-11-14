import assert from 'node:assert/strict'
import test from 'node:test'

import { addTrainingGround } from './generate-training.mjs'

function fixture() {
    const width = 96,
        height = 80,
        size = width * height
    const ctx = {
        width,
        height,
        at: (x, y) => y * width + x,
        random: () => {
            throw new Error('Authored pen must not consume RNG')
        },
        terrain: Array(size).fill(0),
        plants: Array(size).fill(17),
        structures: Array(size).fill(0),
        objects: Array(size).fill(0),
        solid: Array(size).fill(0),
        roads: Array(size).fill(false),
        reserved: Array(size).fill(false),
    }
    const ground = (x, y) => {
        ctx.terrain[ctx.at(x, y)] = 1024
        ctx.roads[ctx.at(x, y)] = true
    }
    return { ctx, ground }
}

test('training pen addition is deterministic and leaves unrelated cells unchanged', () => {
    const first = fixture(),
        second = fixture()
    const metadata = addTrainingGround(first.ctx, 'map-2-2', first.ground)
    assert.deepEqual(
        addTrainingGround(second.ctx, 'map-2-2', second.ground),
        metadata
    )
    for (const name of [
        'terrain',
        'plants',
        'structures',
        'objects',
        'solid',
        'roads',
        'reserved',
    ]) {
        assert.deepEqual(first.ctx[name], second.ctx[name])
        const untouched = fixture().ctx[name]
        for (let y = 0; y < 80; y++)
            for (let x = 0; x < 96; x++) {
                if (x >= 56 && x <= 71 && y >= 43 && y <= 56) continue
                assert.equal(
                    first.ctx[name][first.ctx.at(x, y)],
                    untouched[first.ctx.at(x, y)]
                )
            }
    }
    assert.deepEqual(
        metadata.map((object) => object.properties[0].value),
        ['map-2-2:training:yard-1', 'map-2-2:training:dummy-1']
    )
})

test('training pen rejects intersecting authored city props', () => {
    const { ctx, ground } = fixture()
    ctx.objects[ctx.at(65, 50)] = 619
    assert.throws(
        () => addTrainingGround(ctx, 'map-2-2', ground),
        /overlaps city prop/
    )
})
