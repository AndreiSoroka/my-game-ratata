import type { ScenarioStep } from '@my-game-ratata/contracts'

import { applyAgentControl } from './agentCapabilities'
import type { GameCharacter } from './character'
import { snapshotControl } from './characterControl'
import { effectiveMaxEnergy, effectiveMaxMana } from './effectiveResources'
import type { GameRoom } from './room'
import { approachWorkTarget } from './scenarioApproach'
import { attackScenario, castScenario } from './scenarioCombat'
import { tryScenarioDash } from './scenarioDash'
import { depositScenario } from './scenarioDeposit'
import { navigateScenario, type ScenarioOutcome } from './scenarioNavigation'
import { type ScenarioRuntime, stopScenarioPath } from './scenarioState'
import {
    findFriendlyScenarioTarget,
    isScenarioFriendly,
    visibleScenarioCharacter,
    visibleScenarioTargets,
} from './scenarioTargets'
import { farmScenario, gatherScenario, pickupScenario } from './scenarioWork'

export function executeScenarioStep(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: ScenarioStep,
    now: number,
    deltaMs: number
): ScenarioOutcome {
    switch (step.kind) {
        case 'go':
            return go(actor, run, room, step, now)
        case 'search':
            return search(actor, run, room, step, now)
        case 'gather':
            return gatherScenario(actor, run, room, step, now)
        case 'pickup':
            return pickupScenario(actor, run, room, step, now)
        case 'deposit':
            return depositScenario(actor, run, room, step, now)
        case 'attack':
            return attackScenario(actor, run, room, step, now)
        case 'follow':
            return follow(actor, run, room, step, now)
        case 'farm':
            return farmScenario(actor, run, room, step, now)
        case 'cast':
            return castScenario(actor, run, room, step, now)
        case 'wait':
            return wait(actor, run, step.durationMs, deltaMs)
        case 'recover':
            stopScenarioPath(actor, run)
            return recover(actor, step)
    }
}

function search(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'search' }>,
    now: number
): ScenarioOutcome {
    stopScenarioPath(actor, run)
    return visibleScenarioTargets(actor, room, step.target, step.itemId, now)
        .length > 0
        ? { state: 'done' }
        : {
              state: 'blocked',
              reason: 'Подходящая цель в области видимости не найдена.',
          }
}

function wait(
    actor: GameCharacter,
    run: ScenarioRuntime,
    durationMs: number,
    deltaMs: number
): ScenarioOutcome {
    stopScenarioPath(actor, run)
    run.step.waitMs += deltaMs
    return { state: run.step.waitMs >= durationMs ? 'done' : 'waiting' }
}

function recover(
    actor: GameCharacter,
    step: Extract<ScenarioStep, { kind: 'recover' }>
): ScenarioOutcome {
    const maximum =
        step.resource === 'hp'
            ? actor.maxHp
            : step.resource === 'energy'
              ? effectiveMaxEnergy(actor)
              : effectiveMaxMana(actor)
    if (step.atLeast > maximum) {
        return {
            state: 'blocked',
            reason: 'Указанное значение превышает максимум ресурса.',
        }
    }
    return { state: actor[step.resource] >= step.atLeast ? 'done' : 'waiting' }
}
function go(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'go' }>,
    now: number
): ScenarioOutcome {
    const outcome = moveToDestination(actor, run, room, step.destination, now)
    if (
        step.dash === true &&
        run.step.lastActionAt === -Infinity &&
        tryScenarioDash(actor, room, now)
    ) {
        run.step.lastActionAt = now
        return { state: 'progress' }
    }
    return outcome
}

function moveToDestination(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    destination: Extract<ScenarioStep, { kind: 'go' }>['destination'],
    now: number
): ScenarioOutcome {
    if (destination.kind === 'marker') {
        stopScenarioPath(actor, run)
        return { state: 'blocked', reason: 'Метка отсутствует.' }
    }
    if (destination.kind === 'point') {
        return navigateScenario(
            actor,
            run,
            room,
            destination.locationId,
            destination.position,
            1,
            now
        )
    }
    if (
        destination.locationId !== undefined &&
        destination.locationId !== actor.locationId
    ) {
        stopScenarioPath(actor, run)
        return {
            state: 'blocked',
            reason: 'Выбранная цель находится в другой локации.',
        }
    }
    const target = visibleScenarioTargets(
        actor,
        room,
        destination.target,
        destination.itemId,
        now
    ).find(
        (entry) =>
            destination.targetId === undefined ||
            entry.id === destination.targetId
    )
    if (target === undefined) {
        stopScenarioPath(actor, run)
        return { state: 'blocked', reason: 'Подходящая цель больше не видна.' }
    }
    return approachWorkTarget(actor, run, room, target, now)
}

function follow(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'follow' }>,
    now: number
): ScenarioOutcome {
    const control = snapshotControl(actor)
    const target = followTarget(actor, run, room, step.target, now)
    if (target === undefined || !isScenarioFriendly(actor, target, now)) {
        return {
            state: 'blocked',
            reason: 'Подходящего персонажа для следования не видно.',
        }
    }
    if (control.mode !== 'follow' || control.targetId !== target.id) {
        const decision = applyAgentControl(
            actor,
            { type: 'follow', targetId: target.id },
            room,
            now
        )
        if (!decision.accepted) {
            return { state: 'blocked', reason: 'Следование сейчас недоступно.' }
        }
    }
    run.followTargetId = target.id
    return { state: 'done' }
}

function followTarget(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    selection: Extract<ScenarioStep, { kind: 'follow' }>['target'],
    now: number
): GameCharacter | undefined {
    if (selection === 'reaction_target') {
        const id = run.reaction?.targetId
        return id === undefined
            ? undefined
            : visibleScenarioCharacter(actor, room, now, id)
    }
    const control = snapshotControl(actor)
    const current =
        control.mode === 'follow' && control.targetId !== null
            ? visibleScenarioCharacter(actor, room, now, control.targetId)
            : undefined
    return current !== undefined && isScenarioFriendly(actor, current, now)
        ? current
        : findFriendlyScenarioTarget(actor, room, now)
}
