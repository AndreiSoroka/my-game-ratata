import {
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { resourceApproach } from './resourcePlacement'
import type { GameRoom } from './room'
import { scenarioGatherCommand } from './scenarioWork'
import { recordWorkerActivity } from './workerActivityState'
import { WorkerBrushwood } from './workerBrushwood'
import { executeWorkerAdventure } from './workerCommands'
import { hasNoRoute } from './workerFarm'
import { recordGatherPause } from './workerGatherActivity'
import {
    reachedResource,
    sourceCost,
    stop,
    WorkerFieldRoute,
} from './workerNavigation'
import type { WorkerJob } from './workerSpawns'

export class WorkerGather {
    public selected: AdventureResourceNode | undefined
    public readonly nextWorkAt = new Map<string, number>()
    private readonly brushwood = new WorkerBrushwood()
    private readonly fieldRoute = new WorkerFieldRoute()
    public constructor(private readonly job: WorkerJob) {}
    public update(actor: GameCharacter, room: GameRoom, now: number): void {
        const service = room.adventureForWorkers()
        this.selected ??= this.select(actor, room, now)
        const target = this.selected
        if (target === undefined) {
            this.gatherBrushwood(actor, room, now)
            return
        }
        const live = service
            .resourceSnapshot(target.locationId)
            .find((node) => node.id === target.id)
        if (live === undefined || live.remaining <= 0) {
            recordWorkerActivity(
                actor,
                {
                    reason: 'unavailable',
                    text: 'Выбранный источник закончился; перепроверяю следующую рабочую цель.',
                    intent: 'wait',
                },
                now
            )
            this.selected = undefined
            this.gatherBrushwood(actor, room, now)
            return
        }
        recordWorkerActivity(
            actor,
            {
                reason: 'working',
                text: `Иду добывать ресурс ${live.kind} на выбранном участке.`,
                intent: 'work',
                worksite: {
                    kind: 'resource',
                    sourceId: live.id,
                    locationId: live.locationId,
                    position: live.position,
                },
            },
            now
        )
        const navigation = room.navigationFor(actor)
        const reached = reachedResource(actor, live, navigation)
        if (reached) {
            stop(actor)
        } else if (!this.approach(actor, room, live, now)) {
            if (hasNoRoute(actor)) {
                recordWorkerActivity(
                    actor,
                    {
                        reason: 'route',
                        text: 'К выбранному ресурсу нет доступного пути.',
                        intent: 'wait',
                    },
                    now
                )
                this.selected = undefined
                this.gatherBrushwood(actor, room, now)
            }
            return
        }
        const result = executeWorkerAdventure(
            actor,
            room,
            scenarioGatherCommand(live.id),
            now
        )
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

    private approach(
        actor: GameCharacter,
        room: GameRoom,
        target: AdventureResourceNode,
        now: number
    ): boolean {
        const localBounds =
            actor.locationId === target.locationId ? target.bounds : undefined
        const point =
            localBounds === undefined
                ? target.position
                : resourceApproach(
                      actor,
                      localBounds,
                      room.navigationFor(actor)
                  )
        if (point === undefined) {
            stop(actor)
            return false
        }
        return this.fieldRoute.advance(
            actor,
            room,
            { ...target, position: point },
            localBounds === undefined ? 8 : 2,
            now
        )
    }

    private select(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): AdventureResourceNode | undefined {
        const kinds: Array<'wood' | 'stone' | 'scrap'> =
            this.job === 'lumberjack' ? ['wood'] : ['stone', 'scrap']
        const service = room.adventureForWorkers()
        const market = service.economy.snapshot(CENTER_LOCATION_ID, now)
        const wanted = kinds.filter(
            (kind) =>
                now >= (this.nextWorkAt.get(kind) ?? 0) &&
                (market?.rows.find((row) => row.itemId === kind)?.stock ??
                    Infinity) <
                    (market?.rows.find((row) => row.itemId === kind)?.target ??
                        0)
        )
        if (wanted.length === 0) {
            recordGatherPause(actor, kinds, market, this.nextWorkAt, now)
            return undefined
        }
        const candidates = WORLD_LOCATION_DEFINITIONS.flatMap((location) =>
            service.resourceSnapshot(location.id)
        )
            .filter(
                (node) =>
                    wanted.includes(node.kind as 'wood' | 'stone' | 'scrap') &&
                    node.remaining > 0
            )
            .sort((a, b) => sourceCost(actor, a) - sourceCost(actor, b))
        if (candidates.length === 0) {
            recordWorkerActivity(
                actor,
                {
                    reason: 'unavailable',
                    text: 'Известных подходящих источников для нужного ресурса сейчас нет.',
                    intent: 'wait',
                },
                now
            )
        }
        return candidates[0]
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
}
