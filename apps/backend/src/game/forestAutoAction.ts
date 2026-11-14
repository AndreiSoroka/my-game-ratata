import type { AdventureResourceNode, Vector2 } from '@my-game-ratata/contracts'
import { isItemBroken } from '@my-game-ratata/contracts'

import { availableActor } from './autoActionTargets'
import type { GameCharacter } from './character'
import type { ControlWorld } from './controlWorld'
import {
    clearForestAction,
    equipmentKey,
    type ForestAction,
    publishForestEvents,
    work,
    type WorkState,
} from './forestWorkState'
import { distance } from './math'
export {
    clearForestAction,
    samePendingPlant,
    snapshotForestAction,
} from './forestWorkState'

export function setForestAction(
    actor: GameCharacter,
    action: ForestAction,
    world: ControlWorld,
    now: number
): boolean {
    const service = world.adventureForWorkers?.()
    if (!availableActor(actor, now) || service === undefined) {
        return false
    }
    const navigation = world.navigationFor(actor)
    const valid =
        action.kind === 'gather'
            ? service.inspectGather(
                  actor,
                  action.nodeId,
                  gatherOperation(action),
                  now,
                  navigation
              ).status !== 'stop'
            : service.previewPlant(actor, action.position, navigation).available
    if (!valid) {
        return false
    }
    work.set(actor, {
        action: structuredClone(action),
        locationId: actor.locationId,
        equipment: equipmentKey(actor),
        waiting: null,
        lastPlanAt: -Infinity,
        progressAt: now,
        progressPosition: { ...actor.position },
        ownsLock: false,
    })
    actor.interruptWork = () => {
        clearForestAction(actor)
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    return true
}
export function advanceForestAction(
    actor: GameCharacter,
    world: ControlWorld,
    now: number
): boolean | undefined {
    const state = work.get(actor)
    if (state === undefined) {
        return undefined
    }
    const service = world.adventureForWorkers?.()
    if (
        !availableActor(actor, now) ||
        service === undefined ||
        actor.locationId !== state.locationId ||
        equipmentKey(actor) !== state.equipment
    ) {
        clearForestAction(actor)
        return false
    }
    return state.action.kind === 'gather'
        ? advanceGather(actor, state, state.action, world, now)
        : advancePlant(actor, state, state.action, world, now)
}
function advanceGather(
    actor: GameCharacter,
    state: WorkState,
    action: Extract<ForestAction, { kind: 'gather' }>,
    world: ControlWorld,
    now: number
): boolean {
    const service = world.adventureForWorkers?.()
    if (service === undefined) {
        return finish(actor)
    }
    const navigation = world.navigationFor(actor)
    const inspection = service.inspectGather(
        actor,
        action.nodeId,
        gatherOperation(action),
        now,
        navigation
    )
    if (inspection.status === 'stop') {
        if (inspection.reason !== undefined) {
            service.reportWorkProblem(actor, inspection.reason)
        }
        return finish(actor)
    }
    if (inspection.status === 'range') {
        return approach(actor, state, inspection.target, world, now)
    }
    state.progressAt = now
    state.waiting = inspection.status === 'cooldown' ? 'cooldown' : null
    if (state.waiting !== null) {
        return true
    }
    const result = service.handleResult(
        actor,
        {
            type: 'gather',
            nodeId: action.nodeId,
            operation: gatherOperation(action),
        },
        [],
        navigation,
        now
    )
    publishForestEvents(world, result.events)
    if (!result.accepted) {
        return finish(actor)
    }
    state.ownsLock = true
    if (isWorkToolBroken(actor)) {
        return finish(actor)
    }
    const node = service
        .resourceSnapshot(actor.locationId)
        .find((entry) => entry.id === action.nodeId)
    // A newly created stump is a new operation, never the next automatic strike.
    if (sourceFinished(node)) {
        return finish(actor)
    }
    return true
}
function advancePlant(
    actor: GameCharacter,
    state: WorkState,
    action: Extract<ForestAction, { kind: 'plant_tree' }>,
    world: ControlWorld,
    now: number
): boolean {
    const service = world.adventureForWorkers?.()
    if (service === undefined) {
        return finish(actor)
    }
    const navigation = world.navigationFor(actor)
    const preview = service.previewPlant(actor, action.position, navigation)
    if (!preview.available || preview.approach === undefined) {
        service.reportWorkProblem(
            actor,
            preview.reason ?? 'К участку нет доступного подхода.'
        )
        return finish(actor)
    }
    if (distance(actor.position, preview.approach) > 3) {
        return approach(actor, state, preview.approach, world, now)
    }
    if (actor.isActionLocked(now) || service.workAvailableAt(actor) > now) {
        state.waiting = 'cooldown'
        state.progressAt = now
        return true
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    const result = service.handleResult(
        actor,
        { type: 'plant_tree', position: action.position },
        [],
        navigation,
        now
    )
    publishForestEvents(world, result.events)
    state.ownsLock = result.accepted
    // Planting is one attempt after arrival, including a rejection at the final check.
    return finish(actor)
}

function finish(actor: GameCharacter): false {
    clearForestAction(actor)
    return false
}
function approach(
    actor: GameCharacter,
    state: WorkState,
    point: Vector2 | undefined,
    world: ControlWorld,
    now: number
): boolean {
    state.waiting = 'range'
    if (distance(actor.position, state.progressPosition) >= 2) {
        state.progressPosition = { ...actor.position }
        state.progressAt = now
    }
    if (point === undefined || now - state.progressAt >= 10_000) {
        world
            .adventureForWorkers?.()
            .reportWorkProblem(
                actor,
                'Нет продвижения к выбранному месту. Работа остановлена.'
            )
        return finish(actor)
    }
    if (actor.isActionLocked(now)) {
        state.progressAt = now
        return true
    }
    if (now - state.lastPlanAt >= 300) {
        state.lastPlanAt = now
        const path = world
            .navigationFor(actor)
            .findPathWorld(actor.position, point)
        if (path.length === 0 && distance(actor.position, point) > 3) {
            return finish(actor)
        }
        actor.setPath(path)
    }
    return true
}

function sourceFinished(node: AdventureResourceNode | undefined): boolean {
    return (
        node === undefined ||
        node.phase === 'stump' ||
        node.phase === 'removed' ||
        node.remaining <= 0
    )
}
function gatherOperation(action: Extract<ForestAction, { kind: 'gather' }>) {
    return action.operation ?? 'harvest'
}

function isWorkToolBroken(actor: GameCharacter): boolean {
    return (
        actor.equipment.weapon !== undefined &&
        isItemBroken(actor.equipment.weapon)
    )
}
