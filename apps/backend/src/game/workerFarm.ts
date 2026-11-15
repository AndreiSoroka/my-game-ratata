import {
    FARM_PLOTS,
    type MarketItemId,
    type WorkerWorkTarget,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { countInventoryItem } from './inventory'
import type { GameRoom } from './room'
import { approach, sourceCost, stop } from './workerNavigation'
export class WorkerFarm {
    public remaining = 0
    public target: WorkerWorkTarget | undefined

    public reconcile(actor: GameCharacter, room: GameRoom): void {
        const supply = room.adventureForWorkers().farmSupply
        supply.reconcile(actor)
        this.remaining = supply.remaining(actor.id)
    }

    public update(actor: GameCharacter, room: GameRoom, now: number): void {
        const service = room.adventureForWorkers()
        if (!service.farmSupply.beginWork(actor, now)) {
            this.remaining = 0
            stop(actor)
            return
        }
        this.remaining = service.farmSupply.remaining(actor.id)
        const plot = this.selectPlot(actor, room, now)
        if (plot === undefined) {
            this.finish(actor, room)
            return
        }
        this.target = {
            kind: 'farm',
            sourceId: plot.id,
            locationId: plot.locationId,
            position: { ...plot.position },
        }
        if (
            plot.phase === 'bare' &&
            countInventoryItem(actor.inventory, 'wheat_seed') === 0
        ) {
            this.supply(actor, room, plot.id, now)
            return
        }
        if (!approach(actor, room, plot.locationId, plot.position)) {
            if (hasNoRoute(actor)) {
                this.finish(actor, room)
            }
            return
        }
        if (plot.phase === 'growing') {
            return
        }
        if (now < service.workAvailableAt(actor)) {
            return
        }
        const action = plot.phase === 'bare' ? 'sow' : 'harvest'
        const result = room.requestAdventure(
            actor,
            { type: 'farm_action', plotId: plot.id, action },
            now
        )
        room.publishEvents(result.events)
        this.remaining = service.farmSupply.remaining(actor.id)
        if (!result.accepted && action === 'harvest') {
            // Partial batches must still be deliverable if the backpack fills.
            this.finish(actor, room)
        }
    }

    private selectPlot(actor: GameCharacter, room: GameRoom, now: number) {
        const service = room.adventureForWorkers()
        const candidates = FARM_PLOTS.map((plot) =>
            service
                .farmSnapshot(plot.locationId, now)
                .find((candidate) => candidate.id === plot.id)
        )
            .filter((plot) => plot !== undefined)
            .sort((a, b) => sourceCost(actor, a) - sourceCost(actor, b))
        const canSow =
            countInventoryItem(actor.inventory, 'wheat_seed') > 0 ||
            service.farmSupply.canSupply(actor.id)
        return (
            candidates.find((plot) => plot.phase === 'ripe') ??
            candidates.find((plot) => plot.phase === 'bare' && canSow) ??
            candidates.find((plot) => plot.phase === 'growing')
        )
    }

    private supply(
        actor: GameCharacter,
        room: GameRoom,
        plotId: string,
        now: number
    ): void {
        const service = room.adventureForWorkers()
        const supplierId = service.farmSupply.supplierId(actor)
        const supplier =
            supplierId === undefined ? undefined : room.getCharacter(supplierId)
        if (supplier?.alive !== true) {
            this.finish(actor, room)
            return
        }
        if (!approach(actor, room, supplier.locationId, supplier.position)) {
            if (hasNoRoute(actor)) {
                this.finish(actor, room)
            }
            return
        }
        const result = room.requestAdventure(
            actor,
            {
                type: 'farm_supply',
                npcId: supplier.id,
                plotId,
                requestId: `farm-supply-${actor.id}-${String(now)}`,
            },
            now
        )
        room.publishEvents(result.events)
        if (!result.accepted) {
            this.finish(actor, room)
        }
    }

    private finish(actor: GameCharacter, room: GameRoom): void {
        room.adventureForWorkers().farmSupply.finishWork(actor.id)
        this.remaining = 0
    }
}

export function hasNoRoute(actor: GameCharacter): boolean {
    const input = actor.getMoveInput()
    return !actor.hasPath() && input.x === 0 && input.y === 0
}

export function workerDeliveryCount(
    actor: GameCharacter,
    itemId: MarketItemId,
    job: string
): number {
    const reserve =
        job === 'farmer' &&
        itemId === 'grain' &&
        countInventoryItem(actor.inventory, 'wheat_seed') === 0
            ? 1
            : 0
    return Math.max(0, countInventoryItem(actor.inventory, itemId) - reserve)
}

export function deliveryKinds(job: string): MarketItemId[] {
    if (job === 'lumberjack') {
        return ['wood', 'brushwood']
    }
    return job === 'miner' ? ['stone', 'scrap'] : ['grain']
}
