import type {
    AutomationSnapshot,
    CharacterRouteSnapshot,
    ScenarioRunSnapshot,
} from '@my-game-ratata/contracts'

export function routeFixture(
    overrides: Partial<CharacterRouteSnapshot> = {}
): CharacterRouteSnapshot {
    return {
        locationId: 'map-2-2',
        points: [
            { number: 4, position: { x: 420, y: 620 } },
            { number: 5, position: { x: 480, y: 620 } },
        ],
        waiting: 'blocked',
        remainingFailureMs: 8000,
        ...overrides,
    }
}

export function automationFixture(): AutomationSnapshot {
    return {
        markers: [
            {
                id: 'marker-1',
                number: 1,
                name: 'Опушка',
                locationId: 'map-2-2',
                position: { x: 420, y: 620 },
            },
            {
                id: 'marker-2',
                number: 2,
                name: 'Сундук у дома',
                locationId: 'map-2-2',
                position: { x: 720, y: 580 },
            },
        ],
        scenarios: [
            {
                id: 'lumber',
                name: 'Древесина в сундук',
                repeat: null,
                threat: 'flee',
                steps: [
                    {
                        id: 'go-tree',
                        kind: 'go',
                        destination: { kind: 'marker', markerId: 'marker-1' },
                    },
                    { id: 'wood', kind: 'gather', resource: 'wood', amount: 3 },
                    {
                        id: 'go-chest',
                        kind: 'go',
                        destination: { kind: 'marker', markerId: 'marker-2' },
                    },
                    { id: 'stash', kind: 'deposit', mode: 'acquired', itemIds: ['wood'] },
                ],
            },
        ],
        run: null,
        helpers: [
            {
                actorId: 'wanderer',
                name: 'Путница Тася',
                eligible: true,
                reason: null,
                canFollow: true,
                run: null,
            },
            {
                actorId: 'quest-helper',
                name: 'Путник Фома',
                eligible: false,
                reason: 'Сначала выполните задание Миры.',
                canFollow: true,
                run: null,
            },
        ],
    }
}
export function scenarioRunFixture(
    overrides: Partial<ScenarioRunSnapshot> = {}
): ScenarioRunSnapshot {
    return {
        scenarioId: 'lumber',
        name: 'Древесина в сундук',
        actorId: 'self',
        ownerId: 'self',
        status: 'running',
        stepIndex: 1,
        iteration: 1,
        remainingFailureMs: 0,
        reason: null,
        interruption: null,
        results: [
            { stepId: 'go-tree', status: 'succeeded', reason: null, failures: 0 },
            { stepId: 'wood', status: 'running', reason: null, failures: 0 },
            { stepId: 'go-chest', status: 'pending', reason: null, failures: 0 },
            { stepId: 'stash', status: 'pending', reason: null, failures: 0 },
        ],
        ...overrides,
    }
}
