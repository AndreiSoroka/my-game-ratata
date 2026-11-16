import {
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    type MarketItemId,
    quoteMarketTrade,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CharacterController } from './controllers'
import { countInventoryItem } from './inventory'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'
import { WorkerBrushwood } from './workerBrushwood'
import {
    deliveryKinds,
    hasNoRoute,
    workerDeliveryCount,
    WorkerFarm,
} from './workerFarm'
import {
    approach,
    fleeWorker,
    reachedResource,
    sourceCost,
    stop,
} from './workerNavigation'
import { repairWorker } from './workerRepair'
import { resourceWorkTarget } from './workerRequestData'
import { recordWorkerProbeWork } from './workerRequestWork'
import type { WorkerJob } from './workerSpawns'
/** The controller chooses work; every harvest, sale, repair and planting uses ordinary commands. */
export class EconomyWorkerController implements CharacterController {
    private nextDecisionAt = 0
    private initialized = false
    private readonly nextWorkAt = new Map<string, number>()
    private selected: AdventureResourceNode | undefined
    private readonly farming = new WorkerFarm()
    private readonly brushwood = new WorkerBrushwood()
    private requestIndex = 0
    private plantSearchIndex = 0

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
            this.gather(actor, room, now)
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
        if (
            row === undefined ||
            (this.job === 'farmer' && this.farming.remaining > 0)
        ) {
            return false
        }
        if (merchant?.alive !== true) {
            return true
        }
        if (!approach(actor, room, merchant.locationId, merchant.position)) {
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
        const result = room.requestAdventure(
            actor,
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
        room.publishEvents(result.events)
        return true
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

    private gather(actor: GameCharacter, room: GameRoom, now: number): void {
        const kinds: Array<'wood' | 'stone' | 'scrap'> =
            this.job === 'lumberjack' ? ['wood'] : ['stone', 'scrap']
        const service = room.adventureForWorkers()
        if (this.selected === undefined) {
            const market = service.economy.snapshot(CENTER_LOCATION_ID, now)
            const wanted = kinds.filter(
                (kind) =>
                    now >= (this.nextWorkAt.get(kind) ?? 0) &&
                    (market?.rows.find((row) => row.itemId === kind)?.stock ??
                        Infinity) <
                        (market?.rows.find((row) => row.itemId === kind)
                            ?.target ?? 0)
            )
            if (wanted.length === 0) {
                this.gatherBrushwood(actor, room, now)
                return
            }
            const candidates = WORLD_LOCATION_DEFINITIONS.flatMap((location) =>
                service.resourceSnapshot(location.id)
            )
                .filter(
                    (node) =>
                        wanted.includes(
                            node.kind as 'wood' | 'stone' | 'scrap'
                        ) && node.remaining > 0
                )
                .sort((a, b) => sourceCost(actor, a) - sourceCost(actor, b))
            this.selected = candidates[0]
        }
        const target = this.selected
        if (target === undefined) {
            this.gatherBrushwood(actor, room, now)
            return
        }
        const live = service
            .resourceSnapshot(target.locationId)
            .find((node) => node.id === target.id)
        if (live === undefined || live.remaining <= 0) {
            this.selected = undefined
            this.gatherBrushwood(actor, room, now)
            return
        }
        const navigation = room.navigationFor(actor)
        const reached = reachedResource(actor, live, navigation)
        if (reached) {
            stop(actor)
        } else if (
            !approach(actor, room, target.locationId, target.position, 8)
        ) {
            if (hasNoRoute(actor)) {
                this.selected = undefined
                this.gatherBrushwood(actor, room, now)
            }
            return
        }
        const result = room.requestAdventure(
            actor,
            { type: 'gather', nodeId: target.id },
            now
        )
        room.publishEvents(result.events)
        if (result.accepted) {
            this.nextWorkAt.set(
                target.kind,
                now + (this.job === 'lumberjack' ? 600_000 : 1_200_000)
            )
        } else {
            this.gatherBrushwood(actor, room, now)
        }
        this.selected = undefined
    }

    private gatherBrushwood(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): void {
        if (this.job === 'lumberjack') {
            this.brushwood.update(actor, room, now)
        } else {
            stop(actor)
        }
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
            const result = room.requestAdventure(
                actor,
                { type: 'plant_tree', position },
                now
            )
            room.publishEvents(result.events)
            if (result.accepted) {
                return true
            }
        }
        return false
    }

    private requestId(actor: GameCharacter): string {
        return `work-${actor.id}-${String(this.requestIndex++)}`
    }

    private interrupted(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): boolean {
        if (this.job === 'farmer') {
            this.farming.reconcile(actor, room)
        }
        const target =
            this.job === 'farmer'
                ? this.farming.target
                : resourceWorkTarget(this.selected)
        if (
            Object.hasOwn(room, 'workerRequests') &&
            room.workerRequests.updateWorker(
                actor,
                this.job,
                room,
                now,
                target,
                (message) => {
                    this.selected = undefined
                    recordWorkerProbeWork(
                        actor,
                        room,
                        message,
                        this.job,
                        now,
                        this.nextWorkAt
                    )
                }
            )
        ) {
            return true
        }
        return (
            !canPerformSkillAction(actor, now) || fleeWorker(actor, room, now)
        )
    }
}
