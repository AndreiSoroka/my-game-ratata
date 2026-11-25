import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { parseAgentDecision } from '../src/game/agentDecisionParsing'
import { parseClientMessage } from '../src/game/messages'
import { parseScenario } from '../src/game/scenarioCommands'

function definition(steps: unknown[]) {
    return {
        id: 'pinned',
        name: 'Pinned work',
        repeat: 1,
        sequences: [],
        reactions: [],
        main: steps,
    }
}
function steps(locationId: unknown, explicit = true) {
    return [
        {
            id: 'go',
            kind: 'go',
            destination: {
                kind: 'visible',
                target: 'chest',
                ...(explicit ? { targetId: 'shared-chest-id' } : {}),
                locationId,
            },
        },
        {
            id: 'deposit',
            kind: 'deposit',
            ...(explicit ? { chestId: 'shared-chest-id' } : {}),
            locationId,
            mode: 'acquired',
            itemIds: ['wood'],
        },
    ]
}

describe('location-qualified explicit scenario targets', () => {
    it('preserves an explicit target location through scenario, socket and agent validation', () => {
        const scenario = definition(steps(CENTER_LOCATION_ID))
        expect(parseScenario(scenario)).toEqual(scenario)
        const command = { type: 'scenario_save', scenario }
        expect(parseClientMessage(JSON.stringify(command)).message).toEqual(
            command
        )
        expect(parseAgentDecision(command)).toEqual(command)
    })

    it.each([null, '', 'map-99-99', ' map-2-2', 22, {}, 'elsewhere'])(
        'rejects unknown or malformed target locations: %j',
        (locationId) => {
            for (const step of steps(locationId)) {
                expect(parseScenario(definition([step]))).toBeUndefined()
            }
        }
    )

    it('forbids location pins on nearest-current-perception selectors without explicit IDs', () => {
        for (const step of steps(CENTER_LOCATION_ID, false)) {
            expect(parseScenario(definition([step]))).toBeUndefined()
        }
    })

    it('retains compatibility for explicit IDs that the server will bind on save and for unpinned nearest selectors', () => {
        const scenario = definition([
            {
                id: 'legacy-go',
                kind: 'go',
                destination: {
                    kind: 'visible',
                    target: 'chest',
                    targetId: 'shared-chest-id',
                },
            },
            {
                id: 'legacy-deposit',
                kind: 'deposit',
                chestId: 'shared-chest-id',
                mode: 'all',
                itemIds: [],
            },
            {
                id: 'nearest-go',
                kind: 'go',
                destination: { kind: 'visible', target: 'chest' },
            },
            {
                id: 'nearest-deposit',
                kind: 'deposit',
                mode: 'all',
                itemIds: [],
            },
        ])
        expect(parseScenario(scenario)).toEqual(scenario)
    })
})
