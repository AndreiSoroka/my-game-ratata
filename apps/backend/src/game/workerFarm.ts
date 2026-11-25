import {
    FARM_PLOTS,
    type MarketItemId,
    type WorkerActivitySnapshot,
    type WorkerWorkTarget,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { countInventoryItem } from './inventory'
import type { GameRoom } from './room'
import { scenarioFarmCommand } from './scenarioWork'
import { recordWorkerActivity } from './workerActivityState'
import { executeWorkerAdventure } from './workerCommands'
import { recordFarmPlotIntent } from './workerFarmActivity'
import {
    approachCharacter,
    sourceCost,
    stop,
    WorkerFieldRoute,
} from './workerNavigation'
export class WorkerFarm {
    private readonly fieldRoute = new WorkerFieldRoute()
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
            recordWorkerActivity(
                actor,
                service.farmSupply.workStatus(actor, now) ?? {
                    reason: 'unavailable',
                    text: 'Фермерский выход пока недоступен.',
                    intent: 'wait',
                },
                now
            )
            return
        }
        this.remaining = service.farmSupply.remaining(actor.id)
        const plot = this.selectPlot(actor, room, now)
        if (plot === undefined) {
            const exists = FARM_PLOTS.some((entry) =>
                service
                    .farmSnapshot(entry.locationId, now)
                    .some((candidate) => candidate.id === entry.id)
            )
            this.finish(actor, room, now, {
                reason: exists ? 'seeds' : 'plots',
                text: exists
                    ? 'Нет зрелого урожая, семян или доступного аванса семян для выбора грядки.'
                    : 'Настоящих доступных грядок сейчас нет.',
                intent: 'wait',
            })
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
        this.workPlot(actor, room, plot, now)
    }

    private workPlot(
        actor: GameCharacter,
        room: GameRoom,
        plot: import('@my-game-ratata/contracts').FarmPlotSnapshot,
        now: number
    ): void {
        const service = room.adventureForWorkers()
        if (!this.fieldRoute.advance(actor, room, plot, 36, now)) {
            if (hasNoRoute(actor)) {
                this.finish(actor, room, now, {
                    reason: 'route',
                    text: 'К выбранной грядке нет доступного пути.',
                    intent: 'wait',
                })
            }
            if (actor.hasPath()) {
                recordFarmPlotIntent(actor, plot, now)
            }
            return
        }
        if (plot.phase === 'growing') {
            recordWorkerActivity(
                actor,
                {
                    reason: 'plots',
                    text: `Жду роста посевов на грядке «${plot.name}».`,
                    intent: 'wait',
                    worksite: {
                        kind: 'farm',
                        sourceId: plot.id,
                        locationId: plot.locationId,
                        position: plot.position,
                    },
                    until: plot.readyAt,
                },
                now
            )
            return
        }
        if (now < service.workAvailableAt(actor)) {
            recordWorkerActivity(
                actor,
                {
                    reason: 'break',
                    text: 'Жду короткую паузу между рабочими действиями.',
                    intent: 'wait',
                    worksite: {
                        kind: 'farm',
                        sourceId: plot.id,
                        locationId: plot.locationId,
                        position: plot.position,
                    },
                    until: service.workAvailableAt(actor),
                },
                now
            )
            return
        }
        recordFarmPlotIntent(actor, plot, now)
        const action = plot.phase === 'bare' ? 'sow' : 'harvest'
        const result = executeWorkerAdventure(
            actor,
            room,
            scenarioFarmCommand({ plotId: plot.id, action }),
            now
        )
        this.remaining = service.farmSupply.remaining(actor.id)
        if (!result.accepted) {
            this.failedPlot(actor, room, action, result.error, now)
        }
    }

    private failedPlot(
        actor: GameCharacter,
        room: GameRoom,
        action: 'sow' | 'harvest',
        error: string | null,
        now: number
    ): void {
        const status: WorkerActivitySnapshot = {
            reason: error?.includes('рюкзак') === true ? 'bag' : 'unavailable',
            text: error ?? 'Рабочее действие пока не выполнено.',
            intent: action,
            ...(this.target === undefined ? {} : { worksite: this.target }),
        }
        if (action === 'harvest') {
            this.finish(actor, room, now, status)
        } else {
            recordWorkerActivity(actor, status, now)
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
            this.finish(actor, room, now, {
                reason: 'supplier',
                text: 'Городской поставщик семян сейчас недоступен.',
                intent: 'wait',
            })
            return
        }
        recordWorkerActivity(
            actor,
            {
                reason: 'working',
                text: `Иду к поставщику ${supplier.nickname} за настоящим авансом семян для выбранной грядки.`,
                intent: 'get_seed',
                ...(this.target === undefined ? {} : { worksite: this.target }),
            },
            now
        )
        if (!approachCharacter(actor, room, supplier)) {
            if (hasNoRoute(actor)) {
                this.finish(actor, room, now, {
                    reason: 'route',
                    text: 'К поставщику семян нет доступного пути.',
                    intent: 'wait',
                })
            }
            return
        }
        const result = executeWorkerAdventure(
            actor,
            room,
            {
                type: 'farm_supply',
                npcId: supplier.id,
                plotId,
                requestId: `farm-supply-${actor.id}-${String(now)}`,
            },
            now
        )
        if (!result.accepted) {
            this.finish(actor, room, now, {
                reason:
                    result.error?.includes('рюкзак') === true ? 'bag' : 'seeds',
                text: result.error ?? 'Поставщик не выдал аванс семян.',
                intent: 'wait',
            })
        }
    }

    private finish(
        actor: GameCharacter,
        room: GameRoom,
        now: number,
        reason: WorkerActivitySnapshot
    ): void {
        const status = {
            ...reason,
            ...(this.target === undefined ? {} : { worksite: this.target }),
        }
        const supply = room.adventureForWorkers().farmSupply
        if (
            ['route', 'supplier', 'plots', 'unavailable'].includes(
                reason.reason
            )
        ) {
            supply.pauseWork(actor.id, status, now + 1000)
            status.until = now + 1000
        } else {
            supply.finishWork(actor.id, status)
        }
        stop(actor)
        recordWorkerActivity(actor, status, now)
        this.remaining = supply.remaining(actor.id)
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
