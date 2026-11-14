import { describe, expect, it } from 'vitest'

import { parseAgentDecision } from '../src/game/agentDecisionParsing'
import { parseClientMessage } from '../src/game/messages'
import {
    parseAutomationCommand,
    parseScenario,
} from '../src/game/scenarioCommands'

function scenario(
    steps: unknown[] = [{ id: 'wait-1', kind: 'wait', durationMs: 500 }]
): Record<string, unknown> {
    return {
        id: 'work',
        name: ' Forest work ',
        steps,
        repeat: null,
        threat: 'flee',
    }
}

describe('automation command boundary', () => {
    it.each([
        { type: 'marker_create' },
        { type: 'marker_create', name: 'Camp' },
        { type: 'marker_rename', markerId: 'camp', name: 'Home' },
        { type: 'marker_delete', markerId: 'camp' },
        { type: 'scenario_save', scenario: scenario() },
        { type: 'scenario_delete', scenarioId: 'work' },
        { type: 'scenario_start', scenarioId: 'work', targetId: 'npc-1' },
        { type: 'scenario_pause', targetId: 'npc-1' },
        { type: 'scenario_resume' },
        { type: 'scenario_stop' },
        { type: 'release_input' },
    ])(
        'accepts and shares validated $type with sockets and NPC agents',
        (command) => {
            const parsed = parseAutomationCommand(command)
            expect(parsed).toBeDefined()
            expect(parseClientMessage(JSON.stringify(command)).message).toEqual(
                parsed
            )
            expect(parseAgentDecision(command)).toEqual(parsed)
        }
    )

    it.each(['actorId', 'ownerId', 'position', 'locationId', 'unexpected'])(
        'rejects injected %s instead of silently stripping it',
        (field) => {
            const command = {
                type: 'marker_create',
                [field]: 'another-identity',
            }
            expect(parseAutomationCommand(command)).toBeUndefined()
            expect(parseClientMessage(JSON.stringify(command)).error).toBe(
                'Invalid automation command'
            )
            expect(parseAgentDecision(command)).toBeUndefined()
        }
    )

    it.each([
        { type: 'unknown' },
        { type: 'scenario_start', scenarioId: '' },
        { type: 'scenario_start', scenarioId: 'work', targetId: null },
        { type: 'scenario_pause', targetId: ' leading-space' },
        { type: 'marker_delete', markerId: 'x'.repeat(101) },
        { type: 'marker_delete', markerId: 'line\nbreak' },
        { type: 'marker_rename', markerId: 'camp', name: ' ' },
        { type: 'marker_create', name: 'x'.repeat(81) },
        { type: 'release_input', targetId: 'other' },
    ])('rejects malformed command %#', (command) => {
        expect(parseAutomationCommand(command)).toBeUndefined()
    })
})

describe('scenario data validation', () => {
    it('validates all ordinary step kinds and returns independent plain data', () => {
        const definition = scenario([
            {
                id: 'point',
                kind: 'go',
                destination: {
                    kind: 'point',
                    locationId: 'map-2-2',
                    position: { x: 100.5, y: 200 },
                },
            },
            {
                id: 'marker',
                kind: 'go',
                destination: { kind: 'marker', markerId: 'camp' },
            },
            {
                id: 'visible',
                kind: 'go',
                destination: {
                    kind: 'visible',
                    target: 'tree',
                    targetId: 'tree-1',
                },
            },
            { id: 'search', kind: 'search', target: 'stone' },
            {
                id: 'wood',
                kind: 'gather',
                resource: 'wood',
                amount: 'depleted',
            },
            { id: 'rock', kind: 'gather', resource: 'stone', amount: 2 },
            { id: 'attack', kind: 'attack' },
            { id: 'pickup', kind: 'pickup', itemId: 'wood' },
            {
                id: 'deposit',
                kind: 'deposit',
                mode: 'acquired',
                itemIds: ['wood', 'wood', 'stone'],
                chestId: 'chest-1',
            },
            { id: 'wait', kind: 'wait', durationMs: 0 },
            { id: 'recover', kind: 'recover', resource: 'energy', atLeast: 20 },
        ])
        const parsed = parseScenario(definition)
        expect(parsed?.name).toBe('Forest work')
        expect(parsed?.steps).toHaveLength(11)
        expect(parsed?.steps[8]).toMatchObject({ itemIds: ['wood', 'stone'] })
        expect(parsed?.steps).not.toBe(definition['steps'])
    })

    it.each([
        { repeat: 0 },
        { repeat: 1.5 },
        { repeat: 10_001 },
        { threat: 'teleport' },
        { ownerId: 'other' },
        { steps: [] },
        { steps: null },
        {
            steps: [
                { id: 'same', kind: 'attack' },
                { id: 'same', kind: 'attack' },
            ],
        },
        {
            steps: Array.from({ length: 65 }, (_, index) => ({
                id: `step-${String(index)}`,
                kind: 'attack',
            })),
        },
    ])('rejects invalid definition %#', (overrides) => {
        expect(parseScenario({ ...scenario(), ...overrides })).toBeUndefined()
    })
})

describe('scenario step parameters', () => {
    it.each([
        { kind: 'unknown' },
        { kind: 'attack', ownerId: 'other' },
        { kind: 'gather', resource: 'wood', amount: 0 },
        { kind: 'gather', resource: 'wood', amount: 0.5 },
        { kind: 'gather', resource: 'wood', amount: Infinity },
        { kind: 'gather', resource: 'gold', amount: 1 },
        { kind: 'wait', durationMs: -1 },
        { kind: 'wait', durationMs: NaN },
        { kind: 'wait', durationMs: 3_600_001 },
        { kind: 'recover', resource: 'energy', atLeast: 0 },
        { kind: 'search', target: 'gold' },
        { kind: 'pickup', itemId: '__proto__' },
        { kind: 'deposit', mode: 'all', itemIds: ['unknown'] },
        { kind: 'deposit', mode: 'all', itemIds: null },
        {
            kind: 'go',
            destination: {
                kind: 'point',
                locationId: 'map-99-99',
                position: { x: 1, y: 2 },
            },
        },
        {
            kind: 'go',
            destination: {
                kind: 'point',
                locationId: 'map-2-2',
                position: { x: -1, y: 2 },
            },
        },
        {
            kind: 'go',
            destination: {
                kind: 'point',
                locationId: 'map-2-2',
                position: { x: 1, y: 2, ownerId: 'other' },
            },
        },
        {
            kind: 'go',
            destination: { kind: 'visible', target: 'tree', actorId: 'other' },
        },
    ])('rejects invalid or injected step %#', (step) => {
        expect(
            parseScenario(scenario([{ id: 'step-1', ...step }]))
        ).toBeUndefined()
    })
})
