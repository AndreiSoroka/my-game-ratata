import {
    applySnapshotPatch,
    diffSnapshots,
    freezeSnapshot,
    normalizeSnapshot,
    type SnapshotJson,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

function random(seed: number) {
    let state = seed
    return (max: number) => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
        return state % max
    }
}

function randomJson(next: (max: number) => number, depth = 3): SnapshotJson {
    const kind = next(depth > 0 ? 6 : 4)
    switch (kind) {
        case 0:
            return null
        case 1:
            return next(1000)
        case 2:
            return `text-${String(next(5))}`
        case 3:
            return next(2) === 1
        case 4:
            return Array.from({ length: next(5) }, () =>
                randomJson(next, depth - 1)
            )
        default:
            return Object.fromEntries(
                Array.from({ length: next(5) }, (_, index) => [
                    `key-${String(index)}`,
                    randomJson(next, depth - 1),
                ])
            )
    }
}

function frame(custom: SnapshotJson, tick: number): WorldSnapshot {
    return normalizeSnapshot({
        characters: [],
        chests: [],
        items: [],
        custom,
        tick,
        serverTime: tick * 50,
        stepMs: 50,
    } as unknown as WorldSnapshot)
}

it('round-trips a deterministic corpus of arbitrary nested JSON through immutable patches', () => {
    const next = random(47)
    for (let index = 0; index < 350; index++) {
        const previous = freezeSnapshot(frame(randomJson(next), index))
        const current = frame(randomJson(next), index + 1)
        const oldJson = JSON.stringify(previous)
        const result = applySnapshotPatch(
            previous,
            diffSnapshots(previous, current),
            {
                tick: current.tick,
                serverTime: current.serverTime,
                stepMs: current.stepMs ?? 0,
            }
        )
        expect(result).toEqual(current)
        expect(JSON.stringify(previous)).toBe(oldJson)
    }
})

it('reconstructs consecutive mixed-id collection changes, additions, removals and order changes', () => {
    const next = random(93)
    let previous = freezeSnapshot(frame([], 0))
    for (let tick = 1; tick <= 180; tick++) {
        const ids = [1, '1', 'hero', 'npc', 'other']
            .filter(() => next(3) !== 0)
            .map((id) => ({ id, rank: next(100) }))
            .sort((first, second) => first.rank - second.rank)
            .map(({ id }) => ({
                id,
                position: { x: next(100), y: next(100) },
                parameters: { cooldown: next(100), known: next(2) === 1 },
                values: Array.from({ length: next(4) }, () => next(10)),
            }))
        const current = frame(ids, tick)
        const serialized = JSON.stringify(previous)
        const result = applySnapshotPatch(
            previous,
            diffSnapshots(previous, current),
            {
                tick,
                serverTime: current.serverTime,
                stepMs: 50,
            }
        )
        expect(result).toEqual(current)
        expect(JSON.stringify(previous)).toBe(serialized)
        previous = freezeSnapshot(result)
    }
})
