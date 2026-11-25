import {
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import { resourceApproach, resourceReachable } from './resourcePlacement'
import type { GameRoom } from './room'
import { scenarioGatherCommand } from './scenarioWork'
import { recordWorkerActivity } from './workerActivityState'
import { executeWorkerAdventure } from './workerCommands'
import { stop, WorkerFieldRoute } from './workerNavigation'

/** A separate work budget; incidental tree drops never spend it. */
export class WorkerBrushwood {
    private nextWorkAt = 0
    private readonly fieldRoute = new WorkerFieldRoute()

    public update(actor: GameCharacter, room: GameRoom, now: number): void {
        if (!this.available(actor, room, now)) {
            return
        }
        const service = room.adventureForWorkers()
        const navigation = room.navigationFor(actor)
        const candidates = service
            .resourceSnapshot(actor.locationId)
            .filter((node) => readyNearby(actor, node))
            .sort(
                (a, b) =>
                    distance(actor.position, a.position) -
                    distance(actor.position, b.position)
            )
        for (const node of candidates) {
            const bounds = node.bounds
            if (
                bounds === undefined ||
                service.inspectGather(
                    actor,
                    node.id,
                    'harvest',
                    now,
                    navigation
                ).status === 'stop'
            ) {
                continue
            }
            const approach = resourceApproach(actor, bounds, navigation, 160)
            if (approach === undefined) {
                continue
            }
            recordBrushwoodSite(actor, node, now)
            if (!resourceReachable(actor, bounds, navigation)) {
                this.fieldRoute.advance(
                    actor,
                    room,
                    { ...node, position: approach },
                    2,
                    now
                )
                return
            }
            stop(actor)
            const result = executeWorkerAdventure(
                actor,
                room,
                scenarioGatherCommand(node.id),
                now
            )
            if (result.accepted) {
                this.nextWorkAt = now + 600_000
            } else {
                recordWorkerActivity(
                    actor,
                    {
                        reason: 'unavailable',
                        text: result.error ?? 'Сбор хвороста не выполнен.',
                        intent: 'wait',
                    },
                    now
                )
            }
            return
        }
        stop(actor)
        recordWorkerActivity(
            actor,
            {
                reason: 'unavailable',
                text: 'Рядом нет подходящего доступного источника хвороста.',
                intent: 'wait',
            },
            now
        )
    }
    private available(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): boolean {
        const service = room.adventureForWorkers()
        const stock = service.economy
            .snapshot(CENTER_LOCATION_ID, now)
            ?.rows.find((row) => row.itemId === 'brushwood')
        if (stock === undefined) {
            recordWorkerActivity(
                actor,
                {
                    reason: 'unavailable',
                    text: 'Нет доступного городского реестра спроса на хворост.',
                    intent: 'wait',
                },
                now
            )
            stop(actor)
            return false
        }
        if (now < this.nextWorkAt || stock.stock >= stock.target) {
            recordWorkerActivity(
                actor,
                {
                    reason:
                        now < this.nextWorkAt ? 'break' : 'stock_sufficient',
                    text:
                        now < this.nextWorkAt
                            ? 'Жду следующего выхода за хворостом.'
                            : 'Город сейчас не запрашивает дополнительный хворост.',
                    intent: 'wait',
                    ...(now < this.nextWorkAt
                        ? { until: this.nextWorkAt }
                        : {}),
                },
                now
            )
            stop(actor)
            return false
        }
        return true
    }
}

function recordBrushwoodSite(
    actor: GameCharacter,
    node: AdventureResourceNode,
    now: number
): void {
    recordWorkerActivity(
        actor,
        {
            reason: 'working',
            text: 'Собираю хворост на доступном известном участке.',
            intent: 'work',
            worksite: {
                kind: 'resource',
                sourceId: node.id,
                locationId: node.locationId,
                position: node.position,
            },
        },
        now
    )
}

function readyNearby(
    actor: GameCharacter,
    node: AdventureResourceNode
): boolean {
    return (
        (node.source === 'bush' || node.source === 'branches') &&
        node.phase === 'ready' &&
        node.remaining > 0 &&
        node.bounds !== undefined &&
        distance(actor.position, node.position) <= 160
    )
}
