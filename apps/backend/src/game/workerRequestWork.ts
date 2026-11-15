import type {
    AdventureClientMessage,
    AdventureResourceNode,
    FarmPlotSnapshot,
    WorkerWorkTarget,
} from '@my-game-ratata/contracts'

import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import { countInventoryItem } from './inventory'
import { distance } from './math'
import { resourceApproach, resourceReachable } from './resourcePlacement'
import type { GameRoom } from './room'
import { approach } from './workerNavigation'
import { WORKER_REQUEST_RADIUS } from './workerRequestData'

export interface WorkerStepResult {
    done: boolean
    reason: string | null
}
export type WorkerCommand = (
    message: AdventureClientMessage
) => AdventureActionResult
export interface WorkerWorkAdapter {
    kind: WorkerWorkTarget['kind']
    findTarget(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): WorkerWorkTarget | undefined
    advance(
        actor: GameCharacter,
        room: GameRoom,
        target: WorkerWorkTarget,
        now: number,
        perform: WorkerCommand
    ): WorkerStepResult
}

function nearby<T extends { id: string; position: { x: number; y: number } }>(
    candidates: T[],
    target: WorkerWorkTarget
): T[] {
    return candidates
        .filter(
            (candidate) =>
                distance(candidate.position, target.position) <=
                WORKER_REQUEST_RADIUS
        )
        .sort((a, b) => {
            const priority =
                Number(b.id === target.sourceId) -
                Number(a.id === target.sourceId)
            return priority !== 0
                ? priority
                : distance(a.position, target.position) -
                      distance(b.position, target.position)
        })
}

function workTarget(
    kind: WorkerWorkTarget['kind'],
    source: {
        id: string
        locationId: string
        position: { x: number; y: number }
    }
): WorkerWorkTarget {
    return {
        kind,
        sourceId: source.id,
        locationId: source.locationId,
        position: { ...source.position },
    }
}

function gatherAdapter(kinds: string[]): WorkerWorkAdapter {
    const candidates = (room: GameRoom, locationId: string) =>
        room
            .adventureForWorkers()
            .resourceSnapshot(locationId)
            .filter(
                (node) =>
                    kinds.includes(node.kind) &&
                    node.remaining > 0 &&
                    (node.source === undefined || node.phase === 'ready')
            )
    return {
        kind: 'resource',
        findTarget(actor, room) {
            const node = candidates(room, actor.locationId).sort(
                (a, b) =>
                    distance(actor.position, a.position) -
                    distance(actor.position, b.position)
            )[0]
            return node === undefined ? undefined : workTarget('resource', node)
        },
        advance(actor, room, target, now, perform) {
            const node = nearby(candidates(room, target.locationId), target)[0]
            return node === undefined
                ? {
                      done: false,
                      reason: 'На рабочем участке не осталось подходящего ресурса.',
                  }
                : gatherStep(actor, room, node, now, perform)
        },
    }
}

function gatherStep(
    actor: GameCharacter,
    room: GameRoom,
    node: AdventureResourceNode,
    now: number,
    perform: WorkerCommand
): WorkerStepResult {
    const service = room.adventureForWorkers()
    if (node.source === undefined) {
        return genericGatherStep(actor, room, node, perform)
    }
    const navigation = room.navigationFor(actor)
    if (
        node.bounds !== undefined &&
        !resourceReachable(actor, node.bounds, navigation)
    ) {
        const point = resourceApproach(actor, node.bounds, navigation)
        if (point !== undefined) {
            approach(actor, room, node.locationId, point, 2)
        }
        return {
            done: false,
            reason:
                point === undefined
                    ? 'К рабочему ресурсу нет доступного пути.'
                    : null,
        }
    }
    const check = service.inspectGather(
        actor,
        node.id,
        'harvest',
        now,
        room.navigationFor(actor)
    )
    if (check.status === 'range' && check.target !== undefined) {
        approach(actor, room, node.locationId, check.target, 2)
        return {
            done: false,
            reason: actor.hasPath()
                ? null
                : 'К рабочему ресурсу нет доступного пути.',
        }
    }
    if (check.status !== 'ready') {
        return {
            done: false,
            reason:
                check.reason ??
                (check.status === 'cooldown'
                    ? 'Работник ждёт окончания обычной рабочей паузы.'
                    : 'Сейчас добыча недоступна.'),
        }
    }
    const result = perform({ type: 'gather', nodeId: node.id })
    return { done: result.accepted, reason: result.error }
}

