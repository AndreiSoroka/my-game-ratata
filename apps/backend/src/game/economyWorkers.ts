import {
    CENTER_LOCATION_ID,
    type MarketItemId,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import { countInventoryItem } from './inventory'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'
import { recordWorkerActivity } from './workerActivityState'
import { executeWorkerAdventure } from './workerCommands'
import { deliveryKinds, workerDeliveryCount, WorkerFarm } from './workerFarm'
import { WorkerGather } from './workerGather'
import { approachCharacter, fleeWorker } from './workerNavigation'
import { repairWorker } from './workerRepair'
import { resourceWorkTarget } from './workerRequestData'
import { recordWorkerProbeWork } from './workerRequestWork'
import type { WorkerJob } from './workerSpawns'
/** The controller chooses work; every harvest, sale, repair and planting uses ordinary commands. */
export class EconomyWorkerController implements CharacterController {
    private nextDecisionAt = 0
    private nextIncidentAt = 0
    private initialized = false
    private readonly farming = new WorkerFarm()
    private requestIndex = 0
    private plantSearchIndex = 0

    private readonly gathering: WorkerGather
    public constructor(private readonly job: WorkerJob) {
        this.gathering = new WorkerGather(job)
    }

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
        if (this.deliver(actor, room, now)) {
            return
        }
        if (this.repair(actor, room, now)) {
            return
        }
        if (this.job === 'lumberjack' && this.plant(actor, room, now)) {
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
        const carriesWood = countInventoryItem(actor.inventory, 'wood') > 0
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
                    candidate.stock < candidate.capacity &&
                    (candidate.itemId !== 'brushwood' ||
                        carriesWood ||
                        actor.locationId === merchant?.locationId)
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

    private plant(actor: GameCharacter, room: GameRoom, now: number): boolean {
        if (countInventoryItem(actor.inventory, 'sapling') === 0) {
            return false
        }
        const navigation = room.navigationFor(actor)
        const center = navigation.worldToTile(actor.position)
        // Try nearby sites through the same validator; failed planting never spends a seed.
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const index = this.plantSearchIndex++ % 25
            const tile = {
                x: center.x + (index % 5) - 2,
                y: center.y + Math.floor(index / 5) - 2,
            }
            if (navigation.isSolidTile(tile)) {
                continue
            }
            const position = navigation.tileToWorld(tile)
            const result = executeWorkerAdventure(
                actor,
                room,
                { type: 'plant_tree', position },
                now
            )
            if (result.accepted) {
                recordWorkerActivity(
                    actor,
                    {
                        reason: 'working',
                        text: 'Посадил настоящий саженец на подходящем участке.',
                        intent: 'work',
                    },
                    now
                )
                return true
            }
        }
        return false
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
                : resourceWorkTarget(this.gathering.selected)
        return room.workerRequests.updateWorker(
            actor,
            this.job,
            room,
            now,
            target,
            (message) => {
                this.gathering.selected = undefined
                recordWorkerProbeWork(
                    actor,
                    room,
                    message,
                    this.job,
                    now,
                    this.gathering.nextWorkAt
                )
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
