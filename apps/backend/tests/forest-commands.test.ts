import { expect, it } from 'vitest'

import {
    parseAutoAction,
    parseControlCommand,
} from '../src/game/controlCommands'
import { parseClientMessage } from '../src/game/messages'

it('parses synchronous and automatic gathering with the same operations and backwards-compatible default', () => {
    for (const operation of [
        undefined,
        'harvest',
        'clear_stump',
        'cut_sapling',
    ]) {
        const fields = {
            nodeId: 'tree',
            ...(operation === undefined ? {} : { operation }),
        }
        expect(
            parseClientMessage(JSON.stringify({ type: 'gather', ...fields }))
                .message
        ).toEqual({ type: 'gather', ...fields })
        const action = { kind: 'gather', ...fields }
        expect(parseControlCommand({ type: 'auto_action', action })).toEqual({
            type: 'auto_action',
            action,
        })
    }
})

it('rejects invalid forest operations and target identities at the untrusted boundary', () => {
    for (const operation of [null, 1, true, {}, [], '', 'cut_tree', 'wood']) {
        expect(
            parseClientMessage(
                JSON.stringify({ type: 'gather', nodeId: 'tree', operation })
            ).error
        ).toBeDefined()
        expect(
            parseAutoAction({ kind: 'gather', nodeId: 'tree', operation })
        ).toBeUndefined()
    }
    for (const nodeId of [undefined, null, true, 0, '', ' ', 'x'.repeat(101)]) {
        expect(
            parseClientMessage(JSON.stringify({ type: 'gather', nodeId })).error
        ).toBeDefined()
        expect(parseAutoAction({ kind: 'gather', nodeId })).toBeUndefined()
    }
})

it('accepts finite planting positions and rejects malformed or nonfinite coordinates', () => {
    const position = { x: 128.5, y: 456 }
    expect(parseAutoAction({ kind: 'plant_tree', position })).toEqual({
        kind: 'plant_tree',
        position,
    })
    expect(
        parseClientMessage(JSON.stringify({ type: 'plant_tree', position }))
            .message
    ).toEqual({ type: 'plant_tree', position })
    expect(
        parseClientMessage(
            JSON.stringify({
                type: 'plant_tree_preview',
                requestId: 'site-1',
                position,
            })
        ).message
    ).toEqual({ type: 'plant_tree_preview', requestId: 'site-1', position })
    for (const invalid of [
        undefined,
        null,
        true,
        10,
        '128,456',
        [],
        {},
        { x: 128 },
        { x: '128', y: 456 },
        { x: NaN, y: 0 },
        { x: 0, y: Infinity },
    ]) {
        expect(
            parseAutoAction({ kind: 'plant_tree', position: invalid })
        ).toBeUndefined()
        expect(
            parseClientMessage(
                JSON.stringify({ type: 'plant_tree', position: invalid })
            ).error
        ).toBeDefined()
        expect(
            parseClientMessage(
                JSON.stringify({
                    type: 'plant_tree_preview',
                    requestId: 'site-1',
                    position: invalid,
                })
            ).error
        ).toBeDefined()
    }
    for (const requestId of [undefined, null, 1, '', ' ', 'x'.repeat(101)]) {
        expect(
            parseClientMessage(
                JSON.stringify({
                    type: 'plant_tree_preview',
                    requestId,
                    position,
                })
            ).error
        ).toBeDefined()
    }
})
