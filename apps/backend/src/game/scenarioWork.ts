import {
    type AdventureClientMessage,
    FARM_INTERACTION_RANGE,
    type ScenarioStep,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { countInventoryItem } from './inventory'
import { resourceReachable } from './resourcePlacement'
import type { GameRoom } from './room'
import { workingApproach } from './scenarioApproach'
import { navigateScenario, type ScenarioOutcome } from './scenarioNavigation'
import { retryOutcome } from './scenarioRetries'
import type { ScenarioRuntime } from './scenarioState'
import {
    type ScenarioTarget,
    visibleScenarioPlot,
    visibleScenarioTargets,
} from './scenarioTargets'

export function scenarioFarmCommand(
    step: Pick<Extract<ScenarioStep, { kind: 'farm' }>, 'action' | 'plotId'>
): Extract<AdventureClientMessage, { type: 'farm_action' }> {
    return { type: 'farm_action', plotId: step.plotId, action: step.action }
}

export function scenarioGatherCommand(
    nodeId: string
): Extract<AdventureClientMessage, { type: 'gather' }> {
    return { type: 'gather', nodeId }
}

export function farmScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'farm' }>,
    now: number
): ScenarioOutcome {
    const plot = visibleScenarioPlot(actor, room, step, now)
    if (plot === undefined) {
        return {
            state: 'blocked',
            reason: 'Выбранную грядку не видно в этой локации.',
        }
    }
    if (step.action === 'sow' && plot.phase === 'growing') {
        return { state: 'skipped', reason: 'На грядке уже растут посевы.' }
    }
    if (step.action === 'harvest' && plot.phase === 'growing') {
        return { state: 'waiting', reason: 'Посевы ещё не созрели.' }
    }
    const move = navigateScenario(
        actor,
        run,
        room,
        plot.locationId,
        plot.position,
        FARM_INTERACTION_RANGE,
        now
    )
    if (move.state !== 'done') {
        return move
    }
    if (now < room.adventureForWorkers().workAvailableAt(actor)) {
        return { state: 'waiting' }
    }
    if (now - run.step.lastActionAt < 500) {
        return retryOutcome(run)
    }
    const before = structuredClone(actor.inventory)
    const result = room.requestAdventure(actor, scenarioFarmCommand(step), now)
    run.step.lastActionAt = now
    room.publishEvents(result.events)
    if (!result.accepted) {
        run.step.lastFailure =
            result.error ?? 'Работа на грядке сейчас недоступна.'
        return retryOutcome(run)
    }
    run.ledger.acquired(before, actor.inventory)
    return { state: 'done' }
}

export function gatherScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'gather' }>,
    now: number
): ScenarioOutcome {
    if (typeof step.amount === 'number' && run.step.progress >= step.amount) {
        return { state: 'done' }
    }
    const kind = step.resource === 'wood' ? 'tree' : step.resource
    const candidates = visibleScenarioTargets(actor, room, kind, undefined, now)
    const target =
        run.step.targetId === undefined
            ? candidates[0]
            : candidates.find((entry) => entry.id === run.step.targetId)
    if (target === undefined) {
        delete run.step.targetId
        return {
            state: 'blocked',
            reason: 'Подходящего ресурса в области видимости нет.',
        }
    }
    run.step.targetId = target.id
    const navigation = room.navigationFor(actor)
    const reached =
        target.resource?.bounds === undefined
            ? Math.hypot(
                  actor.position.x - target.position.x,
                  actor.position.y - target.position.y
              ) <= 36
            : resourceReachable(actor, target.resource.bounds, navigation)
    if (!reached) {
        return workingApproach(actor, run, room, target, now)
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    if (now - run.step.lastActionAt < 500) {
        return retryOutcome(run)
    }
    return performGather(actor, run, room, step, target, now)
}

function performGather(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'gather' }>,
    target: ScenarioTarget,
    now: number
): ScenarioOutcome {
    const before = structuredClone(actor.inventory)
    const count = countInventoryItem(actor.inventory, step.resource)
    const command =
        target.farmId === undefined
            ? scenarioGatherCommand(target.id)
            : scenarioFarmCommand({ plotId: target.farmId, action: 'harvest' })
    const result = room.requestAdventure(actor, command, now)
    run.step.lastActionAt = now
    room.publishEvents(result.events)
    if (!result.accepted) {
        run.step.lastFailure = result.error ?? 'Ресурс сейчас добыть нельзя.'
        return {
            state: 'blocked',
            reason: run.step.lastFailure,
        }
    }
    delete run.step.lastFailure
    run.ledger.acquired(before, actor.inventory)
    run.step.progress += Math.max(
        0,
        countInventoryItem(actor.inventory, step.resource) - count
    )
    if (typeof step.amount === 'number' && run.step.progress >= step.amount) {
        return { state: 'done' }
    }
    if (
        step.amount === 'depleted' &&
        sourceFinished(actor, room, target, now)
    ) {
        return { state: 'done' }
    }
    return { state: 'progress' }
}

function sourceFinished(
    actor: GameCharacter,
    room: GameRoom,
    target: ScenarioTarget,
    now: number
): boolean {
    const service = room.adventureForWorkers()
    if (target.farmId !== undefined) {
        return (
            service
                .farmSnapshot(actor.locationId, now)
                .find((plot) => plot.id === target.farmId)?.phase !== 'ripe'
        )
    }
    return (
        service
            .resourceSnapshot(actor.locationId)
            .find((node) => node.id === target.id)?.remaining === 0
    )
}

export function pickupScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'pickup' }>,
    now: number
): ScenarioOutcome {
    const target = visibleScenarioTargets(
        actor,
        room,
        'item',
        step.itemId,
        now
    )[0]
    if (target === undefined) {
        return { state: 'blocked', reason: 'Подходящих предметов не видно.' }
    }
    const move = navigateScenario(
        actor,
        run,
        room,
        actor.locationId,
        target.position,
        24,
        now
    )
    if (move.state !== 'done') {
        return move
    }
    const before = structuredClone(actor.inventory)
    const events = room.requestPickup(actor, target.id, now)
    room.publishEvents(events)
    if (!events.some((event) => event.kind === 'item_pickup')) {
        return {
            state: 'blocked',
            reason: 'Не удалось подобрать предмет: проверь место в сумке.',
        }
    }
    run.ledger.acquired(before, actor.inventory)
    return { state: 'done' }
}
