import { canFight } from './autoActionTargets'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import {
    attackScenario,
    executeScenarioStep,
    fleeScenario,
} from './scenarioActions'
import type { ScenarioOutcome } from './scenarioNavigation'
import {
    finishScenarioStep,
    type ScenarioRuntime,
    stepState,
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
    run.ledger.reconcile(actor.inventory)
    if (run.snapshot.status !== 'running') {
        return false
    }
    if (!actor.alive) {
        return suspend(actor, run, 'death')
    }
    if (temporarilyLocked(actor, run, now)) {
        return true
    }
    if (handleThreat(actor, run, room, now)) {
        return true
    }
    if (held) {
        return suspend(actor, run, 'conversation')
    }
    if (run.snapshot.interruption !== null) {
        run.snapshot.interruption = null
        actor.clearPath()
        run.step.previousDistance = Infinity
        run.step.lastPlanAt = -Infinity
    }
    const step = run.definition.steps[run.snapshot.stepIndex]
    if (step === undefined) {
        return false
    }
    markRunning(run)
    const outcome = executeScenarioStep(actor, run, room, step, now, deltaMs)
    applyOutcome(actor, run, outcome, now, deltaMs)
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
    if (outcome.state === 'done') {
        finishScenarioStep(actor, run, now, true, null)
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
                false,
                outcome.reason ?? 'Невозможно выполнить.'
            )
        }
    }
}
function temporarilyLocked(
    actor: GameCharacter,
    run: ScenarioRuntime,
    now: number
): boolean {
    return (
        now < run.readyAt || actor.stunUntil > now || actor.isActionLocked(now)
    )
}
function markRunning(run: ScenarioRuntime): void {
    const result = run.snapshot.results[run.snapshot.stepIndex]
    if (result !== undefined) {
        result.status = 'running'
    }
}
function suspend(
    actor: GameCharacter,
    run: ScenarioRuntime,
    reason: 'death' | 'conversation'
): boolean {
    run.snapshot.interruption = reason
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    return true
}
function handleThreat(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    now: number
): boolean {
    const step = run.definition.steps[run.snapshot.stepIndex]
    // A deliberate combat step is already the requested response to its target.
    if (run.definition.threat === 'continue' || step?.kind === 'attack') {
        return false
    }
    const enemy = room.findVisibleTarget(actor, 240, now)
    if (enemy === undefined) {
        return false
    }
    if (run.snapshot.interruption !== 'enemy') {
        actor.clearPath()
    }
    run.snapshot.interruption = 'enemy'
    run.snapshot.reason =
        run.definition.threat === 'flee'
            ? 'Убегает от видимого противника.'
            : 'Сражается с видимым противником.'
    if (run.definition.threat === 'flee' || !canFight(actor)) {
        fleeScenario(actor, room, enemy)
    } else {
        const saved = run.step
        run.step = stepState(actor)
        attackScenario(actor, run, room, now)
        run.step = saved
    }
    return true
}
