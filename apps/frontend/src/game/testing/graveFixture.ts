import type { WorldGraveSnapshot } from '@my-game-ratata/contracts'

export function graveFixture(overrides: Partial<WorldGraveSnapshot> = {}): WorldGraveSnapshot {
    return {
        id: 'grave:one',
        locationId: 'map-2-2',
        position: { x: 0, y: 24 },
        phase: 'active',
        hp: 99.75,
        maxHp: 100,
        material: 'stone',
        ...overrides,
    }
}
