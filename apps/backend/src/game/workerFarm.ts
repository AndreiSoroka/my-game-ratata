import { CENTER_LOCATION_ID, FARM_PLOTS } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { approach, sourceCost, stop } from './workerNavigation'
export class WorkerFarm {
    public remaining = 0
    private nextAt = 0
    public update(actor: GameCharacter, room: GameRoom, now: number): void {
        const service = room.adventureForWorkers()
        if (!this.begin(room, now)) {
            stop(actor)
            return
        }
        const candidates = FARM_PLOTS.map((plot) =>
            service
                .farmSnapshot(plot.locationId, now)
                .find((candidate) => candidate.id === plot.id)
        )
            .filter((plot) => plot !== undefined)
            .sort((a, b) => sourceCost(actor, a) - sourceCost(actor, b))
        const plot =
            candidates.find((candidate) => candidate.phase === 'ripe') ??
            candidates.find((candidate) => candidate.phase === 'bare') ??
            candidates[0]
        if (plot === undefined) {
            this.remaining = 0
            return
        }
        if (!approach(actor, room, plot.locationId, plot.position)) {
            return
        }
        if (plot.phase === 'growing') {
            return
        }
        const action = plot.phase === 'bare' ? 'sow' : 'harvest'
        const result = room.requestAdventure(
            actor,
            { type: 'farm_action', plotId: plot.id, action },
            now
        )
        room.publishEvents(result.events)
        if (result.accepted && action === 'harvest') {
            this.remaining = Math.max(0, this.remaining - 3)
        }
    }
    private begin(room: GameRoom, now: number): boolean {
        const service = room.adventureForWorkers()
        if (this.remaining === 0) {
            if (now < this.nextAt) {
                return false
            }
            const row = service.economy
                .snapshot(CENTER_LOCATION_ID, now)
                ?.rows.find((candidate) => candidate.itemId === 'grain')
            if (row === undefined || row.stock >= row.target) {
                return false
            }
            this.remaining = 6
            this.nextAt = now + 600_000
        }
        return true
    }
}
