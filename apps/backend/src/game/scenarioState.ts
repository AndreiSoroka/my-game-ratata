import type {
    ScenarioDefinition,
    ScenarioRunSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { ScenarioLedger } from './scenarioLedger'

export interface ScenarioStepState {
    targetId?: string
    progress: number
    waitMs: number
    previousPosition: Vector2
    previousLocation: string
    previousDistance: number
    lastPlanAt: number
    lastActionAt: number
    lastFailure?: string
}
export interface ScenarioRuntime {
    definition: ScenarioDefinition
    snapshot: ScenarioRunSnapshot
    step: ScenarioStepState
    ledger: ScenarioLedger
    lastAt: number
    readyAt: number
    successes: number
    builtin: boolean
}
export function stepState(actor: GameCharacter): ScenarioStepState {
    return {
        progress: 0,
        waitMs: 0,
        previousPosition: { ...actor.position },
        previousLocation: actor.locationId,
        previousDistance: Infinity,
        lastPlanAt: -Infinity,
        lastActionAt: -Infinity,
    }
}
export function createScenarioRun(
    actor: GameCharacter,
    ownerId: string,
    definition: ScenarioDefinition,
    now: number,
    builtin = false
): ScenarioRuntime {
    return {
        definition: structuredClone(definition),
        snapshot: {
            scenarioId: definition.id,
            name: definition.name,
            actorId: actor.id,
            ownerId,
            status: 'running',
            stepIndex: 0,
            iteration: 1,
            remainingFailureMs: 10000,
            reason: null,
            interruption: null,
            results: definition.steps.map((step) => ({
                stepId: step.id,
                status: 'pending',
                reason: null,
                failures: 0,
            })),
        },
        step: stepState(actor),
        ledger: new ScenarioLedger(actor.inventory),
        lastAt: now,
        readyAt: now,
        successes: 0,
        builtin,
    }
}
export function finishScenarioStep(
    actor: GameCharacter,
    run: ScenarioRuntime,
    now: number,
    succeeded: boolean,
    reason: string | null
): void {
    const snapshot = run.snapshot
    const result = snapshot.results[snapshot.stepIndex]
    if (result !== undefined) {
        result.status = succeeded ? 'succeeded' : 'failed'
        result.reason = reason
        if (!succeeded) {
            result.failures += 1
        }
    }
    if (succeeded) {
        run.successes += 1
    }
    snapshot.stepIndex += 1
    snapshot.remainingFailureMs = 10000
    snapshot.reason = null
    run.step = stepState(actor)
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    if (snapshot.stepIndex < run.definition.steps.length) {
        return
    }
    if (
        run.definition.repeat !== null &&
        snapshot.iteration >= run.definition.repeat
    ) {
        snapshot.status = 'completed'
        return
    }
    run.readyAt = now + (run.successes === 0 ? 1000 : 50)
    run.successes = 0
    snapshot.iteration += 1
    snapshot.stepIndex = 0
}
