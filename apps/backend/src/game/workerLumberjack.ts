import {
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    type MarketRow,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { lumberjackStockTarget } from './cityEconomyStock'
import { countInventoryItem } from './inventory'
import type { GameRoom } from './room'
import { recordWorkerActivity, recordWorkerResult } from './workerActivityState'
import { gatherWorkerBrushwood, pickUpWorkerBrushwood } from './workerBrushwood'
import { WorkerLumberjackGrove } from './workerLumberjackGrove'
import { WorkerLumberjackRest } from './workerLumberjackRest'
import { approachCharacter, stop, WorkerFieldRoute } from './workerNavigation'
import { supplyMerchantId } from './workerSupplies'

const loadSize = 2

interface TimberDemand {
    cityId: string
    needed: number
    carried: number
    brushwood: MarketRow | undefined
}

export class WorkerLumberjack {
    private readonly grove = new WorkerLumberjackGrove()
    private readonly route = new WorkerFieldRoute()
    private readonly rest = new WorkerLumberjackRest()
    private returning = false
    private workingTrip = false
    private gatheredBrushwood = false

    public get selected(): AdventureResourceNode | undefined {
        return this.grove.selected
    }

    public clearWorksite(): void {
        this.grove.clearWorksite()
    }

    public update(
        actor: GameCharacter,
        room: GameRoom,
        now: number,
        repair: () => boolean
    ): void {
        const demand = timberDemand(actor, room, now)
        if (demand === undefined) {
            waitForSupply(
                actor,
                now,
                'unavailable',
                'Городской склад недоступен.'
            )
            return
        }
        if (
            now < room.adventureForWorkers().workAvailableAt(actor) ||
            actor.isActionLocked(now)
        ) {
            return
        }
        if (demand.needed > 0) {
            this.rest.resume()
        }
        if (
            this.grove.plant(actor, room, now) ||
            this.advanceDelivery(actor, room, now, demand) ||
            repair()
        ) {
            return
        }
        if (demand.needed === 0) {
            this.restInTown(actor, room, demand.cityId, now)
            return
        }
        this.work(actor, room, now, demand)
    }

    private work(
        actor: GameCharacter,
        room: GameRoom,
        now: number,
        demand: TimberDemand
    ): void {
        if (this.grove.gather(actor, room, now) === 'working') {
            this.workingTrip = true
        } else {
            this.returning =
                demand.carried > 0 ||
                (this.workingTrip && hasBrushwood(actor, demand.brushwood))
        }
    }

    private advanceDelivery(
        actor: GameCharacter,
        room: GameRoom,
        now: number,
        demand: TimberDemand
    ): boolean {
        if (
            this.returning ||
            (demand.needed > 0 && this.selected !== undefined)
        ) {
            pickUpWorkerBrushwood(actor, room, demand.brushwood, now)
        }
        const brushwood = hasBrushwood(actor, demand.brushwood)
        this.returning ||= this.shouldReturn(demand, brushwood)
        if (!this.returning) {
            return false
        }
        if (this.forageAtWorksite(actor, room, demand.brushwood, now)) {
            return true
        }
        this.clearWorksite()
        if (!brushwood && !(demand.needed > 0 && demand.carried > 0)) {
            this.finishTrip()
            return false
        }
        this.deliver(actor, room, demand.cityId, now)
        return true
    }

    private shouldReturn(demand: TimberDemand, brushwood: boolean): boolean {
        return demand.needed > 0
            ? demand.carried >= Math.min(loadSize, demand.needed)
            : this.workingTrip && brushwood
    }

    private forageAtWorksite(
        actor: GameCharacter,
        room: GameRoom,
        brushwood: MarketRow | undefined,
        now: number
    ): boolean {
        if (
            this.gatheredBrushwood ||
            this.selected?.locationId !== actor.locationId
        ) {
            return false
        }
        this.gatheredBrushwood = true
        return gatherWorkerBrushwood(actor, room, brushwood, now)
    }

    private deliver(
        actor: GameCharacter,
        room: GameRoom,
        cityId: string,
        now: number
    ): void {
        const merchant = room.getCharacter(supplyMerchantId)
        if (
            merchant?.alive !== true ||
            merchant.locationId !== cityId ||
            merchant.tags.has('state.retired')
        ) {
            waitForSupply(
                actor,
                now,
                'supplier',
                'Городской торговец сейчас недоступен.'
            )
            return
        }
        recordWorkerActivity(
            actor,
            {
                reason: 'working',
                text: `Доставляю древесину и хворост на склад через торговца ${merchant.nickname}.`,
                intent: 'deliver',
            },
            now
        )
        if (actor.locationId !== merchant.locationId) {
            this.route.advance(actor, room, merchant, 36, now)
            return
        }
        if (!approachCharacter(actor, room, merchant, true)) {
            return
        }
        const result = room
            .adventureForWorkers()
            .deliverWorkerSupplies(
                actor,
                merchant,
                room.navigationFor(actor),
                now
            )
        recordWorkerResult(actor, 'worker_delivery', result, now)
        if (result.accepted) {
            this.finishTrip()
        }
    }

    private restInTown(
        actor: GameCharacter,
        room: GameRoom,
        cityId: string,
        now: number
    ): void {
        this.clearWorksite()
        this.finishTrip()
        const place = this.rest.advance(actor, room, cityId, now)
        recordWorkerActivity(
            actor,
            {
                reason: 'stock_sufficient',
                text:
                    place === ''
                        ? 'Городской запас древесины пополнен.'
                        : `Запас древесины пополнен, отдыхаю ${place}.`,
                intent: 'wait',
            },
            now
        )
    }

    private finishTrip(): void {
        this.returning = false
        this.workingTrip = false
        this.gatheredBrushwood = false
    }
}

function timberDemand(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): TimberDemand | undefined {
    const cityId =
        WORLD_LOCATION_DEFINITIONS.find((location) =>
            actor.tags.has(`worker.city.${location.id}`)
        )?.id ?? CENTER_LOCATION_ID
    const rows = room.adventureForWorkers().economy.snapshot(cityId, now)?.rows
    const wood = rows?.find((row) => row.itemId === 'wood')
    return wood === undefined
        ? undefined
        : {
              cityId,
              needed: Math.max(
                  0,
                  lumberjackStockTarget(wood.capacity) - wood.stock
              ),
              carried: countInventoryItem(actor.inventory, 'wood'),
              brushwood: rows?.find((row) => row.itemId === 'brushwood'),
          }
}

function hasBrushwood(
    actor: GameCharacter,
    row: MarketRow | undefined
): boolean {
    return (
        row !== undefined &&
        row.stock < row.capacity &&
        countInventoryItem(actor.inventory, 'brushwood') > 0
    )
}

function waitForSupply(
    actor: GameCharacter,
    now: number,
    reason: 'supplier' | 'unavailable',
    text: string
): void {
    stop(actor)
    recordWorkerActivity(actor, { reason, text, intent: 'wait' }, now)
}
