import type { WorldGraveSnapshot } from '@my-game-ratata/contracts'

export function graveFixture(overrides: Partial<WorldGraveSnapshot> = {}): WorldGraveSnapshot {
    return {
        id: 'grave:one',
        buriedName: 'Мирослав',
        locationId: 'map-2-2',
        position: { x: 0, y: 24 },
        phase: 'active',
        health: { kind: 'exact', current: 99.75, max: 100 },
        material: 'stone',
        ...overrides,
    }
}
