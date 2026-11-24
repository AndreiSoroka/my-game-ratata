import {
    applySnapshotPatch,
    diffSnapshots,
    freezeSnapshot,
    normalizeSnapshot,
    SnapshotPatchError,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

function frame(extra: Record<string, unknown> = {}, tick = 1): WorldSnapshot {
    return normalizeSnapshot({
        characters: [
            {
                id: 'hero',
                position: { x: 20, y: 30 },
                cooldowns: { attackMsLeft: 100 },
                progression: {
                    constellations: { nodes: [{ id: 'root', x: 1, y: 2 }] },
                },
            },
        ],
        items: [],
        chests: [],
        ...extra,
        tick,
        serverTime: tick * 50,
        stepMs: 50,
    } as unknown as WorldSnapshot)
}

function hero(snapshot: WorldSnapshot) {
    const value = snapshot.characters[0]
    if (value === undefined) {
        throw new Error('Missing fixture hero')
    }
    return value
}

function roundTrip(
    previous: WorldSnapshot,
    next: WorldSnapshot
): WorldSnapshot {
    const result = applySnapshotPatch(previous, diffSnapshots(previous, next), {
        tick: next.tick,
        serverTime: next.serverTime,
        stepMs: next.stepMs ?? 0,
    })
    expect(result).toEqual(next)
    return result
}

it('sends only changing cooldown leaves and structurally shares stationary data', () => {
    const before = freezeSnapshot(frame())
    const next = frame({}, 2)
    hero(next).cooldowns.attackMsLeft = 50
    const patch = diffSnapshots(before, next)
    expect(patch).toEqual({
        collections: {
            characters: {
                changed: [
                    {
                        id: 'hero',
                        patch: {
                            patch: {
                                cooldowns: { set: { attackMsLeft: 50 } },
                            },
                        },
                    },
                ],
            },
        },
    })
    const encoded = JSON.stringify(patch)
    expect(encoded).not.toContain('position')
    expect(encoded).not.toContain('progression')
    expect(encoded).not.toContain('serverTime')
    const result = roundTrip(before, next)
    expect(hero(result).position).toBe(hero(before).position)
    expect(hero(result).progression).toBe(hero(before).progression)
    expect(result.characters[0]).not.toBe(before.characters[0])
    expect(hero(before).cooldowns.attackMsLeft).toBe(100)
})

it('keeps time-only frames small while publishing a fresh root', () => {
    const before = freezeSnapshot(frame())
    const next = frame({}, 2)
    expect(diffSnapshots(before, next)).toBeUndefined()
    const result = roundTrip(before, next)
    expect(result).not.toBe(before)
    expect(result.characters).toBe(before.characters)
    expect(result.characters[0]).toBe(before.characters[0])
})

it('adds, removes and reorders keyed collections while retaining typed ids', () => {
    const before = frame({
        items: [
            { id: 1, quantity: 1 },
            { id: '1', quantity: 2 },
            { id: 'removed', quantity: 9 },
        ],
    })
    const next = frame(
        {
            items: [
                { id: 'new', quantity: 3 },
                { id: '1', quantity: 4 },
                { id: 1, quantity: 1 },
            ],
        },
        2
    )
    const patch = diffSnapshots(before, next)
    expect(patch?.collections?.['items']).toEqual({
        removed: ['removed'],
        added: [{ id: 'new', quantity: 3 }],
        changed: [{ id: '1', patch: { set: { quantity: 4 } } }],
        order: ['new', '1', 1],
    })
    const result = roundTrip(freezeSnapshot(before), next)
    expect(result.items[2]).toBe(before.items[0])
})

it('omits order when removals and appends already produce the requested order', () => {
    const before = frame({ items: [{ id: 'a' }, { id: 'b' }] })
    const next = frame({ items: [{ id: 'b' }, { id: 'c' }] }, 2)
    expect(diffSnapshots(before, next)?.collections?.['items']).toEqual({
        removed: ['a'],
        added: [{ id: 'c' }],
    })
    roundTrip(before, next)
    roundTrip(next, frame({ items: [] }, 3))
    roundTrip(frame({ items: [] }), next)
})

it('keeps meaningful null, property deletion, empty arrays and collection absence distinct', () => {
    const before = frame({
        chest: { id: 'one' },
        optional: 1,
        portals: [{ id: 'portal' }],
    })
    const next = frame(
        { chest: null, optional: undefined, tags: [], portals: undefined },
        2
    )
    const patch = diffSnapshots(before, next)
    expect(patch?.unset).toEqual(['optional', 'portals'])
    expect(patch?.set?.['chest']).toBeNull()
    roundTrip(before, next)
    roundTrip(next, frame({ chest: null, portals: [], tags: [] }, 3))
})

it('replaces ordinary or duplicate-id arrays without changing their ordering', () => {
    for (const values of [
        [2, 1, 3],
        [
            { id: 'same', n: 1 },
            { id: 'same', n: 2 },
        ],
        [
            { instanceId: 'one', n: 1 },
            { instanceId: 'two', n: 2 },
        ],
    ]) {
        const before = frame({ custom: values })
        const next = frame({ custom: [...values].reverse() }, 2)
        expect(diffSnapshots(before, next)?.set?.['custom']).toEqual(
            next['custom' as keyof WorldSnapshot]
        )
        roundTrip(before, next)
    }
})

it('normalizes live references and precisely matches existing JSON semantics', () => {
    const position = { x: -0, y: Number.NaN }
    const source = {
        ...frame(),
        custom: {
            position,
            removed: undefined,
            missing: [undefined, Number.POSITIVE_INFINITY, -0],
        },
    }
    const normalized = normalizeSnapshot(source)
    position.x = 99
    position.y = 40
    expect(normalized).toEqual(
        JSON.parse(
            JSON.stringify({
                ...source,
                custom: {
                    position: { x: 0, y: null },
                    missing: [null, null, 0],
                },
            })
        )
    )
    expect(JSON.stringify(normalized)).toContain('"position":{"x":0,"y":null}')
})

it('uses safe opaque replacements for data keys that cannot be patch operations', () => {
    const data = (value: number): unknown =>
        JSON.parse(
            `{"__proto__":{"polluted":${String(value)}},"constructor":"data"}`
        )
    const before = frame({ custom: data(1) })
    const next = frame({ custom: data(2) }, 2)
    expect(diffSnapshots(before, next)?.set).toHaveProperty('custom')
    const result = roundTrip(freezeSnapshot(before), next)
    const custom = (result as unknown as { custom: object }).custom
    expect(Object.getPrototypeOf(custom)).toBe(Object.prototype)
    expect(Object.hasOwn(custom, '__proto__')).toBe(true)
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
    const entries = (value: number) =>
        frame({ items: [{ id: 'a', ...(data(value) as object) }] }, value)
    expect(diffSnapshots(entries(1), entries(2))?.set).toHaveProperty('items')
    roundTrip(entries(1), entries(2))
})

it('signals full-frame fallback for unsafe root keys and freezes only published branches', () => {
    const before = frame()
    const next = normalizeSnapshot(
        JSON.parse(
            JSON.stringify(before).replace('{', '{"__proto__":{"data":true},')
        ) as WorldSnapshot
    )
    expect(() => diffSnapshots(before, next)).toThrow(SnapshotPatchError)
    expect(freezeSnapshot(before)).toBe(before)
    expect(Object.isFrozen(before)).toBe(true)
    expect(Object.isFrozen(hero(before).position)).toBe(true)
    expect(freezeSnapshot(before)).toBe(before)
})
