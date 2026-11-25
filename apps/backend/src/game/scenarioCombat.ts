import type {
    AbilityClientMessage,
    ScenarioAbilityId,
    ScenarioCombatTarget,
    ScenarioStep,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import { canFight } from './autoActionTargets'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { isUtilitySpell } from './magicAbilities'
import type { GameRoom } from './room'
import { navigateScenario, type ScenarioOutcome } from './scenarioNavigation'
import { retryOutcome } from './scenarioRetries'
import type { ScenarioRuntime } from './scenarioState'
import {
    visibleScenarioCharacter,
    visibleScenarioEnemy,
} from './scenarioTargets'

export function attackScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'attack' }>,
    now: number
): ScenarioOutcome {
    if (!canFight(actor)) {
        return refusesCombat()
    }
    const pinnedId =
        step.target === 'reaction_target'
            ? run.reaction?.targetId
            : run.step.targetId
    if (step.target === 'reaction_target' && pinnedId === undefined) {
        return noEnemy()
    }
    if (
        pinnedId !== undefined &&
        run.step.targetId === pinnedId &&
        visibleScenarioCharacter(actor, room, now, pinnedId)?.alive === false
    ) {
        return { state: 'done' }
    }
    const target = visibleScenarioEnemy(actor, room, now, pinnedId)
    if (target === undefined) {
        return noEnemy()
    }
    run.step.targetId = target.id
    return performScenarioAttack(actor, run, room, target, now)
}

function performScenarioAttack(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    target: GameCharacter,
    now: number
): ScenarioOutcome {
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
    if (actor.isActionLocked(now) || actor.combat.readyAt > now) {
        return { state: 'waiting' }
    }
    const before = actor.lastAttackAt
    room.requestAttack(actor, now, target.id)
    return actor.lastAttackAt > before
        ? { state: 'progress' }
        : { state: 'blocked', reason: 'Атака недоступна.' }
}

export function castScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    step: Extract<ScenarioStep, { kind: 'cast' }>,
    now: number
): ScenarioOutcome {
    if (!knowsAbility(actor, step.abilityId)) {
        return { state: 'blocked', reason: 'Способность ещё не изучена.' }
    }
    if (
        (step.target !== 'self' || step.abilityId === 'chains') &&
        !canFight(actor)
    ) {
        return refusesCombat()
    }
    const target =
        step.target === 'self'
            ? undefined
            : castTarget(actor, run, room, step.target, now)
    if (step.target !== 'self' && target === undefined) {
        return noEnemy()
    }
    if ((actor.abilities.availableAt[step.abilityId] ?? 0) > now) {
        return { state: 'waiting' }
    }
    if (now - run.step.lastActionAt < 500) {
        return retryOutcome(run)
    }
    return performScenarioCast(actor, run, room, step.abilityId, target, now)
}

function castTarget(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    selection: ScenarioCombatTarget,
    now: number
): GameCharacter | undefined {
    const pinnedId =
        selection === 'reaction_target' ? run.reaction?.targetId : undefined
    return selection === 'reaction_target' && pinnedId === undefined
        ? undefined
        : visibleScenarioEnemy(actor, room, now, pinnedId)
}

function performScenarioCast(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    abilityId: ScenarioAbilityId,
    target: GameCharacter | undefined,
    now: number
): ScenarioOutcome {
    const message = scenarioCastMessage(actor, abilityId, target)
    if (message === undefined) {
        return noEnemy()
    }
    const events = room.requestAbility(actor, message, now)
    run.step.lastActionAt = now
    if (events.some((event) => event.kind !== 'notice')) {
        room.publishEvents(events)
        return { state: 'done' }
    }
    run.step.lastFailure =
        events.find((event) => event.kind === 'notice')?.text ??
        'Способность сейчас недоступна.'
    return retryOutcome(run)
}

function scenarioCastMessage(
    actor: GameCharacter,
    abilityId: ScenarioAbilityId,
    target: GameCharacter | undefined
): AbilityClientMessage | undefined {
    if (abilityId === 'pray_grave') {
        return {
            type: 'use_ability',
            abilityId,
            intent:
                target === undefined
                    ? { mode: 'restore', targetId: actor.id }
                    : { mode: 'harm', targetId: target.id },
        }
    }
    if (abilityId === 'ash_exhaustion') {
        return target === undefined
            ? undefined
            : { type: 'use_ability', abilityId, targetId: target.id }
    }
    return {
        type: 'use_ability',
        abilityId,
        ...(target === undefined || isUtilitySpell(abilityId)
            ? {}
            : { targetId: target.id }),
    }
}

function refusesCombat(): ScenarioOutcome {
    return { state: 'blocked', reason: 'Этот персонаж не согласен сражаться.' }
}

function noEnemy(): ScenarioOutcome {
    return { state: 'blocked', reason: 'Выбранного противника не видно.' }
}
