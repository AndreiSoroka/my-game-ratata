import type { Vector2 } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import {
    clearMovementInputHistory,
    consumeMovementInputHistory,
} from '../src/game/movementInputHistory'

const right = { x: 1, y: 0 }
const left = { x: -1, y: 0 }
const up = { x: 0, y: -1 }
const stopped = { x: 0, y: 0 }

function actor(): GameCharacter {
    return new GameCharacter({
        id: 'timed-input',
        nickname: 'Timed input',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 100, y: 100 },
        spawnedAt: 1_000,
    })
}

function consume(character: GameCharacter, now = 50, deltaMs = 50) {
    const result = consumeMovementInputHistory(character, now, deltaMs)
    if (result === undefined) {
        throw new Error('Expected recorded movement input')
    }
    return result
}

function moving(result: ReturnType<typeof consume>) {
    return result.segments.filter(({ axis }) => axis.x !== 0 || axis.y !== 0)
}

function duration(result: ReturnType<typeof consume>): number {
    return moving(result).reduce(
        (total, segment) => total + segment.endsAt - segment.startedAt,
        0
    )
}

/** With no timed history the ordinary simulator uses the current input for its window. */
function effectiveSegments(
    character: GameCharacter,
    now: number,
    deltaMs: number
) {
    const result = consumeMovementInputHistory(character, now, deltaMs)
    if (result !== undefined) {
        return moving(result)
    }
    const axis = character.getMoveInput()
    return axis.x === 0 && axis.y === 0
        ? []
        : [{ axis, startedAt: now - deltaMs, endsAt: now }]
}

it('keeps ordinary untimed input on the existing simulation path', () => {
    const character = actor()
    expect(consumeMovementInputHistory(character, 50, 50)).toBeUndefined()
    character.setMoveInput(right)
    expect(consumeMovementInputHistory(character, 50, 50)).toBeUndefined()
    expect(character.getMoveInput()).toEqual(right)
})

it('credits only the 25 ms between a start and stop inside one server step', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    character.setMoveInput(stopped, 35)

    const result = consume(character)
    expect(moving(result)).toEqual([{ axis: right, startedAt: 10, endsAt: 35 }])
    expect(duration(result)).toBe(25)
    expect(result.finalAxis).toEqual(stopped)
    expect(result.stoppedAt).toBe(35)
    expect(character.getMoveInput()).toEqual(stopped)
})

it('retains 20 ms before a timed stop when the initial input was already held', () => {
    const character = actor()
    character.setMoveInput(right)
    character.setMoveInput(stopped, 20)

    const result = consume(character)
    expect(moving(result)).toEqual([{ axis: right, startedAt: 0, endsAt: 20 }])
    expect(duration(result)).toBe(20)
    expect(result.stoppedAt).toBe(20)
})

it('apportions reversals without extending or overlapping the step', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    character.setMoveInput(left, 20)
    character.setMoveInput(up, 35)
    const result = consume(character)

    expect(moving(result)).toEqual([
        { axis: right, startedAt: 10, endsAt: 20 },
        { axis: left, startedAt: 20, endsAt: 35 },
        { axis: up, startedAt: 35, endsAt: 50 },
    ])
    expect(duration(result)).toBe(40)
    expect(result.finalAxis).toEqual(up)
    expect(result.stoppedAt).toBeUndefined()
})

it('applies a start at the right boundary only to the next step', () => {
    const character = actor()
    character.setMoveInput(right, 50)
    const first = consume(character)
    expect(moving(first)).toEqual([])
    expect(first.finalAxis).toEqual(right)
    expect(effectiveSegments(character, 100, 50)).toEqual([
        { axis: right, startedAt: 50, endsAt: 100 },
    ])
})

it('credits a stop at the right boundary through that exact boundary', () => {
    const character = actor()
    character.setMoveInput(right, 0)
    character.setMoveInput(stopped, 50)
    const result = consume(character)
    expect(moving(result)).toEqual([{ axis: right, startedAt: 0, endsAt: 50 }])
    expect(duration(result)).toBe(50)
    expect(result.stoppedAt).toBe(50)
    expect(effectiveSegments(character, 100, 50)).toEqual([])
})

