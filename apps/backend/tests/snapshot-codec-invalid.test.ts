import {
    applySnapshotPatch,
    freezeSnapshot,
    normalizeSnapshot,
    type SnapshotPatch,
    SnapshotPatchError,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

function initial(): WorldSnapshot {
    return freezeSnapshot(
        normalizeSnapshot({
            characters: [{ id: 'hero', position: { x: 20, y: 30 } }],
            chests: [],
            items: [
                { id: 'one', quantity: 1 },
                { id: 1, quantity: 2 },
            ],
            tick: 1,
            serverTime: 50,
            stepMs: 50,
        } as unknown as WorldSnapshot)
    )
}

const meta = { tick: 2, serverTime: 100, stepMs: 50 }

it.each([
    null,
    [],
    { unknown: true },
    { set: null },
    { set: [] },
    { unset: 'items' },
    { unset: [1] },
    { unset: ['items', 'items'] },
    { unset: ['not_present'] },
    { set: { items: [] }, unset: ['items'] },
    { set: { tick: 999 } },
    { unset: ['serverTime'] },
    { patch: { stepMs: {} } },
    { patch: { absent: {} } },
    { patch: { items: {} } },
    { set: { bad: undefined } },
    { set: { bad: Number.NaN } },
    { set: { bad: new Date(0) } },
    { collections: { absent: {} } },
    { collections: { tick: {} } },
    { collections: { items: { removed: ['absent'] } } },
    { collections: { items: { removed: ['one', 'one'] } } },
    { collections: { items: { added: [{ id: 'one' }] } } },
    { collections: { items: { added: [{ id: {} }] } } },
    { collections: { items: { added: [{ quantity: 9 }] } } },
    { collections: { items: { changed: [{ id: 'absent', patch: {} }] } } },
    { collections: { items: { changed: [{ id: 'one' }] } } },
    {
        collections: {
            items: {
                changed: [{ id: 'one', patch: { set: { id: 'two' } } }],
            },
        },
    },
    {
        collections: {
            items: { changed: [{ id: 'one', patch: { unset: ['id'] } }] },
        },
    },
    {
        collections: {
            items: { removed: ['one'], added: [{ id: 'one' }] },
        },
    },
    { collections: { items: { order: ['one'] } } },
    { collections: { items: { order: ['one', 'one'] } } },
    { collections: { items: { order: ['one', 'absent'] } } },
    { collections: { items: { order: ['one', null] } } },
    { collections: { items: { unknown: [] } } },
])('rejects malformed patch %# without modifying the baseline', (value) => {
    const before = initial()
    const serialized = JSON.stringify(before)
    expect(() =>
        applySnapshotPatch(before, value as SnapshotPatch, meta)
    ).toThrow(SnapshotPatchError)
    expect(JSON.stringify(before)).toBe(serialized)
    expect(Object.isFrozen(before.items[0])).toBe(true)
})

it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects unsafe operation key %s but permits the same string as an entity id',
    (key) => {
        const before = initial()
        const patch: unknown = JSON.parse(
            `{"set":{"${key}":{"polluted":true}}}`
        )
        expect(() =>
            applySnapshotPatch(before, patch as SnapshotPatch, meta)
        ).toThrow(SnapshotPatchError)
        const result = applySnapshotPatch(
            before,
            {
                collections: {
                    items: { added: [{ id: key, quantity: 3 }] },
                },
            },
            meta
        )
        expect(result.items.at(-1)?.id).toBe(key)
        expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
    }
)

it('does not publish earlier operations when a later nested operation fails', () => {
    const before = initial()
    const serialized = JSON.stringify(before)
    const patch: SnapshotPatch = {
        set: { chest: null },
        collections: {
            characters: {
                changed: [
                    {
                        id: 'hero',
                        patch: { patch: { absent: { set: { a: 1 } } } },
                    },
                ],
            },
        },
    }
    expect(() => applySnapshotPatch(before, patch, meta)).toThrow(
        SnapshotPatchError
    )
    expect(JSON.stringify(before)).toBe(serialized)
    expect(before).not.toHaveProperty('chest')
})

it('copies incoming literals before publishing them', () => {
    const before = initial()
    const literal = { position: { x: 1, y: 2 } }
    const patch: SnapshotPatch = { set: { custom: literal } }
    const result = applySnapshotPatch(before, patch, meta)
    literal.position.x = 999
    expect(result).toHaveProperty('custom.position.x', 1)
})

it('rejects cyclic non-JSON literals without traversing forever', () => {
    const cycle: Record<string, unknown> = {}
    cycle['cycle'] = cycle
    expect(() =>
        applySnapshotPatch(
            initial(),
            {
                set: { custom: cycle },
            } as SnapshotPatch,
            meta
        )
    ).toThrow(SnapshotPatchError)
})

it.each([
    { ...meta, tick: -1 },
    { ...meta, tick: 0.5 },
    { ...meta, serverTime: Number.POSITIVE_INFINITY },
    { ...meta, serverTime: -1 },
    { ...meta, stepMs: -1 },
    { ...meta, stepMs: 0.5 },
    { ...meta, stepMs: 251 },
    { ...meta, stepMs: Number.NaN },
])('rejects malformed metadata %#', (invalid) => {
    expect(() => applySnapshotPatch(initial(), undefined, invalid)).toThrow(
        SnapshotPatchError
    )
})

it.each([0, 1, 25, 50, 100, 250])(
    'preserves real resolved interval %i',
    (stepMs) => {
        expect(
            applySnapshotPatch(initial(), undefined, { ...meta, stepMs }).stepMs
        ).toBe(stepMs)
    }
)
