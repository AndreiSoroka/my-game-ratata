import {
    CENTER_LOCATION_ID,
    type MarketItemId,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'
import { recordWorkerActivity } from './workerActivityState'
import { executeWorkerAdventure } from './workerCommands'
import { deliveryKinds, workerDeliveryCount, WorkerFarm } from './workerFarm'
import { WorkerGather } from './workerGather'
import { WorkerLumberjack } from './workerLumberjack'
import { approachCharacter, fleeWorker } from './workerNavigation'
import { repairWorker } from './workerRepair'
import { resourceWorkTarget } from './workerRequestData'
import type { WorkerJob } from './workerSpawns'
/** The controller chooses work; every harvest, sale, repair and planting uses ordinary commands. */
export class EconomyWorkerController implements CharacterController {
    private nextDecisionAt = 0
    private nextIncidentAt = 0
    private initialized = false
    private readonly farming = new WorkerFarm()
    private requestIndex = 0
    private readonly lumberjack = new WorkerLumberjack()
    private readonly gathering = new WorkerGather()

    public constructor(private readonly job: WorkerJob) {}

    public update(actor: GameCharacter, room: GameRoom, now: number): void {
        const service = room.adventureForWorkers()
        if (!this.initialized) {
            service.grantGoldOnce(actor.id, 20, `worker-start-${actor.id}`)
            this.initialized = true
        }
        if (now < this.nextDecisionAt) {
            return
        }
        this.nextDecisionAt = now + 500
        if (this.interrupted(actor, room, now)) {
            return
        }
        if (this.job === 'lumberjack') {
            this.lumberjack.update(actor, room, now, () =>
                this.repair(actor, room, now)
            )
            return
        }
        if (this.deliver(actor, room, now)) {
            return
        }
        if (this.repair(actor, room, now)) {
            return
        }
        if (this.job === 'farmer') {
            this.farming.update(actor, room, now)
        } else {
            this.gathering.update(actor, room, now)
        }
    }

    private deliver(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): boolean {
        const kinds = deliveryKinds(this.job)
        const merchant = room.getCharacter('npc_merchant_1')
        const market = room
            .adventureForWorkers()
            .economy.snapshot(merchant?.locationId ?? CENTER_LOCATION_ID, now)
        const deliveryCount = (itemId: MarketItemId) =>
            workerDeliveryCount(actor, itemId, this.job)
        const row = kinds
            .map((id) => market?.rows.find((row) => row.itemId === id))
            .find(
                (candidate) =>
                    candidate !== undefined &&
                    deliveryCount(candidate.itemId) > 0 &&
                    candidate.stock < candidate.capacity
            )
        if (row === undefined || this.waitForBatch(actor, room)) {
            return false
        }
        if (merchant?.alive !== true) {
            recordWorkerActivity(
                actor,
                {
                    reason: 'supplier',
                    text: 'Не могу сдать продукцию: городской торговец сейчас недоступен.',
                    intent: 'deliver',
                },
                now
            )
            return true
        }
        recordWorkerActivity(
            actor,
            {
                reason: 'working',
                text: `Доставляю настоящую продукцию торговцу ${merchant.nickname}.`,
                intent: 'deliver',
            },
            now
        )
        if (!approachCharacter(actor, room, merchant)) {
            return true
        }
        const itemId = row.itemId
        const quantity = Math.min(
            deliveryCount(itemId),
            row.capacity - row.stock
        )
        const total = quoteMarketTrade(row, 'sell', quantity)
        if (total === null) {
            this.nextDecisionAt = now + 5000
            return true
        }
        executeWorkerAdventure(
            actor,
            room,
            {
                type: 'market_trade',
                npcId: merchant.id,
                side: 'sell',
                itemId,
                quantity,
                expectedTotal: total,
                requestId: this.requestId(actor),
            },
            now
        )
        return true
    }

    private waitForBatch(actor: GameCharacter, room: GameRoom): boolean {
        return (
            this.job === 'farmer' &&
            this.farming.remaining > 0 &&
            room.adventureForWorkers().farmSupply.workSchedule(actor.id)
                .stop === undefined
        )
    }

    private repair(actor: GameCharacter, room: GameRoom, now: number): boolean {
        const delay = repairWorker(actor, room, now, () =>
            this.requestId(actor)
        )
        if (delay === undefined) {
            return false
        }
        this.nextDecisionAt = now + delay
        return true
    }

    private requestId(actor: GameCharacter): string {
        return `work-${actor.id}-${String(this.requestIndex++)}`
    }

    public advanceIncident(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): boolean {
        if (!Object.hasOwn(room, 'workerRequests')) {
            return false
        }
        if (now < this.nextIncidentAt) {
            const request = room.workerRequests.forWorker(actor.id)
            return (
                request !== null &&
                request.stage !== 'completed' &&
                request.stage !== 'cancelled'
            )
        }
        this.nextIncidentAt = now + 500
        if (this.job === 'farmer') {
            this.farming.reconcile(actor, room)
        }
        const target =
            this.job === 'farmer'
                ? this.farming.target
                : resourceWorkTarget(
                      this.job === 'lumberjack'
                          ? this.lumberjack.selected
                          : this.gathering.selected
                  )
        return room.workerRequests.updateWorker(
            actor,
            this.job,
            room,
            now,
            target,
            (message) => {
                this.lumberjack.clearWorksite()
                this.gathering.selected = undefined
                if (this.job === 'miner' && message.type === 'gather') {
                    this.gathering.recordProbe(actor, room, message.nodeId, now)
                }
            }
        )
    }

    private interrupted(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): boolean {
        if (this.advanceIncident(actor, room, now)) {
            return true
        }
        if (!canPerformSkillAction(actor, now)) {
            recordWorkerActivity(
                actor,
                {
                    reason: 'unavailable',
                    text: 'Обычное рабочее действие сейчас недоступно состоянию персонажа.',
                    intent: 'wait',
                },
                now
            )
            return true
        }
        const fleeing = fleeWorker(actor, room, now)
        if (fleeing) {
            recordWorkerActivity(
                actor,
                {
                    reason: 'threat',
                    text: 'Сейчас вижу опасность и отхожу от неё.',
                    intent: 'return',
                    danger: { status: 'observed', observedAt: now },
                },
                now
            )
        }
        return fleeing
    }
}