it('does not grant time before a start at the left boundary', () => {
    const character = actor()
    character.setMoveInput(right, 25)
    const result = consume(character, 50, 25)
    expect(moving(result)).toEqual([{ axis: right, startedAt: 25, endsAt: 50 }])
    expect(duration(result)).toBe(25)
})

it('clips old events to the current window and never replays prior time', () => {
    const character = actor()
    character.setMoveInput(right, 0)
    character.setMoveInput(left, 20)
    character.setMoveInput(stopped, 45)

    const result = consume(character, 50, 20)
    expect(moving(result)).toEqual([{ axis: left, startedAt: 30, endsAt: 45 }])
    expect(duration(result)).toBe(15)
    expect(result.stoppedAt).toBe(45)
    expect(effectiveSegments(character, 100, 50)).toEqual([])
})

it('carries held input across consumed windows without extra credit', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    expect(duration(consume(character))).toBe(40)
    expect(effectiveSegments(character, 100, 50)).toEqual([
        { axis: right, startedAt: 50, endsAt: 100 },
    ])

    character.setMoveInput(stopped, 110)
    const last = consume(character, 150, 50)
    expect(moving(last)).toEqual([{ axis: right, startedAt: 100, endsAt: 110 }])
    expect(duration(last)).toBe(10)
})

it('coalesces repeated identical input without overflowing the bounded journal', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    for (let index = 0; index < 300; index += 1) {
        character.setMoveInput(right, 10 + index / 20)
    }
    character.setMoveInput(stopped, 35)

    const result = consume(character)
    expect(moving(result)).toEqual([{ axis: right, startedAt: 10, endsAt: 35 }])
    expect(duration(result)).toBe(25)
})

it('coalesces changes at the same server time to the final axis', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    for (let index = 0; index < 300; index += 1) {
        character.setMoveInput(index % 2 === 0 ? stopped : left, 20)
    }
    character.setMoveInput(up, 20)

    const result = consume(character)
    expect(moving(result)).toEqual([
        { axis: right, startedAt: 10, endsAt: 20 },
        { axis: up, startedAt: 20, endsAt: 50 },
    ])
    expect(result.finalAxis).toEqual(up)
    expect(duration(result)).toBe(40)
})

it('drops all movement credit for an overflowed window and keeps the last axis for later', () => {
    const character = actor()
    for (let index = 0; index < 169; index += 1) {
        character.setMoveInput(index % 2 === 0 ? right : left, index / 8)
    }

    const result = consume(character)
    expect(moving(result)).toEqual([])
    expect(result.finalAxis).toEqual(right)
    expect(character.getMoveInput()).toEqual(right)
    expect(effectiveSegments(character, 100, 50)).toEqual([
        { axis: right, startedAt: 50, endsAt: 100 },
    ])
})

it('retains a final stop after overflow without replaying discarded events', () => {
    const character = actor()
    for (let index = 0; index < 169; index += 1) {
        character.setMoveInput(index % 2 === 0 ? right : left, index / 8)
    }
    character.setMoveInput(stopped, 40)
    const result = consume(character)
    expect(duration(result)).toBe(0)
    expect(result.finalAxis).toEqual(stopped)
    expect(effectiveSegments(character, 100, 50)).toEqual([])
})

it.each([250, 1_000])(
    'accounts only for the capped current window after a stalled %i ms step',
    (deltaMs) => {
        const character = actor()
        character.setMoveInput(right, 10)
        character.setMoveInput(stopped, 900)

        const result = consume(character, 1_000, deltaMs)
        expect(moving(result)).toEqual([
            { axis: right, startedAt: 750, endsAt: 900 },
        ])
        expect(duration(result)).toBe(150)
        expect(result.stoppedAt).toBe(900)
        expect(effectiveSegments(character, 1_250, 250)).toEqual([])
    }
)

