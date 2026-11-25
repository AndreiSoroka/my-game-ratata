import type { GameCharacter } from './character'
import { advanceCharacterControl } from './characterControl'
import type { GameRoom } from './room'
import { executeScenarioStep } from './scenarioActions'
import type { ScenarioOutcome } from './scenarioNavigation'
import { selectScenarioReaction } from './scenarioReactions'
import {
    beginScenarioPass,
    cancelScenarioFollow,
    currentScenarioStep,
    finishScenarioSequence,
    finishScenarioStep,
    scenarioFollowActive,
    type ScenarioRuntime,
} from './scenarioState'

/** Advances at most one semantic step; only shared domain services resolve outcomes. */
export function advanceScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    now: number,
    held: boolean
): boolean {
    const deltaMs = Math.max(0, now - run.lastAt)
    run.lastAt = now
    if (run.snapshot.status !== 'running') {
        return false
    }
    run.ledger.reconcile(actor.inventory)
    if (!actor.alive) {
        cancelScenarioFollow(actor, run)
        return suspend(actor, run, 'death')
    }
    if (held) {
        return suspend(actor, run, 'conversation')
    }
    if (run.snapshot.interruption !== null) {
        run.snapshot.interruption = null
        run.step.previousDistance = Infinity
        run.step.lastPlanAt = -Infinity
    }
    if (run.passStartedAt === undefined) {
        if (now < run.startNotBefore) {
            return true
        }
        beginScenarioPass(actor, run, now)
        return advancePass(actor, run, room, now, 0)
    }
    return advancePass(actor, run, room, now, deltaMs)
}

function advancePass(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    now: number,
    deltaMs: number
): boolean {
    let selected = selectScenarioReaction(actor, run, room, now)
    if (run.snapshot.phase === 'between_passes' && !selected) {
        if (now < (run.snapshot.nextPassAt ?? now)) {
            return advanceScenarioFollow(actor, run, room, now)
        }
        if (
            run.definition.repeat !== null &&
            run.snapshot.iteration >= run.definition.repeat
        ) {
            run.snapshot.status = 'completed'
            run.snapshot.nextPassAt = null
            return advanceScenarioFollow(actor, run, room, now)
        }
        beginScenarioPass(actor, run, now)
        deltaMs = 0
        selected = selectScenarioReaction(actor, run, room, now)
    }
    if (
        actor.stunUntil > now ||
        actor.isActionLocked(now) ||
        actor.movement.dashUntil !== 0
    ) {
        return true
    }
    return advanceScenarioStep(actor, run, room, now, selected ? 0 : deltaMs)
}

function advanceScenarioStep(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    now: number,
    deltaMs: number
): boolean {
    const step = currentScenarioStep(run)
    if (step === undefined) {
        finishScenarioSequence(run, now)
        return advanceScenarioFollow(actor, run, room, now)
    }
    if (['wait', 'recover'].includes(step.kind)) {
        advanceScenarioFollow(actor, run, room, now)
    } else if (step.kind !== 'follow') {
        cancelScenarioFollow(actor, run)
    }
    const result = run.snapshot.results[run.snapshot.stepIndex]
    if (result !== undefined) {
        result.status = 'running'
    }
    const outcome = executeScenarioStep(actor, run, room, step, now, deltaMs)
    applyOutcome(actor, run, outcome, now, deltaMs)
    return true
}

function advanceScenarioFollow(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    now: number
): true {
    if (scenarioFollowActive(actor, run)) {
        advanceCharacterControl(actor, room, now)
    }
    return true
}

function applyOutcome(
    actor: GameCharacter,
    run: ScenarioRuntime,
    outcome: ScenarioOutcome,
    now: number,
    deltaMs: number
): void {
    run.snapshot.reason = outcome.reason ?? null
    if (outcome.state === 'done' || outcome.state === 'skipped') {
        finishScenarioStep(
            actor,
            run,
            now,
            outcome.state === 'done' ? 'succeeded' : 'skipped',
            outcome.reason ?? null
        )
    } else if (outcome.state === 'blocked') {
        run.snapshot.remainingFailureMs = Math.max(
            0,
            run.snapshot.remainingFailureMs - deltaMs
        )
        if (run.snapshot.remainingFailureMs === 0) {
            finishScenarioStep(
                actor,
                run,
                now,
                'failed',
                outcome.reason ?? 'Невозможно выполнить.'
            )
        }
    }
}

function suspend(
    actor: GameCharacter,
    run: ScenarioRuntime,
    reason: 'death' | 'conversation'
): true {
    run.snapshot.interruption = reason
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    return true
}
