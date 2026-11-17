import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'
import { expect } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { WorkerSimulation } from './workerRequestFixture'

export function bareFarmerWorld() {
    const f = new WorkerSimulation('farmer')
    f.enemy.alive = false
    for (const location of WORLD_LOCATION_DEFINITIONS) {
        for (const plot of f.adventure.farmSnapshot(location.id, f.now)) {
            if (plot.phase !== 'ripe') {
                continue
            }
            const actor = new GameCharacter({
                id: `prepare:${plot.id}`,
                nickname: 'fixture',
                archetype: 'human',
                controllerKind: 'scripted',
                locationId: plot.locationId,
                spawnPosition: plot.position,
            })
            expect(
                f.adventure.handleResult(
                    actor,
                    { type: 'farm_action', plotId: plot.id, action: 'harvest' },
                    [actor],
                    f.room.navigationFor(actor),
                    f.now
                ).accepted
            ).toBe(true)
        }
    }
    return f
}
