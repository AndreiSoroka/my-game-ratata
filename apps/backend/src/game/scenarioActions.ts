import type { ScenarioStep } from '@my-game-ratata/contracts'

import { canFight } from './autoActionTargets'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { distance } from './math'
import type { GameRoom } from './room'
import { approachWorkTarget } from './scenarioApproach'
import { depositScenario } from './scenarioDeposit'
import { navigateScenario, type ScenarioOutcome } from './scenarioNavigation'
import type { ScenarioRuntime } from './scenarioState'
import { visibleScenarioTargets } from './scenarioTargets'
import { gatherScenario, pickupScenario } from './scenarioWork'

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
            stopStationary(actor)
            return visibleScenarioTargets(
                actor,
                room,
                step.target,
                step.itemId,
                now
            ).length > 0
                ? { state: 'done' }
                : {
                      state: 'blocked',
                      reason: 'Подходящая цель в области видимости не найдена.',
                  }
        case 'gather':
            return gatherScenario(actor, run, room, step, now)
        case 'pickup':
            return pickupScenario(actor, run, room, step, now)
        case 'deposit':
            return depositScenario(actor, run, room, step, now)
        case 'attack':
            return attackScenario(actor, run, room, now)
        case 'wait':
            stopStationary(actor)
            run.step.waitMs += deltaMs
            return {
                state: run.step.waitMs >= step.durationMs ? 'done' : 'waiting',
            }
        case 'recover':
            stopStationary(actor)
            return recover(actor, step)
    }
}
function stopStationary(actor: GameCharacter): void {
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
}
function recover(
    actor: GameCharacter,
    step: Extract<ScenarioStep, { kind: 'recover' }>
): ScenarioOutcome {
    const maximum =
        step.resource === 'hp'
            ? actor.maxHp
            : step.resource === 'energy'
              ? actor.config.resources.maxEnergy
              : actor.config.resources.maxMana
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
    const destination = step.destination
    if (destination.kind === 'marker') {
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
        return { state: 'blocked', reason: 'Подходящая цель больше не видна.' }
    }
    return approachWorkTarget(actor, run, room, target, now)
}
export function attackScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    now: number
): ScenarioOutcome {
    if (!canFight(actor)) {
        return {
            state: 'blocked',
            reason: 'Этот персонаж не согласен сражаться.',
        }
    }
    const prior =
        run.step.targetId === undefined
            ? undefined
            : room.getCharacter(run.step.targetId)
    if (prior !== undefined && !prior.alive) {
        return { state: 'done' }
    }
    const target = room.findVisibleTarget(actor, 240, now)
    if (target === undefined) {
        return { state: 'blocked', reason: 'Противника не видно.' }
    }
    run.step.targetId = target.id
    const nav = room.navigationFor(actor)
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    if (!isTargetInAttackRange(actor, target, nav.grid.tileWidth)) {
        return navigateScenario(
            actor,
            run,
            room,
            actor.locationId,
            target.position,
            1,
            now
        )
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    if (
        actor.isActionLocked(now) ||
        now - actor.lastAttackAt < actor.config.combat.attackCooldownMs
    ) {
        return { state: 'waiting' }
    }
    const before = actor.lastAttackAt
    room.requestAttack(actor, now, target.id)
    return actor.lastAttackAt > before
        ? { state: 'progress' }
        : { state: 'blocked', reason: 'Атака недоступна.' }
}
export function fleeScenario(
    actor: GameCharacter,
    room: GameRoom,
    target: GameCharacter
): void {
    const nav = room.navigationFor(actor)
    const dx = actor.position.x - target.position.x
    const dy = actor.position.y - target.position.y
    const magnitude = Math.max(1, Math.hypot(dx, dy))
    const candidate = nav.clampWorld({
        x: actor.position.x + (dx / magnitude) * 160,
        y: actor.position.y + (dy / magnitude) * 160,
    })
    if (actor.hasPath()) {
        return
    }
    const path = nav.findPathWorld(actor.position, candidate)
    if (path.length > 0) {
        actor.setPath(path)
    } else {
        const tile = nav.worldToTile(actor.position)
        const alternatives = nav
            .walkableNeighbors(tile)
            .map((entry) => nav.tileToWorld(entry))
            .sort(
                (a, b) =>
                    distance(b, target.position) - distance(a, target.position)
            )
        const point = alternatives[0]
        if (point !== undefined) {
            actor.setPath(nav.findPathWorld(actor.position, point))
        }
    }
}
