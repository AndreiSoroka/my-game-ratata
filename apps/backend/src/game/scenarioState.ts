import {
    SCENARIO_PASS_MS,
    type ScenarioDefinition,
    type ScenarioRunSnapshot,
    type ScenarioSequence,
    type ScenarioStep,
    type ScenarioStepResult,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl, snapshotControl } from './characterControl'
import { ScenarioLedger } from './scenarioLedger'

const stepFailureMs = 10_000

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
interface ActiveReaction {
    sequence: ScenarioSequence
    targetId: string | undefined
}
interface StepResultReceipt {
    stepId: string
    status: ScenarioStepResult['status']
    at: number
}
export type ScenarioRunReview = Readonly<
    Pick<ScenarioRunSnapshot, 'scenarioId' | 'status' | 'phase' | 'iteration'>
> & { readonly results: ReadonlyArray<Readonly<ScenarioStepResult>> }

export interface ScenarioRuntime {
    definition: ScenarioDefinition
    snapshot: ScenarioRunSnapshot
    step: ScenarioStepState
    ledger: ScenarioLedger
    lastAt: number
    startNotBefore: number
    passStartedAt: number | undefined
    lastStepResult: StepResultReceipt | undefined
    reaction: ActiveReaction | null
    followTargetId: string | undefined
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
    builtin = false,
    startNotBefore = now
): ScenarioRuntime {
    const startsNow = now >= startNotBefore
    return {
        definition: structuredClone(definition),
        snapshot: {
            scenarioId: definition.id,
            name: definition.name,
            actorId: actor.id,
            ownerId,
            status: 'running',
            phase: startsNow ? 'main' : 'between_passes',
            sequenceId: null,
            sequenceName: null,
            reactionId: null,
            nextPassAt: startsNow ? null : startNotBefore,
            stepIndex: 0,
            iteration: 1,
            remainingFailureMs: startsNow ? stepFailureMs : 0,
            reason: null,
            interruption: null,
            results: pendingResults(definition.main),
        },
        step: stepState(actor),
        ledger: new ScenarioLedger(actor.inventory),
        lastAt: now,
        startNotBefore,
        passStartedAt: startsNow ? now : undefined,
        lastStepResult: undefined,
        reaction: null,
        followTargetId: undefined,
        builtin,
    }
}

export function currentScenarioStep(
    run: ScenarioRuntime
): ScenarioStep | undefined {
    if (run.snapshot.phase === 'main') {
        return run.definition.main[run.snapshot.stepIndex]
    }
    if (run.snapshot.phase === 'reaction') {
        return run.reaction?.sequence.steps[
            run.snapshot.stepIndex - run.definition.main.length
        ]
    }
    return undefined
}

export function beginScenarioPass(
    actor: GameCharacter,
    run: ScenarioRuntime,
    now: number
): void {
    if (run.passStartedAt !== undefined) {
        run.snapshot.iteration += 1
    }
    run.passStartedAt = now
    run.reaction = null
    run.lastStepResult = undefined
    run.snapshot.phase = 'main'
    run.snapshot.stepIndex = 0
    run.snapshot.nextPassAt = null
    run.snapshot.remainingFailureMs = stepFailureMs
    run.snapshot.reason = null
    run.snapshot.results = pendingResults(run.definition.main)
    run.step = stepState(actor)
}

export function startScenarioReaction(
    actor: GameCharacter,
    run: ScenarioRuntime,
    reaction: ActiveReaction,
    reactionId: string
): void {
    const snapshot = run.snapshot
    for (const result of snapshot.results) {
        if (result.status === 'pending' || result.status === 'running') {
            result.status = 'skipped'
            result.reason = null
        }
    }
    stopScenarioPath(actor, run)
    run.reaction = reaction
    snapshot.phase = 'reaction'
    snapshot.sequenceId = reaction.sequence.id
    snapshot.sequenceName = reaction.sequence.name
    snapshot.reactionId = reactionId
    snapshot.nextPassAt = null
    snapshot.stepIndex = snapshot.results.length
    snapshot.results.push(...pendingResults(reaction.sequence.steps))
    snapshot.remainingFailureMs = stepFailureMs
    snapshot.reason = null
    run.step = stepState(actor)
}

export function finishScenarioSequence(
    run: ScenarioRuntime,
    now: number
): void {
    const snapshot = run.snapshot
    snapshot.phase = 'between_passes'
    snapshot.sequenceId = null
    snapshot.sequenceName = null
    snapshot.reactionId = null
    snapshot.remainingFailureMs = 0
    snapshot.nextPassAt = Math.max(
        now,
        (run.passStartedAt ?? now) + SCENARIO_PASS_MS
    )
    if (
        snapshot.nextPassAt === now &&
        run.definition.repeat !== null &&
        snapshot.iteration >= run.definition.repeat &&
        (run.reaction !== null || run.definition.reactions.length === 0)
    ) {
        snapshot.status = 'completed'
        snapshot.nextPassAt = null
    }
}

export function finishScenarioStep(
    actor: GameCharacter,
    run: ScenarioRuntime,
    now: number,
    status: Extract<
        ScenarioStepResult['status'],
        'succeeded' | 'failed' | 'skipped'
    >,
    reason: string | null
): void {
    const snapshot = run.snapshot
    const result = snapshot.results[snapshot.stepIndex]
    if (result !== undefined) {
        result.status = status
        result.reason = reason
        run.lastStepResult = { stepId: result.stepId, status, at: now }
        if (status === 'failed') {
            result.failures += 1
        }
    }
    snapshot.stepIndex += 1
    snapshot.remainingFailureMs = stepFailureMs
    snapshot.reason = null
    run.step = stepState(actor)
    stopScenarioPath(actor, run)
    if (currentScenarioStep(run) === undefined) {
        finishScenarioSequence(run, now)
    }
}

export function scenarioFollowActive(
    actor: GameCharacter,
    run: ScenarioRuntime
): boolean {
    if (run.followTargetId === undefined) {
        return false
    }
    const control = snapshotControl(actor)
    return control.mode === 'follow' && control.targetId === run.followTargetId
}

export function cancelScenarioFollow(
    actor: GameCharacter,
    run: ScenarioRuntime
): void {
    if (scenarioFollowActive(actor, run)) {
        cancelCharacterControl(actor)
    }
    run.followTargetId = undefined
}

export function stopScenarioPath(
    actor: GameCharacter,
    run: ScenarioRuntime
): void {
    if (!scenarioFollowActive(actor, run)) {
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
    }
}

function pendingResults(steps: readonly ScenarioStep[]): ScenarioStepResult[] {
    return steps.map((step) => ({
        stepId: step.id,
        status: 'pending',
        reason: null,
        failures: 0,
    }))
}