it('never grants more than one capped step for input held across a stall', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    const result = consume(character, 1_000, 250)
    expect(moving(result)).toEqual([
        { axis: right, startedAt: 750, endsAt: 1_000 },
    ])
    expect(duration(result)).toBe(250)
    expect(effectiveSegments(character, 1_250, 250)).toEqual([
        { axis: right, startedAt: 1_000, endsAt: 1_250 },
    ])
})

it('clears timed history when an untimed controller replaces the input', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    character.setMoveInput(up)
    expect(consumeMovementInputHistory(character, 50, 50)).toBeUndefined()
    expect(character.getMoveInput()).toEqual(up)
})

it('clears timed history when a path takes control of movement', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    character.setPath([{ x: 120, y: 100 }])
    expect(consumeMovementInputHistory(character, 50, 50)).toBeUndefined()
    expect(character.getMoveInput()).toEqual(stopped)
    expect(character.nextPathPoint()).toEqual({ x: 120, y: 100 })
})

it('does not clear timed input when ordinary input clears the route', () => {
    const character = actor()
    character.setPath([{ x: 120, y: 100 }])
    character.setMoveInput(right, 10)
    character.clearPath()
    character.setMoveInput(stopped, 35)
    expect(character.hasPath()).toBe(false)
    expect(duration(consume(character))).toBe(25)
})

it('explicitly clears only the chosen actor journal', () => {
    const first = actor()
    const second = actor()
    first.setMoveInput(right, 10)
    second.setMoveInput(left, 20)
    clearMovementInputHistory(first)
    expect(consumeMovementInputHistory(first, 50, 50)).toBeUndefined()
    expect(moving(consume(second))).toEqual([
        { axis: left, startedAt: 20, endsAt: 50 },
    ])
    expect(first.getMoveInput()).toEqual(right)
})

it.each(['location', 'life-start', 'death-sequence'] as const)(
    'discards stale input credit after the actor changes %s',
    (scope) => {
        const character = actor()
        character.setMoveInput(right, 10)
        character.setMoveInput(stopped, 35)
        if (scope === 'location') {
            character.locationId = 'map-3-2'
        }
        if (scope === 'life-start') {
            character.lifeStartedAt += 1
        }
        if (scope === 'death-sequence') {
            character.deathSequence += 1
        }
        expect(consumeMovementInputHistory(character, 50, 50)).toBeUndefined()

        character.setMoveInput(left, 60)
        character.setMoveInput(stopped, 80)
        expect(moving(consume(character, 100, 50))).toEqual([
            { axis: left, startedAt: 60, endsAt: 80 },
        ])
    }
)

it('copies caller-owned and returned vectors instead of sharing mutable input', () => {
    const character = actor()
    const axis: Vector2 = { ...right }
    character.setMoveInput(axis, 10)
    axis.x = -1
    const result = consume(character)
    const first = moving(result)[0]
    if (first === undefined) {
        throw new Error('Expected moving interval')
    }
    expect(first.axis).toEqual(right)
    first.axis.x = -1
    result.finalAxis.x = -1

    expect(character.getMoveInput()).toEqual(right)
    expect(effectiveSegments(character, 100, 50)).toEqual([
        { axis: right, startedAt: 50, endsAt: 100 },
    ])
})

it('retains future receipts while advancing the consumed baseline independently', () => {
    const character = actor()
    character.setMoveInput(right, 10)
    character.setMoveInput(up, 75)

    const first = consume(character)
    expect(moving(first)).toEqual([{ axis: right, startedAt: 10, endsAt: 50 }])
    expect(first.finalAxis).toEqual(right)
    first.finalAxis.x = -1
    for (const segment of first.segments) {
        segment.axis.x = -1
    }

    const second = consume(character, 100, 50)
    expect(moving(second)).toEqual([
        { axis: right, startedAt: 50, endsAt: 75 },
        { axis: up, startedAt: 75, endsAt: 100 },
    ])
    expect(second.finalAxis).toEqual(up)
    expect(duration(second)).toBe(50)
    expect(consumeMovementInputHistory(character, 150, 50)).toBeUndefined()
})