function genericGatherStep(
    actor: GameCharacter,
    room: GameRoom,
    node: AdventureResourceNode,
    perform: WorkerCommand
): WorkerStepResult {
    if (!approach(actor, room, node.locationId, node.position)) {
        return {
            done: false,
            reason: actor.hasPath()
                ? null
                : 'К рабочему ресурсу нет доступного пути.',
        }
    }
    const result = perform({ type: 'gather', nodeId: node.id })
    return { done: result.accepted, reason: result.error }
}

function farmCandidates(
    room: GameRoom,
    locationId: string,
    now: number
): FarmPlotSnapshot[] {
    return room.adventureForWorkers().farmSnapshot(locationId, now)
}

const farmer: WorkerWorkAdapter = {
    kind: 'farm',
    findTarget(actor, room, now) {
        const plot = farmCandidates(room, actor.locationId, now).sort(
            (a, b) =>
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
        )[0]
        return plot === undefined ? undefined : workTarget('farm', plot)
    },
    advance(actor, room, target, now, perform) {
        const plots = nearby(
            farmCandidates(room, target.locationId, now),
            target
        )
        const seeds = countInventoryItem(actor.inventory, 'wheat_seed') > 0
        const plot =
            plots.find((entry) => entry.phase === 'ripe') ??
            plots.find((entry) => entry.phase === 'bare' && seeds) ??
            plots.find((entry) => entry.phase === 'growing') ??
            plots[0]
        return plot === undefined
            ? { done: false, reason: 'Рабочая грядка больше не существует.' }
            : farmStep(actor, room, plot, now, perform)
    },
}

function farmStep(
    actor: GameCharacter,
    room: GameRoom,
    plot: FarmPlotSnapshot,
    now: number,
    perform: WorkerCommand
): WorkerStepResult {
    if (!approach(actor, room, plot.locationId, plot.position)) {
        return {
            done: false,
            reason: actor.hasPath()
                ? null
                : 'К рабочей грядке нет доступного пути.',
        }
    }
    if (plot.phase === 'growing') {
        return {
            done: false,
            reason: 'Работник ждёт созревания настоящего урожая.',
        }
    }
    if (now < room.adventureForWorkers().workAvailableAt(actor)) {
        return {
            done: false,
            reason: 'Работник ждёт окончания обычной рабочей паузы.',
        }
    }
    const result = perform({
        type: 'farm_action',
        plotId: plot.id,
        action: plot.phase === 'bare' ? 'sow' : 'harvest',
    })
    return { done: result.accepted, reason: result.error }
}

/** Future outdoor professions supply an adapter, never another character simulation. */
export const WORKER_WORK_ADAPTERS: ReadonlyMap<string, WorkerWorkAdapter> =
    new Map([
        ['farmer', farmer],
        ['lumberjack', gatherAdapter(['wood'])],
        ['miner', gatherAdapter(['stone', 'scrap'])],
    ])

export function recordWorkerProbeWork(
    actor: GameCharacter,
    room: GameRoom,
    message: AdventureClientMessage,
    job: string,
    now: number,
    nextWorkAt: Map<string, number>
): void {
    if (message.type !== 'gather') {
        return
    }
    const node = room
        .adventureForWorkers()
        .resourceSnapshot(actor.locationId)
        .find((source) => source.id === message.nodeId)
    if (node !== undefined) {
        nextWorkAt.set(
            node.kind,
            now + (job === 'lumberjack' ? 600_000 : 1_200_000)
        )
    }
}
